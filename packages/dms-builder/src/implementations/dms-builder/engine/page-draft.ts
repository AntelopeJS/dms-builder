import type {
  OpWarning,
  BlockDraft,
  MutationOpts,
  OpResult,
  PageDraft,
} from "@antelopejs/interface-dms-builder";
import {
  type ClassDeclaration,
  type Expression,
  Node,
  type PropertyDeclaration,
  type PropertyDeclarationStructure,
  type SourceFile,
} from "ts-morph";
import { blockDescriptor, isControllerLeadingBlock } from "./catalog";
import { resolveAndUnwrap, resolveExpr, unwrapBuilderChain } from "./chain";
import { type NamedConstant, objectLiteralToValue } from "./config-literal";
import { applyImportRef, blockCallText, childArgText } from "./emit";
import { getExtendsCall, stringLiteralValue } from "./literals";
import {
  applyPatch,
  checkVersion,
  commit,
  invalidConfig,
  isError,
  notFound,
  openPage,
  unsupported,
} from "./ops";
import { contentVersion } from "./page-structure";
import { syncQueries } from "./query-sync";
import { validateDraft } from "./page-draft-validation";
import { resourceRefResolver } from "./resource-index";
import {
  createImportCollector,
  type EmitContext,
  serializeValue,
  UnknownBlockTypeError,
  UnknownDataTypeError,
  UnknownReferenceError,
} from "./value";
import {
  findPageClass,
  pruneUnusedImports,
  referencedImportNames,
  Transaction,
} from "./writable";

/** Source text of every block already on the page, keyed by its draft path. */
type OriginalTexts = Map<string, string>;

/** The declaration a top-level block was written as, so a rewrite keeps it. */
type OriginalStatics = Map<string, PropertyDeclarationStructure>;

/** Named constants by where each sits, its path as `JSON.stringify` writes it. */
type ConstantsByPath = Map<string, NamedConstant>;

/**
 * The named constants a block was written with: in its own options, and in the
 * third argument of the `.child()` call placing it.
 */
interface BlockConstants {
  config: ConstantsByPath;
  meta: ConstantsByPath;
}

/** What every block already on the page was written as, by its draft path. */
interface Originals {
  texts: OriginalTexts;
  constants: Map<string, BlockConstants>;
}

/**
 * Note what a block was written as, then the same for each of its children:
 * its text, so a draft can preserve it, and the constants it named, so a
 * rewrite can put them back.
 */
function collectBlock(
  expr: Expression,
  path: string,
  originals: Originals,
  metaArg?: Node,
): void {
  originals.texts.set(path, expr.getText());
  const { chain } = resolveAndUnwrap(expr);
  if (!chain) {
    return;
  }
  if (chain.factory && chain.factoryCall) {
    const args = chain.factoryCall.getArguments();
    originals.constants.set(path, {
      config: constantsIn(
        args[isControllerLeadingBlock(chain.factory) ? 1 : 0],
      ),
      meta: constantsIn(metaArg),
    });
  }
  for (const call of chain.childCalls) {
    const [idArg, valueArg, childMeta] = call.getArguments();
    const id = stringLiteralValue(idArg);
    if (!id || !valueArg || !Node.isExpression(valueArg)) {
      continue;
    }
    collectBlock(valueArg, `${path}/${id}`, originals, childMeta);
  }
}

/** The constants among options, found where the reader resolves them. */
function constantsIn(options: Node | undefined): ConstantsByPath {
  const read =
    options && Node.isObjectLiteralExpression(options)
      ? objectLiteralToValue(options).constants
      : undefined;
  return new Map(
    (read ?? []).map((constant) => [JSON.stringify(constant.path), constant]),
  );
}

/**
 * Options with each constant they were read from put back by name, as the
 * source text the emitter writes verbatim — so a page whose author named a
 * value keeps the name through every save that did not change it.
 *
 * Only where the author wrote it, and only while the value there is still the
 * one it holds. The same value anywhere else was typed out, or set in the
 * builder, and naming it would tie it to a constant it never used.
 */
function withConstants(
  options: Record<string, unknown>,
  constants: ConstantsByPath | undefined,
): Record<string, unknown> {
  return constants?.size
    ? (namedAt(options, [], constants) as Record<string, unknown>)
    : options;
}

function namedAt(
  value: unknown,
  path: (string | number)[],
  constants: ConstantsByPath,
): unknown {
  const constant = constants.get(JSON.stringify(path));
  if (constant && constant.value === value) {
    return { $expr: constant.name };
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      namedAt(item, [...path, index], constants),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        namedAt(item, [...path, key], constants),
      ]),
    );
  }
  return value;
}

/**
 * The statics `GetPageStructure` reports as blocks — exactly those, including
 * the ones it reports opaque.
 *
 * A static the reader lists but the writer skips can never be preserved: the
 * draft asks to keep it, the writer finds no original under that name and
 * refuses the whole save, so a page holding an imported or computed block
 * becomes unsavable. A static that resolves to something that is not a block at
 * all is not listed either side, and stays untouched.
 */
function blockStatics(cls: ClassDeclaration): PropertyDeclaration[] {
  return cls
    .getStaticProperties()
    .filter((prop): prop is PropertyDeclaration =>
      Node.isPropertyDeclaration(prop),
    )
    .filter((prop) => !prop.getName().startsWith("_"))
    .filter((prop) => {
      const init = prop.getInitializer();
      if (!init) {
        return false;
      }
      const resolved = resolveExpr(init);
      if (resolved.opaqueReason || !resolved.expr) {
        return true;
      }
      return !!unwrapBuilderChain(resolved.expr).factory;
    });
}

function collectStatics(cls: ClassDeclaration): OriginalStatics {
  const statics: OriginalStatics = new Map();
  for (const prop of blockStatics(cls)) {
    const structure = prop.getStructure();
    // Every comment above the block, verbatim and in order.
    //
    // `getStructure()` reports a doc block in `docs` and ignores a plain `//`
    // or `/* */` one, which is trivia — so re-inserting the property from the
    // structure alone leaves the plain comment behind, to drift to the bottom
    // of the class. Taking all of them as trivia and clearing `docs` keeps
    // them together, in the order the author wrote them, and writes each
    // exactly once: carrying a doc block in both places writes it twice, and
    // again on every later save.
    const leading = prop
      .getLeadingCommentRanges()
      .map((range) => range.getText())
      .join("\n");
    if (leading) {
      structure.docs = [];
      structure.leadingTrivia = `${leading}\n`;
    }
    statics.set(prop.getName(), structure);
  }
  return statics;
}

function collectOriginals(cls: ClassDeclaration): Originals {
  const originals: Originals = { texts: new Map(), constants: new Map() };
  for (const prop of blockStatics(cls)) {
    const init = prop.getInitializer();
    if (init) {
      collectBlock(init, prop.getName(), originals);
    }
  }
  return originals;
}

function draftText(
  block: BlockDraft,
  path: string,
  originals: Originals,
  ctx: EmitContext,
): string {
  const preserved = originals.texts.get(path);
  if (block.preserve && preserved !== undefined) {
    return preserved;
  }
  const controllerText = block.controller
    ? serializeValue({ $ref: { resource: block.controller } }, ctx)
    : undefined;
  const base = blockCallText(
    block.type ?? "",
    withConstants(block.config ?? {}, originals.constants.get(path)?.config),
    ctx,
    controllerText,
  );
  const children = block.children ?? [];
  return (
    base +
    children
      .map((child) => {
        const childPath = `${path}/${child.name}`;
        const value = draftText(child, childPath, originals, ctx);
        // The `.child()` options as the one object they were read as, `slot`
        // and all, so a constant naming the slot goes back like any other.
        const meta = withConstants(
          { slot: child.slot, ...child.meta },
          originals.constants.get(childPath)?.meta,
        );
        return `.child(${childArgText(child.name, value, ctx, undefined, meta)})`;
      })
      .join("")
  );
}

function blockImports(block: BlockDraft, ctx: EmitContext): void {
  if (!block.preserve) {
    const descriptor = block.type ? blockDescriptor(block.type) : undefined;
    if (descriptor) {
      ctx.addImport(descriptor.import);
    }
  }
  for (const child of block.children ?? []) {
    blockImports(child, ctx);
  }
}

/**
 * Patch the page's own options in the same transaction as its blocks, so one
 * call is one typecheck and one write. Returns the failure, or nothing.
 */
/**
 * Patch the page's own options.
 *
 * The class is found again rather than passed in: rewriting the blocks removes
 * text from the file, and ts-morph forgets every node in it when that happens.
 * A node captured before the rewrite throws the moment it is read.
 */
function applyPageMeta(
  sourceFile: SourceFile,
  id: string,
  patch: Record<string, unknown>,
  ctx: EmitContext,
): OpResult<{ version: string }> | undefined {
  const cls = findPageClass(sourceFile, id);
  if (!cls) {
    return notFound<{ version: string }>(id);
  }
  const { category, ...scalar } = patch;
  if (category !== undefined) {
    // Deliberately not part of a draft save. Moving a page rewrites its file's
    // location and its registration; there is no half-applied state to hold
    // alongside a block tree the caller may still discard.
    return unsupported<{ version: string }>(
      "a page's category is moved with ConfigurePage, not as part of a block draft",
    );
  }
  const optionsArg = getExtendsCall(cls)?.getArguments()[1];
  if (!optionsArg || !Node.isObjectLiteralExpression(optionsArg)) {
    return unsupported<{ version: string }>(
      "page options are not a plain object literal",
    );
  }
  applyPatch(optionsArg, scalar, false, ctx);
  return undefined;
}

function rewriteStatics(
  cls: ClassDeclaration,
  draft: PageDraft,
  originals: Originals,
  ctx: EmitContext,
): void {
  const statics = collectStatics(cls);
  const texts = draft.blocks.map((block) => ({
    name: block.name,
    initializer: draftText(block, block.name, originals, ctx),
  }));
  const anchor = blockStatics(cls)[0];
  const position = anchor
    ? cls.getMembers().indexOf(anchor)
    : cls.getMembers().length;
  const className = cls.getName();
  // A property's leading `//` comment is trivia, not part of the node, so
  // `remove()` leaves it behind and it drifts to the bottom of the class while
  // its copy is re-inserted above the block. Take each block's comments and
  // the block itself out as one span.
  //
  // Every span is measured before anything is removed, and they are removed
  // last first, so no removal invalidates a span still to come. Nothing reads
  // a node in between: removing text forgets the whole tree.
  const sourceFile = cls.getSourceFile();
  const spans = blockStatics(cls).map((prop) => {
    const comments = prop.getLeadingCommentRanges();
    const start = comments[0]?.getPos() ?? prop.getStart();
    return [start, prop.getEnd()] as const;
  });
  for (const [start, end] of [...spans].reverse()) {
    sourceFile.removeText(start, end);
  }
  // The class node was forgotten by the text removal; find it again.
  const target =
    (className ? sourceFile.getClass(className) : undefined) ??
    sourceFile.getClasses()[0];
  if (!target) {
    return;
  }
  const inserted = target.insertProperties(
    position,
    texts.map((entry) => ({
      // A block already on the page keeps how it was declared — its doc
      // comment, its modifiers, its type annotation; only the value is ours.
      ...(statics.get(entry.name) ?? { isStatic: true }),
      name: entry.name,
      initializer: entry.initializer,
    })),
  );
  // Preserved blocks keep their original line breaks; reindent only what was
  // just written rather than reformatting the whole file.
  for (const property of inserted) {
    property.formatText();
  }
}

function emitFailure(
  error: unknown,
): OpResult<{ version: string }> | undefined {
  if (error instanceof UnknownDataTypeError) {
    return invalidConfig<{ version: string }>(
      `${error.message}; call GetCatalog for valid DataType ids`,
    );
  }
  if (error instanceof UnknownReferenceError) {
    return invalidConfig<{ version: string }>(
      `${error.message}; call ListResources for valid resource refs`,
    );
  }
  if (error instanceof UnknownBlockTypeError) {
    return invalidConfig<{ version: string }>(error.message);
  }
  return undefined;
}

export function setPageBlocks(
  ref: string,
  draft: PageDraft,
  opts?: MutationOpts,
): OpResult<{ version: string }> {
  const context = openPage(ref);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return notFound<{ version: string }>(ref);
  }
  const originals = collectOriginals(cls);
  // What the file used before the rewrite. Pruning is then limited to these:
  // an import that was already unused is the author's business, not this
  // call's, and removing it would put a change they never asked for in the
  // diff of a save.
  const referencedNames = referencedImportNames(context.sourceFile);
  const issues = validateDraft(draft, originals.texts);
  if (issues.length > 0) {
    return { ok: false, error: { code: "invalid_config", issues } };
  }
  const transaction = new Transaction(context.sourceFile.getProject());
  transaction.track(context.sourceFile);
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  try {
    rewriteStatics(cls, draft, originals, ctx);
    if (draft.page) {
      // Patched before the imports are flushed: a page option can carry a
      // value that needs one, and inside the same guard, because
      // serializing it fails the same way a block's config does.
      const patched = applyPageMeta(
        context.sourceFile,
        context.page.id,
        draft.page,
        ctx,
      );
      if (patched) {
        transaction.rollback();
        return patched;
      }
    }
  } catch (error) {
    transaction.rollback();
    const failure = emitFailure(error);
    if (failure) {
      return failure;
    }
    throw error;
  }
  for (const block of draft.blocks) {
    blockImports(block, ctx);
  }
  for (const importRef of imports) {
    applyImportRef(context.sourceFile, importRef);
  }
  // The queries go in before the commit, so a block and the data it reads are
  // one write and one typecheck. An absent `queries` leaves them alone; an empty
  // one says the page serves none.
  let warnings: OpWarning[] = [];
  if (draft.queries) {
    // Re-resolved rather than reused: rewriting the statics replaces nodes, and
    // the class captured before that is a node ts-morph has forgotten.
    const written = findPageClass(context.sourceFile, context.page.id);
    if (!written) {
      transaction.rollback();
      return notFound<{ version: string }>(ref);
    }
    const synced = syncQueries(
      {
        page: ref,
        pageFile: context.sourceFile,
        pageClass: written,
        transaction,
        blocks: draft.blocks,
      },
      draft.queries,
    );
    if ("ok" in synced) {
      transaction.rollback();
      return synced;
    }
    warnings = synced;
  }
  pruneUnusedImports(context.sourceFile, referencedNames);
  // Read after every edit: the version has to describe the file the caller
  // will hold, or the next conditional write fails as stale against itself.
  return commit(
    transaction,
    { version: contentVersion(context.sourceFile.getFullText()) },
    warnings,
  );
}

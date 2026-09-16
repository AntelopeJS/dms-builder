import type {
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
import { blockDescriptor } from "./catalog";
import { resolveAndUnwrap, resolveExpr, unwrapBuilderChain } from "./chain";
import { applyImportRef, blockCallText, childArgText } from "./emit";
import { stringLiteralValue } from "./literals";
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
import { validateDraft } from "./page-draft-validation";
import { resourceRefResolver } from "./resource-index";
import { getExtendsCall } from "./scan";
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

function collectChildTexts(
  expr: Expression,
  parentPath: string,
  texts: OriginalTexts,
): void {
  const unwrapped = resolveAndUnwrap(expr);
  if (!unwrapped.chain) {
    return;
  }
  for (const call of unwrapped.chain.childCalls) {
    const [idArg, valueArg] = call.getArguments();
    const id = stringLiteralValue(idArg);
    if (!id || !valueArg || !Node.isExpression(valueArg)) {
      continue;
    }
    const path = `${parentPath}/${id}`;
    texts.set(path, valueArg.getText());
    collectChildTexts(valueArg, path, texts);
  }
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

function collectOriginals(cls: ClassDeclaration): OriginalTexts {
  const texts: OriginalTexts = new Map();
  for (const prop of blockStatics(cls)) {
    const init = prop.getInitializer();
    if (!init) {
      continue;
    }
    texts.set(prop.getName(), init.getText());
    collectChildTexts(init, prop.getName(), texts);
  }
  return texts;
}

function draftText(
  block: BlockDraft,
  path: string,
  originals: OriginalTexts,
  ctx: EmitContext,
): string {
  const preserved = originals.get(path);
  if (block.preserve && preserved !== undefined) {
    return preserved;
  }
  const controllerText = block.controller
    ? serializeValue({ $ref: { resource: block.controller } }, ctx)
    : undefined;
  const base = blockCallText(
    block.type ?? "",
    block.config ?? {},
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
        return `.child(${childArgText(child.name, value, ctx, child.slot, child.meta)})`;
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
  originals: OriginalTexts,
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
  const issues = validateDraft(draft, originals);
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
  pruneUnusedImports(context.sourceFile, referencedNames);
  // Read after every edit: the version has to describe the file the caller
  // will hold, or the next conditional write fails as stale against itself.
  return commit(transaction, {
    version: contentVersion(context.sourceFile.getFullText()),
  });
}

// Deleting and reconfiguring blocks, then the page lifecycle: creation,
// deletion, configuration.
//
// Split out of ops.ts to stay under the size the linter allows.

import fs from "node:fs";
import path from "node:path";
import type {
  CreatePageInput,
  EditablePageMeta,
  MoveDest,
  MutationOpts,
  OpResult,
  PageRef,
} from "@antelopejs/interface-dms-builder";
import { Node, type SourceFile } from "ts-morph";
import { resolveBlockTarget } from "./block-target";
import {
  applyImportRef,
  importStatement,
  pascalCase,
  relativeModule,
} from "./emit";
import { getExtendsCall, stringLiteralValue } from "./literals";
import { parseBlockPath, valueToText } from "./paths";
import { indentationText, resolveProjectRoot } from "./project";
import {
  addSortedExport,
  barrelSpecifier,
  findNearestBarrel,
  resolveWithinSrc,
  srcDir,
} from "./placement";
import {
  type CategoryMove,
  applyCategoryMove,
  planCategoryMove,
} from "./page-category-move";
import { resourceRefResolver } from "./resource-index";
import { type CategoryRecord, joinSlug } from "./scan";
import {
  findCategoryRecord,
  findPageRecord,
  invalidateSourceIndex,
} from "./source-index";
import {
  createImportCollector,
  UnknownDataTypeError,
  UnknownReferenceError,
} from "./value";
import {
  findImporters,
  findPageClass,
  getWritableProject,
  refreshFromDisk,
  resolveRootBarrel,
  Transaction,
} from "./writable";
import {
  applyPatch,
  checkVersion,
  childArgsOf,
  clampIndex,
  commit,
  duplicate,
  invalidConfig,
  invalidDataType,
  invalidReference,
  isError,
  notFound,
  opaque,
  openPage,
  setChildren,
  unsupported,
} from "./ops";
const DMS_PAGE_MODULE = "@antelopejs/interface-dms/page";
const DMS_LAYOUTS_MODULE = "@antelopejs/interface-dms/base/layouts";
export function removeBlock(targetPath: string, opts?: MutationOpts): OpResult {
  const parsed = parseBlockPath(targetPath);
  if (!parsed) {
    return notFound(targetPath);
  }
  const context = openPage(parsed.pageRef);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return notFound(parsed.pageRef);
  }
  const transaction = new Transaction(context.sourceFile.getProject());
  transaction.track(context.sourceFile);
  if (parsed.segments.length === 1) {
    const prop = cls
      .getStaticProperties()
      .find(
        (candidate) =>
          Node.isPropertyDeclaration(candidate) &&
          candidate.getName() === parsed.segments[0],
      );
    if (!prop) {
      return notFound(targetPath);
    }
    prop.remove();
    return commit(transaction, undefined);
  }
  const parentSegments = parsed.segments.slice(0, -1);
  const childId = parsed.segments[parsed.segments.length - 1];
  const resolved = resolveBlockTarget(cls, parentSegments);
  if (!resolved.ok) {
    return resolved.reason === "not_found"
      ? notFound(targetPath)
      : opaque(targetPath);
  }
  const index = resolved.target.childCalls.findIndex(
    (call) => stringLiteralValue(call.getArguments()[0]) === childId,
  );
  if (index < 0) {
    return notFound(targetPath);
  }
  const args = childArgsOf(resolved.target);
  args.splice(index, 1);
  setChildren(resolved.target, args);
  return commit(transaction, undefined);
}

export function moveBlock(
  targetPath: string,
  dest: MoveDest,
  opts?: MutationOpts,
): OpResult {
  const parsed = parseBlockPath(targetPath);
  if (!parsed || parsed.segments.length < 2 || !dest.parent) {
    return unsupported(
      "moveBlock v1 supports moving a child block into a container",
    );
  }
  const context = openPage(parsed.pageRef);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return notFound(parsed.pageRef);
  }
  const sourceParentSegments = parsed.segments.slice(0, -1);
  const childId = parsed.segments[parsed.segments.length - 1];
  const source = resolveBlockTarget(cls, sourceParentSegments);
  if (!source.ok) {
    return source.reason === "not_found"
      ? notFound(targetPath)
      : opaque(targetPath);
  }
  const sourceIndex = source.target.childCalls.findIndex(
    (call) => stringLiteralValue(call.getArguments()[0]) === childId,
  );
  if (sourceIndex < 0) {
    return notFound(targetPath);
  }
  const destParsed = parseBlockPath(dest.parent);
  if (!destParsed) {
    return notFound(dest.parent);
  }
  const transaction = new Transaction(context.sourceFile.getProject());
  transaction.track(context.sourceFile);
  const args = childArgsOf(source.target);
  const [moved] = args.splice(sourceIndex, 1);
  if (destParsed.segments.join("/") === sourceParentSegments.join("/")) {
    const { index, warnings } = clampIndex(dest.index, args.length);
    args.splice(index, 0, moved);
    setChildren(source.target, args);
    return commit(transaction, undefined, warnings);
  }
  setChildren(source.target, args);
  const destResolved = resolveBlockTarget(cls, destParsed.segments);
  if (!destResolved.ok || !destResolved.target.editable) {
    transaction.rollback();
    return destResolved.ok === false && destResolved.reason === "not_found"
      ? notFound(dest.parent)
      : opaque(dest.parent);
  }
  const destArgs = childArgsOf(destResolved.target);
  const { index, warnings } = clampIndex(dest.index, destArgs.length);
  destArgs.splice(index, 0, moved);
  setChildren(destResolved.target, destArgs);
  return commit(transaction, undefined, warnings);
}

function buildPageSource(
  input: CreatePageInput,
  category: CategoryRecord,
  filepath: string,
): string {
  const className = `${pascalCase(input.name)}Page`;
  const options = [`displayName: ${JSON.stringify(input.displayName)}`];
  let categoryImport = "";
  if (category.moduleId) {
    options.push(`module: ${JSON.stringify(category.moduleId)}`);
  } else if (category.importName && category.importModule) {
    const spec = category.importModule.endsWith(".ts")
      ? relativeModule(filepath, category.importModule)
      : category.importModule;
    categoryImport = `import { ${category.importName} } from ${JSON.stringify(spec)};\n`;
    options.push(`category: ${category.importName}`);
  }
  if (input.icon) {
    options.push(`icon: ${JSON.stringify(input.icon)}`);
  }
  if (input.order !== undefined) {
    options.push(`order: ${input.order}`);
  }
  if (input.description) {
    options.push(`description: ${JSON.stringify(input.description)}`);
  }
  if (input.permission !== undefined) {
    options.push(`permission: ${valueToText(input.permission)}`);
  }
  // A page with no layout renders bare: the DMS has no default to fall back
  // on, so it comes up without the dashboard's sidebar, header or content
  // container. Every hand-written page passes one; a generated one must too.
  const indent = indentationText(resolveProjectRoot());
  const imports = [
    importStatement(
      ["PageController", "RegisterPage"],
      DMS_PAGE_MODULE,
      indent,
    ),
    importStatement(["DefaultLayout"], DMS_LAYOUTS_MODULE, indent),
  ].join("\n");
  const optionLines = options
    .map((option) => `${indent}${indent}${option},`)
    .join("\n");
  return `${imports}\n${categoryImport}\n@RegisterPage()\nexport class ${className} extends PageController(\n${indent}${JSON.stringify(input.name)},\n${indent}{\n${optionLines}\n${indent}},\n${indent}DefaultLayout({ fullWidth: true }),\n) {}\n`;
}

interface PagePlacement {
  filepath: string;
  barrel: SourceFile;
  wire: () => void;
}

function placeByDir(
  project: ReturnType<typeof getWritableProject>,
  dir: string,
  name: string,
): PagePlacement | undefined {
  const src = srcDir(project);
  if (!src) {
    return undefined;
  }
  const resolved = resolveWithinSrc(src, dir);
  if (resolved === undefined) {
    return undefined;
  }
  const barrel = findNearestBarrel(project, resolved);
  if (!barrel) {
    return undefined;
  }
  return {
    filepath: path.join(resolved, name, "page.ts"),
    barrel,
    wire: () =>
      addSortedExport(
        barrel,
        barrelSpecifier(barrel, path.join(resolved, name, "page")),
      ),
  };
}

function resolvePagePlacement(
  project: ReturnType<typeof getWritableProject>,
  category: CategoryRecord,
  name: string,
  dir?: string,
): PagePlacement | undefined {
  if (dir !== undefined) {
    return placeByDir(project, dir, name);
  }
  if (category.importModule?.endsWith(".ts")) {
    const categoryDir = path.dirname(category.importModule);
    const categoryBarrel = project.getSourceFile(
      path.join(categoryDir, "index.ts"),
    );
    if (categoryBarrel) {
      return {
        filepath: path.join(categoryDir, name, "page.ts"),
        barrel: categoryBarrel,
        wire: () => addSortedExport(categoryBarrel, `./${name}/page`),
      };
    }
  }
  const root = resolveRootBarrel(project);
  if (!root) {
    return undefined;
  }
  return {
    filepath: path.join(path.dirname(root.getFilePath()), `${name}.ts`),
    barrel: root,
    wire: () => root.addImportDeclaration({ moduleSpecifier: `./${name}` }),
  };
}

/**
 * A name that can safely be a directory, a URL segment and part of a class
 * name. It is all three at once, so a space or a slash in it produces a folder
 * that is awkward to handle and a route that has to be escaped to be linked.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugError<T>(
  name: string,
  kind: "page" | "category",
): OpResult<T> | undefined {
  if (SLUG.test(name)) {
    return undefined;
  }
  const suggestion = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return invalidConfig<T>(
    `"${name}" cannot name a ${kind}: it becomes a folder, a route and a class name, so it must be lowercase letters, digits and dashes${suggestion ? ` — try "${suggestion}"` : ""}`,
  );
}

export function createPage(
  input: CreatePageInput,
): OpResult<{ ref: PageRef; filepath: string }> {
  const invalid = slugError<{ ref: PageRef; filepath: string }>(
    input.name,
    "page",
  );
  if (invalid) {
    return invalid;
  }
  const category = findCategoryRecord(input.category);
  if (!category) {
    return notFound<{ ref: PageRef; filepath: string }>(input.category);
  }
  const ref = joinSlug(category.fullSlug, input.name);
  if (findPageRecord(ref)) {
    return duplicate<{ ref: PageRef; filepath: string }>(input.name, "page");
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const placement = resolvePagePlacement(
    project,
    category,
    input.name,
    input.dir,
  );
  if (!placement) {
    return unsupported<{ ref: PageRef; filepath: string }>(
      "could not resolve a barrel to register the new page",
    );
  }
  if (fs.existsSync(placement.filepath)) {
    return duplicate<{ ref: PageRef; filepath: string }>(input.name, "page");
  }
  const transaction = new Transaction(project);
  transaction.track(placement.barrel);
  const sourceFile = project.createSourceFile(
    placement.filepath,
    buildPageSource(input, category, placement.filepath),
  );
  transaction.track(sourceFile, true);
  placement.wire();
  return commit(transaction, { ref, filepath: placement.filepath });
}

export function deletePage(ref: string, opts?: MutationOpts): OpResult {
  const page = findPageRecord(ref);
  if (!page) {
    return notFound(ref);
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const sourceFile = project.getSourceFile(page.filepath);
  if (!sourceFile) {
    return notFound(page.filepath);
  }
  const stale = checkVersion(sourceFile, opts);
  if (stale) {
    return stale;
  }
  const transaction = new Transaction(project);
  for (const importer of findImporters(project, page.filepath)) {
    transaction.track(importer.getSourceFile());
    importer.remove();
  }
  transaction.trackDelete(sourceFile);
  return commit(transaction, undefined);
}

export function configurePage(
  ref: string,
  patch: Partial<EditablePageMeta>,
  opts?: MutationOpts,
): OpResult<{ ref: string }> {
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
    return notFound(ref);
  }
  const call = getExtendsCall(cls);
  const optionsArg = call?.getArguments()[1];
  if (!optionsArg || !Node.isObjectLiteralExpression(optionsArg)) {
    return unsupported("page options are not a plain object literal");
  }
  const { category, ...scalar } = patch;
  let move: CategoryMove | undefined;
  if (category !== undefined) {
    const planned = planCategoryMove(ref, context.page, category);
    if ("ok" in planned) {
      return planned;
    }
    move = planned;
  }
  const project = context.sourceFile.getProject();
  const transaction = new Transaction(project);
  transaction.track(context.sourceFile);
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  try {
    applyPatch(optionsArg, scalar as Record<string, unknown>, false, ctx);
  } catch (error) {
    transaction.rollback();
    if (error instanceof UnknownDataTypeError) {
      return invalidDataType(error);
    }
    if (error instanceof UnknownReferenceError) {
      return invalidReference(error);
    }
    throw error;
  }
  for (const importRef of imports) {
    applyImportRef(context.sourceFile, importRef);
  }
  if (move) {
    applyCategoryMove(
      project,
      context.sourceFile,
      optionsArg,
      move,
      transaction,
    );
  }
  const newRef = move?.newRef ?? ref;
  const result = commit(transaction, { ref: newRef });
  if (result.ok && newRef !== ref) {
    invalidateSourceIndex();
    result.warnings = [
      ...(result.warnings ?? []),
      {
        code: "route_changed",
        message: `the page's route is now "${newRef}"; it was "${ref}", and nothing redirects the old one`,
      },
    ];
  }
  return result;
}

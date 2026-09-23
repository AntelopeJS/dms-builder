import path from "node:path";
import type { ImportRef } from "@antelopejs/interface-dms-builder";
import type { ImportDeclaration, SourceFile } from "ts-morph";
import { propertyKey } from "./paths";
import { type EmitContext, inlineOrBlock, serializeValue } from "./value";

function importedNames(sourceFile: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const decl of sourceFile.getImportDeclarations()) {
    const def = decl.getDefaultImport();
    if (def) {
      names.add(def.getText());
    }
    const namespace = decl.getNamespaceImport();
    if (namespace) {
      names.add(namespace.getText());
    }
    for (const named of decl.getNamedImports()) {
      names.add(named.getAliasNode()?.getText() ?? named.getName());
    }
  }
  return names;
}

export function ensureNamedImport(
  sourceFile: SourceFile,
  name: string,
  moduleSpecifier: string,
): void {
  const rootName = name.split(".")[0];
  // Already bound in this file — possibly from another specifier. Adding a
  // second binding raises a spurious "Duplicate identifier" that buries the
  // real diagnostic when the op is otherwise invalid.
  if (importedNames(sourceFile).has(rootName)) {
    return;
  }
  const decl = sourceFile
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (!decl) {
    insertSortedImport(sourceFile, moduleSpecifier, rootName);
    return;
  }
  insertSortedNamedImport(decl, rootName);
}

/** Add a name to an existing import, alphabetically among its siblings. */
function insertSortedNamedImport(
  declaration: ImportDeclaration,
  name: string,
): void {
  const after = declaration
    .getNamedImports()
    .find((entry) => name < entry.getName());
  if (!after) {
    declaration.addNamedImport(name);
    return;
  }
  declaration.insertNamedImport(after.getChildIndex(), name);
}

/**
 * How a formatter orders imports: packages before relative paths, alphabetical
 * within each. Used to place a new one rather than append it — appending leaves
 * the file unsorted, and the next `format` reorders a file the author never
 * touched, putting a change they did not ask for in the same diff.
 */
function importRank(specifier: string): [number, string] {
  return [specifier.startsWith(".") ? 1 : 0, specifier];
}

function sortsBefore(a: string, b: string): boolean {
  const [groupA, textA] = importRank(a);
  const [groupB, textB] = importRank(b);
  return groupA !== groupB ? groupA < groupB : textA < textB;
}

function insertSortedImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  name: string,
): void {
  const after = sourceFile
    .getImportDeclarations()
    .find((entry) =>
      sortsBefore(moduleSpecifier, entry.getModuleSpecifierValue()),
    );
  const structure = { moduleSpecifier, namedImports: [name] };
  if (!after) {
    sourceFile.addImportDeclaration(structure);
    return;
  }
  sourceFile.insertImportDeclaration(after.getChildIndex(), structure);
}

function importSpecifier(
  sourceFile: SourceFile,
  ref: ImportRef,
): string | undefined {
  if (ref.module) {
    return ref.module;
  }
  if (!ref.targetFile || ref.targetFile === sourceFile.getFilePath()) {
    return undefined;
  }
  return relativeModule(sourceFile.getFilePath(), ref.targetFile);
}

export function applyImportRef(sourceFile: SourceFile, ref: ImportRef): void {
  const specifier = importSpecifier(sourceFile, ref);
  if (specifier === undefined) {
    return;
  }
  ensureNamedImport(sourceFile, ref.name, specifier);
}

export function relativeModule(fromFile: string, toFile: string): string {
  const rel = path
    .relative(path.dirname(fromFile), toFile)
    .replace(/\\/g, "/")
    .replace(/\.tsx?$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function objectText(config: Record<string, unknown>, ctx: EmitContext): string {
  const entries = Object.entries(config).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) {
    return "";
  }
  return inlineOrBlock(
    entries.map(
      ([key, value]) => `${propertyKey(key)}: ${serializeValue(value, ctx)}`,
    ),
    "{",
    "}",
  );
}

export function blockCallText(
  type: string,
  config: Record<string, unknown>,
  ctx: EmitContext,
  controllerText?: string,
): string {
  const options = objectText(config, ctx);
  if (controllerText !== undefined) {
    return options
      ? `${type}(${controllerText}, ${options})`
      : `${type}(${controllerText})`;
  }
  return `${type}(${options})`;
}

export function childArgText(
  id: string,
  valueText: string,
  ctx: EmitContext,
  slot?: string,
  meta?: Record<string, unknown>,
): string {
  const entries: Record<string, unknown> = {};
  if (slot !== undefined) entries.slot = slot;
  const metaText = objectText({ ...entries, ...meta }, ctx);
  return `${JSON.stringify(id)}, ${valueText}${metaText ? `, ${metaText}` : ""}`;
}

export function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

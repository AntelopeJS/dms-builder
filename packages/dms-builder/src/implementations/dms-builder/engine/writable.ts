import fs from "node:fs";
import path from "node:path";
import type {
  FileChange,
  TypecheckError,
} from "@antelopejs/interface-dms-builder";
import {
  type ClassDeclaration,
  type Diagnostic,
  type ExportDeclaration,
  type ImportDeclaration,
  type ImportSpecifier,
  type Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { stringLiteralValue } from "./literals";
import { createProject, resolveProjectRoot } from "./project";
import { getCalleeName, getExtendsCall } from "./scan";

let writable: Project | undefined;

export function getWritableProject(): Project {
  if (!writable) {
    writable = createProject(resolveProjectRoot());
  }
  return writable;
}

export function refreshFromDisk(project: Project): void {
  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.isInNodeModules()) {
      sourceFile.refreshFromFileSystemSync();
    }
  }
}

export function resolveRootBarrel(project: Project): SourceFile | undefined {
  const root = resolveProjectRoot();
  const candidates = [
    path.join(root, "src/index.ts"),
    path.join(root, "index.ts"),
  ];
  for (const candidate of candidates) {
    const file = project.getSourceFile(candidate);
    if (file) {
      return file;
    }
  }
  return undefined;
}

export function findImporters(
  project: Project,
  targetPath: string,
): Array<ImportDeclaration | ExportDeclaration> {
  const importers: Array<ImportDeclaration | ExportDeclaration> = [];
  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.isInNodeModules()) {
      continue;
    }
    const declarations = [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ];
    for (const decl of declarations) {
      if (decl.getModuleSpecifierSourceFile()?.getFilePath() === targetPath) {
        importers.push(decl);
      }
    }
  }
  return importers;
}

/** Whether a declaration binds any name at all, rather than only loading a module. */
function bindsNothing(declaration: ImportDeclaration): boolean {
  return (
    declaration.getNamedImports().length === 0 &&
    !declaration.getDefaultImport() &&
    !declaration.getNamespaceImport()
  );
}

/**
 * The names the file binds through its named imports, before a rewrite. Pass
 * the result back to {@link pruneUnusedImports} so it drops only what the
 * rewrite orphaned.
 */
export function referencedImportNames(sourceFile: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    for (const specifier of declaration.getNamedImports()) {
      if (isReferenced(sourceFile, specifier)) {
        names.add(specifier.getAliasNode()?.getText() ?? specifier.getName());
      }
    }
  }
  return names;
}

function isReferenced(
  sourceFile: SourceFile,
  specifier: ImportSpecifier,
): boolean {
  return specifier
    .getNameNode()
    .findReferencesAsNodes()
    .some(
      (node) =>
        node.getSourceFile() === sourceFile &&
        node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) === undefined,
    );
}

/**
 * Drops named imports the rewrite just orphaned. A whole-tree rewrite can
 * remove the last user of a factory, and a dangling import would otherwise stay
 * behind in the file the builder wrote.
 *
 * `used` names what the file referenced beforehand, and nothing outside it is
 * touched: an import that was already unused belongs to the author, and
 * deleting it would put a change they never asked for in the diff of a save. A
 * declaration that binds nothing is a deliberate side-effect import and is left
 * alone whether or not it started out empty.
 */
export function pruneUnusedImports(
  sourceFile: SourceFile,
  used: Set<string>,
): void {
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (bindsNothing(declaration)) {
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
      const name = specifier.getAliasNode()?.getText() ?? specifier.getName();
      if (used.has(name) && !isReferenced(sourceFile, specifier)) {
        specifier.remove();
      }
    }
    if (bindsNothing(declaration)) {
      declaration.remove();
    }
  }
}

export function findPageClass(
  sourceFile: SourceFile,
  id: string,
): ClassDeclaration | undefined {
  for (const cls of sourceFile.getClasses()) {
    const call = getExtendsCall(cls);
    if (!call || getCalleeName(call) !== "PageController") {
      continue;
    }
    if (stringLiteralValue(call.getArguments()[0]) === id) {
      return cls;
    }
  }
  return undefined;
}

function diagnosticToError(diagnostic: Diagnostic): TypecheckError {
  const message = diagnostic.getMessageText();
  return {
    file: diagnostic.getSourceFile()?.getFilePath() ?? "",
    line: diagnostic.getLineNumber() ?? 0,
    message: typeof message === "string" ? message : message.getMessageText(),
  };
}

function relevantDiagnostics(project: Project): TypecheckError[] {
  return project
    .getPreEmitDiagnostics()
    .filter((diagnostic) => {
      const file = diagnostic.getSourceFile();
      return file !== undefined && !file.isInNodeModules();
    })
    .map(diagnosticToError);
}

function diffText(before: string, after: string): string {
  if (before === after) {
    return "";
  }
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start++;
  }
  let endOld = oldLines.length - 1;
  let endNew = newLines.length - 1;
  while (
    endOld >= start &&
    endNew >= start &&
    oldLines[endOld] === newLines[endNew]
  ) {
    endOld--;
    endNew--;
  }
  const removed = oldLines.slice(start, endOld + 1).map((line) => `- ${line}`);
  const added = newLines.slice(start, endNew + 1).map((line) => `+ ${line}`);
  return `@@ line ${start + 1} @@\n${[...removed, ...added].join("\n")}`;
}

type ChangeKind = "create" | "modify" | "delete";

interface TouchedFile {
  path: string;
  before?: string;
  kind: ChangeKind;
}

/**
 * Drop the directory a deleted file leaves behind, when nothing else is in it.
 *
 * A page lives in a directory of its own, so removing the file alone leaves an
 * empty folder in the author's tree for every page deleted or moved. Anything
 * still inside — a sibling file, another page — keeps it.
 */
function removeEmptyDirectory(dir: string): void {
  try {
    if (fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
    }
  } catch {
    // Already gone, or not ours to remove. Leaving it costs nothing.
  }
}

export class Transaction {
  private readonly touched = new Map<string, TouchedFile>();

  constructor(private readonly project: Project) {}

  public track(sourceFile: SourceFile, isNew = false): void {
    const filePath = sourceFile.getFilePath();
    if (!this.touched.has(filePath)) {
      this.touched.set(filePath, {
        path: filePath,
        before: isNew ? undefined : sourceFile.getFullText(),
        kind: isNew ? "create" : "modify",
      });
    }
  }

  public trackDelete(sourceFile: SourceFile): void {
    const filePath = sourceFile.getFilePath();
    this.touched.set(filePath, {
      path: filePath,
      before: sourceFile.getFullText(),
      kind: "delete",
    });
    this.project.removeSourceFile(sourceFile);
  }

  public typecheckErrors(): TypecheckError[] {
    return relevantDiagnostics(this.project);
  }

  public rollback(): void {
    for (const entry of this.touched.values()) {
      if (entry.kind === "delete") {
        this.project.addSourceFileAtPathIfExists(entry.path);
        continue;
      }
      const sourceFile = this.project.getSourceFile(entry.path);
      if (!sourceFile) {
        continue;
      }
      if (entry.kind === "create") {
        this.project.removeSourceFile(sourceFile);
      } else if (entry.before !== undefined) {
        sourceFile.replaceWithText(entry.before);
      }
    }
  }

  public flush(): FileChange[] {
    const changes: FileChange[] = [];
    for (const entry of this.touched.values()) {
      if (entry.kind === "delete") {
        fs.rmSync(entry.path, { force: true });
        removeEmptyDirectory(path.dirname(entry.path));
        changes.push({ path: entry.path, kind: "delete", diff: "" });
        continue;
      }
      const sourceFile = this.project.getSourceFile(entry.path);
      if (!sourceFile) {
        continue;
      }
      const after = sourceFile.getFullText();
      sourceFile.saveSync();
      changes.push({
        path: entry.path,
        kind: entry.kind,
        diff: diffText(entry.before ?? "", after),
      });
    }
    return changes;
  }
}

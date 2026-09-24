// The category lifecycle: source, creation, opening the declaration, and
// configuration.
//
// Split out of ops-blocks.ts to stay under the size the linter allows.

import fs from "node:fs";
import path from "node:path";
import type {
  CategoryRef,
  CreateCategoryInput,
  EditableCategoryMeta,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import { Node } from "ts-morph";
import { applyImportRef, importStatement, relativeModule } from "./emit";
import { slugError } from "./ops-blocks";
import { indentationText, resolveProjectRoot } from "./project";
import { resourceRefResolver } from "./resource-index";
import { type CategoryRecord, DMS_PAGE_MODULE } from "./scan";
import {
  findCategoryRecord,
  listCategoryRecords,
  listPageRecords,
} from "./source-index";
import {
  createImportCollector,
  UnknownDataTypeError,
  UnknownReferenceError,
} from "./value";
import {
  findImporters,
  getWritableProject,
  holdsOnlyImports,
  refreshFromDisk,
  resolveRootBarrel,
  Transaction,
} from "./writable";
import {
  applyPatch,
  commit,
  duplicate,
  invalidDataType,
  invalidReference,
  notFound,
  unsupported,
} from "./ops";
function buildCategorySource(
  input: CreateCategoryInput,
  parent: CategoryRecord | undefined,
  filepath: string,
): string {
  const constName = `${input.name.replace(/[^A-Za-z0-9]/g, "")}Category`;
  const parentName = parent?.importName ?? "pagesCategory";
  const parentModuleRaw = parent?.importModule ?? DMS_PAGE_MODULE;
  const parentSpec = parentModuleRaw.endsWith(".ts")
    ? relativeModule(filepath, parentModuleRaw)
    : parentModuleRaw;
  const imports = new Map<string, Set<string>>();
  const add = (specifier: string, name: string) => {
    const set = imports.get(specifier) ?? new Set<string>();
    set.add(name);
    imports.set(specifier, set);
  };
  add(DMS_PAGE_MODULE, "Category");
  add(parentSpec, parentName);
  const options = [
    `displayName: ${JSON.stringify(input.displayName)}`,
    `category: ${parentName}`,
  ];
  if (input.icon) {
    options.push(`icon: ${JSON.stringify(input.icon)}`);
  }
  if (input.order !== undefined) {
    options.push(`order: ${input.order}`);
  }
  const indent = indentationText(resolveProjectRoot());
  const importText = [...imports]
    .map(([specifier, names]) => importStatement([...names], specifier, indent))
    .join("\n");
  const optionsText = options.map((option) => `${indent}${option},`).join("\n");
  return `${importText}\n\nexport const ${constName} = Category(${JSON.stringify(input.name)}, {\n${optionsText}\n});\n`;
}

export function createCategory(
  input: CreateCategoryInput,
): OpResult<{ ref: CategoryRef }> {
  const invalid = slugError<{ ref: CategoryRef }>(input.name, "category");
  if (invalid) {
    return invalid;
  }
  const parent = input.parent ? findCategoryRecord(input.parent) : undefined;
  if (input.parent && !parent) {
    return notFound<{ ref: CategoryRef }>(input.parent);
  }
  const ref = `${parent?.ref ?? "pages"}.${input.name}`;
  if (findCategoryRecord(ref)) {
    return duplicate<{ ref: CategoryRef }>(input.name, "category");
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const barrel = resolveRootBarrel(project);
  if (!barrel) {
    return unsupported<{ ref: CategoryRef }>(
      "no root barrel (src/index.ts) found",
    );
  }
  const filepath = path.join(
    path.dirname(barrel.getFilePath()),
    `${input.name}.category.ts`,
  );
  if (fs.existsSync(filepath)) {
    return duplicate<{ ref: CategoryRef }>(input.name, "category");
  }
  const transaction = new Transaction(project);
  transaction.track(barrel);
  const sourceFile = project.createSourceFile(
    filepath,
    buildCategorySource(input, parent, filepath),
  );
  transaction.track(sourceFile, true);
  barrel.addImportDeclaration({ moduleSpecifier: `./${input.name}.category` });
  return commit(transaction, { ref });
}

function openCategoryDeclaration(category: CategoryRecord) {
  if (
    !category.importName ||
    !category.importModule ||
    !category.importModule.endsWith(".ts")
  ) {
    return undefined;
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const sourceFile = project.getSourceFile(category.importModule);
  const decl = sourceFile?.getVariableDeclaration(category.importName);
  if (!sourceFile || !decl) {
    return undefined;
  }
  return { sourceFile, decl };
}

export function configureCategory(
  ref: string,
  patch: Partial<EditableCategoryMeta>,
): OpResult {
  const category = findCategoryRecord(ref);
  if (!category) {
    return notFound(ref);
  }
  const opened = openCategoryDeclaration(category);
  if (!opened) {
    return unsupported("category is built-in or not editable from source");
  }
  const init = opened.decl.getInitializer();
  const optionsArg =
    init && Node.isCallExpression(init) ? init.getArguments()[1] : undefined;
  if (!optionsArg || !Node.isObjectLiteralExpression(optionsArg)) {
    return unsupported("category options are not a plain object literal");
  }
  const { parent, ...scalar } = patch;
  if (parent !== undefined) {
    return unsupported("changing a category's parent is not supported in v1");
  }
  const transaction = new Transaction(opened.sourceFile.getProject());
  transaction.track(opened.sourceFile);
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
    applyImportRef(opened.sourceFile, importRef);
  }
  return commit(transaction, undefined);
}

export function deleteCategory(ref: string): OpResult {
  const category = findCategoryRecord(ref);
  if (!category) {
    return notFound(ref);
  }
  const blockedBy = [
    ...listPageRecords()
      .filter(
        (page) =>
          page.categoryRef === ref || page.categoryRef.startsWith(`${ref}.`),
      )
      .map((page) => page.ref),
    ...listCategoryRecords()
      .filter((child) => child.parentRef === ref)
      .map((child) => child.ref),
  ];
  if (blockedBy.length > 0) {
    return { ok: false, error: { code: "referential_integrity", blockedBy } };
  }
  const opened = openCategoryDeclaration(category);
  if (!opened) {
    return unsupported("category is built-in or not editable from source");
  }
  const statement = opened.decl.getVariableStatement();
  if (!statement) {
    return notFound(ref);
  }
  const project = opened.sourceFile.getProject();
  const transaction = new Transaction(project);
  transaction.track(opened.sourceFile);
  statement.remove();
  // Left behind, the empty file and its barrel import would collide with a
  // later CreateCategory of the same name.
  if (holdsOnlyImports(opened.sourceFile)) {
    for (const importer of findImporters(
      project,
      opened.sourceFile.getFilePath(),
    )) {
      transaction.track(importer.getSourceFile());
      importer.remove();
    }
    transaction.trackDelete(opened.sourceFile);
  }
  return commit(transaction, undefined);
}

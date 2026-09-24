// Deleting a resource, and cleaning up the directories it leaves empty.
//
// Split out of resource-ops.ts to stay under the size the linter allows.

import fs from "node:fs";
import path from "node:path";
import type {
  DeleteResourceOpts,
  FieldAspects,
  FieldSpec,
  MutationOpts,
  OpResult,
  OpWarning,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import { Node, type SourceFile } from "ts-morph";
import { applyImportRef, ensureNamedImport } from "./emit";
import { dropResourceData } from "./resource-data";
import { findResourceRecord, resourceRefResolver } from "./resource-index";
import {
  indexedFieldNames,
  readDataApiFieldAspects,
  tableFieldDeclarations,
} from "./resource-structure";
import {
  createImportCollector,
  type EmitContext,
  UnknownDataTypeError,
} from "./value";
import { findImporters, Transaction } from "./writable";
import { commit, duplicate, invalidConfig, invalidDataType } from "./ops";
import {
  openResource,
  parseFieldPath,
  refError,
  reservedFieldError,
} from "./resource-ops";
import {
  dataApiFieldText,
  decoratorImport,
  tableFieldText,
} from "./resource-emit-types";
import { contentVersion } from "./page-structure";
import { routeMapExpr, TABLE_VIEW_MODULE } from "./resource-emit";
import { getExtendsCall } from "./literals";
function resourceVersion(
  databaseFile: SourceFile,
  dataApiFile: SourceFile,
): string {
  return contentVersion(databaseFile.getFullText() + dataApiFile.getFullText());
}
function checkVersion(
  ref: string,
  databaseFile: SourceFile,
  dataApiFile: SourceFile,
  opts?: MutationOpts,
): OpResult<never> | undefined {
  if (!opts?.expectedVersion) {
    return undefined;
  }
  const current = resourceVersion(databaseFile, dataApiFile);
  if (current !== opts.expectedVersion) {
    return {
      ok: false,
      error: { code: "stale", ref, currentVersion: current },
    };
  }
  return undefined;
}
function notFound<T = void>(ref: string): OpResult<T> {
  return { ok: false, error: { code: "not_found", ref } };
}
export async function deleteResource(
  ref: string,
  opts?: DeleteResourceOpts,
): Promise<OpResult> {
  const record = findResourceRecord(ref);
  if (!record) {
    return notFound(ref);
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound(ref);
  }
  const stale = checkVersion(
    ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  const indexFile = opened.project.getSourceFile(record.indexFile);
  const transaction = new Transaction(opened.project);
  for (const importer of findImporters(opened.project, record.indexFile)) {
    transaction.track(importer.getSourceFile());
    importer.remove();
  }
  transaction.trackDelete(opened.databaseFile);
  transaction.trackDelete(opened.dataApiFile);
  if (indexFile) {
    transaction.trackDelete(indexFile);
  }
  const result = commit(transaction, undefined);
  if (!result.ok) {
    return result;
  }
  removeEmptyDir(path.dirname(record.databaseFile));
  if (opts?.keepData) {
    return result;
  }
  const failure = await dropResourceData(record.schema, record.tableName);
  if (!failure) {
    return result;
  }
  return {
    ...result,
    warnings: [
      ...(result.warnings ?? []),
      {
        code: "data_not_dropped",
        message: `could not delete table data for "${ref}" (${failure}); it may retain stale documents`,
      },
    ],
  };
}

function removeEmptyDir(dir: string): void {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

function applyFieldImports(sourceFile: SourceFile, symbols: string[]): void {
  for (const symbol of symbols) {
    applyImportRef(sourceFile, decoratorImport(symbol));
  }
}

function buildFieldText(
  spec: FieldSpec,
  ctx: EmitContext,
): {
  table: string;
  tableSymbols: string[];
  api: string;
  apiSymbols: string[];
  warnings: OpWarning[];
} {
  const table = tableFieldText(spec);
  const api = dataApiFieldText(spec, ctx);
  return {
    table: table.text.trim(),
    tableSymbols: table.symbols,
    api: api.text.trim(),
    apiSymbols: api.symbols,
    warnings: table.warnings,
  };
}

export function addField(
  ref: string,
  spec: FieldSpec,
  opts?: MutationOpts,
): OpResult<{ path: string }> {
  const reserved = reservedFieldError<{ path: string }>(spec.name);
  if (reserved) {
    return reserved;
  }
  const record = findResourceRecord(ref);
  if (!record) {
    return notFound<{ path: string }>(ref);
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound<{ path: string }>(ref);
  }
  const stale = checkVersion(
    ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  if (
    opened.dataApiClass.getProperty(spec.name) ||
    opened.tableClass.getProperty(spec.name)
  ) {
    return duplicate<{ path: string }>(spec.name, "resource");
  }
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  let built: ReturnType<typeof buildFieldText>;
  try {
    built = buildFieldText(spec, ctx);
  } catch (error) {
    if (error instanceof UnknownDataTypeError) {
      return invalidDataType<{ path: string }>(error);
    }
    const refFail = refError(error);
    if (refFail) {
      return refFail;
    }
    throw error;
  }
  const transaction = new Transaction(opened.project);
  transaction.track(opened.databaseFile);
  transaction.track(opened.dataApiFile);
  opened.tableClass.addMember(built.table);
  opened.dataApiClass.addMember(built.api);
  applyFieldImports(opened.databaseFile, built.tableSymbols);
  applyFieldImports(opened.dataApiFile, built.apiSymbols);
  for (const importRef of imports) {
    applyImportRef(opened.dataApiFile, importRef);
  }
  return commit(transaction, { path: `${ref}#${spec.name}` }, built.warnings);
}

/**
 * Walks a field path down to the two property declarations that back it -- one
 * on the data API class, one on the table class -- and the aspects currently
 * written there. Refuses a path that does not parse, a resource or field that
 * is gone, a stale version, or a field whose declaration was hand-edited past
 * what the builder can describe.
 */
function locateField(fieldPath: string, opts: MutationOpts | undefined) {
  const parsed = parseFieldPath(fieldPath);
  if (!parsed) {
    return notFound(fieldPath);
  }
  const record = findResourceRecord(parsed.ref);
  if (!record) {
    return notFound(fieldPath);
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound(fieldPath);
  }
  const stale = checkVersion(
    parsed.ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  const dataApiProp = opened.dataApiClass.getProperty(parsed.field);
  const tableProp = opened.tableClass.getProperty(parsed.field);
  if (
    !dataApiProp ||
    !tableProp ||
    !Node.isPropertyDeclaration(dataApiProp) ||
    !Node.isPropertyDeclaration(tableProp)
  ) {
    return notFound(fieldPath);
  }
  const current = readDataApiFieldAspects(
    dataApiProp,
    indexedFieldNames(opened.tableClass),
    tableFieldDeclarations(opened.tableClass),
  );
  if (current.opaque || !current.dataType) {
    return {
      ok: false as const,
      error: { code: "opaque_target" as const, path: fieldPath },
    };
  }
  // `dataType` is returned separately: the narrowing from the test above does
  // not cross the function boundary.
  return {
    parsed,
    opened,
    dataApiProp,
    tableProp,
    current,
    dataType: current.dataType,
  };
}

function mergeFieldAspects(
  located: Extract<ReturnType<typeof locateField>, { opened: unknown }>,
  patch: Partial<FieldAspects>,
): FieldSpec {
  const { parsed, current, dataType } = located;
  return {
    name: parsed.field,
    dataType: patch.dataType ?? dataType,
    label: patch.label ?? current.label,
    listable: patch.listable ?? current.listable,
    selectable: patch.selectable ?? current.selectable,
    searchable: patch.searchable ?? current.searchable,
    sortable: patch.sortable ?? current.sortable,
    filterable: patch.filterable ?? current.filterable,
    access: patch.access ?? current.access,
    required: patch.required ?? current.required,
    indexed: patch.indexed ?? current.indexed,
    order: patch.order ?? current.order,
    exported: patch.exported ?? current.exported,
    archiveField: patch.archiveField ?? current.archiveField,
    mandatory: patch.mandatory ?? current.mandatory,
    // The column keeps how it is declared unless the DataType itself changes.
    dbField: patch.dataType ? undefined : current.dbField,
    // Options the builder has no aspect for are carried over untouched: a
    // patch must never be what drops a field's defaultValue.
    columnExtras: patch.columnExtras ?? current.columnExtras,
  };
}

export function configureField(
  fieldPath: string,
  patch: Partial<FieldAspects>,
  opts?: MutationOpts,
): OpResult {
  const located = locateField(fieldPath, opts);
  if (!("opened" in located)) return located;
  const { opened, dataApiProp, tableProp } = located;
  const merged = mergeFieldAspects(located, patch);
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  let built: ReturnType<typeof buildFieldText>;
  try {
    built = buildFieldText(merged, ctx);
  } catch (error) {
    if (error instanceof UnknownDataTypeError) {
      return invalidDataType(error);
    }
    const refFail = refError(error);
    if (refFail) {
      return refFail;
    }
    throw error;
  }
  // The table declares the column's type, its index and nothing else. A patch
  // that touches none of those has no business rewriting it — reformatting a
  // file the change does not affect is noise in the author's diff.
  const touchesTable =
    patch.dataType !== undefined || patch.indexed !== undefined;
  const transaction = new Transaction(opened.project);
  if (touchesTable) {
    transaction.track(opened.databaseFile);
    tableProp.replaceWithText(built.table);
    applyFieldImports(opened.databaseFile, built.tableSymbols);
  }
  transaction.track(opened.dataApiFile);
  dataApiProp.replaceWithText(built.api);
  applyFieldImports(opened.dataApiFile, built.apiSymbols);
  for (const importRef of imports) {
    applyImportRef(opened.dataApiFile, importRef);
  }
  return commit(transaction, undefined, built.warnings);
}

const TABLE_VIEW_ROUTES_IMPORT = "TableViewRoutes";

/**
 * Rewrite the route map of a resource's DataController. The map is the second
 * argument of its `extends` call, and the emitter already knows how to write
 * one, so patching is a matter of replacing that argument.
 */
export function configureResource(
  ref: string,
  patch: { routes?: ResourceRoute[] },
  opts?: MutationOpts,
): OpResult {
  const record = findResourceRecord(ref);
  if (!record) {
    return notFound(ref);
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound(ref);
  }
  const stale = checkVersion(
    ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  if (!patch.routes) {
    return { ok: true, data: undefined, changes: [] };
  }
  if (patch.routes.length === 0) {
    return invalidConfig("a resource must expose at least one route");
  }
  const extendsCall = getExtendsCall(opened.dataApiClass);
  const routeMap = extendsCall?.getArguments()[1];
  if (!extendsCall || !routeMap) {
    return {
      ok: false,
      error: {
        code: "unsupported",
        detail: "the DataController call has no route map to patch",
      },
    };
  }
  const transaction = new Transaction(opened.project);
  transaction.track(opened.dataApiFile);
  routeMap.replaceWithText(routeMapExpr(patch.routes));
  ensureNamedImport(
    opened.dataApiFile,
    TABLE_VIEW_ROUTES_IMPORT,
    TABLE_VIEW_MODULE,
  );
  return commit(transaction, undefined);
}

export function removeField(fieldPath: string, opts?: MutationOpts): OpResult {
  const parsed = parseFieldPath(fieldPath);
  if (!parsed) {
    return notFound(fieldPath);
  }
  const record = findResourceRecord(parsed.ref);
  if (!record) {
    return notFound(fieldPath);
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound(fieldPath);
  }
  const stale = checkVersion(
    parsed.ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  const dataApiProp = opened.dataApiClass.getProperty(parsed.field);
  const tableProp = opened.tableClass.getProperty(parsed.field);
  if (!dataApiProp && !tableProp) {
    return notFound(fieldPath);
  }
  const transaction = new Transaction(opened.project);
  transaction.track(opened.databaseFile);
  transaction.track(opened.dataApiFile);
  dataApiProp?.remove();
  tableProp?.remove();
  return commit(transaction, undefined);
}

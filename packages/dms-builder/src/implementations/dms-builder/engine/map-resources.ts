import path from "node:path";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import type {
  FileChange,
  MapResourcesInput,
  MapResourcesResult,
  MappedResult,
  OpResult,
  OpWarning,
} from "@antelopejs/interface-dms-builder";
import type { Project, SourceFile } from "ts-morph";
import { catalogOf } from "./catalog-connection";
import { ensureNamedImport } from "./emit";
import {
  type BatchTarget,
  MappingRefusal,
  type MappingPlan,
  type PlannedResource,
  planMapping,
} from "./map-resources-plan";
import { markMapped } from "./mapped-modules";
import { moduleOfFile, targetModule } from "./modules";
import {
  addBlock,
  commit,
  configureBlock,
  invalidConfig,
  unsupported,
} from "./ops";
import { configurePage, createPage } from "./ops-blocks";
import { createCategory } from "./ops-categories";
import { deletePage } from "./page-delete";
import { addSortedExport, barrelSpecifier, srcDir } from "./placement";
import { buildDataApiFile, buildDatabaseFile } from "./resource-emit-types";
import {
  listResourceRecords,
  type ResourceRecord,
  resourceRefResolver,
} from "./resource-index";
import { relabelPointingColumns } from "./relabel-columns";
import { joinSlug } from "./scan";
import { findCategoryRecord, findPageRecord } from "./source-index";
import { type EmitContext, UnknownReferenceError } from "./value";
import {
  getWritableProject,
  refreshFromDisk,
  resolveRootBarrel,
  Transaction,
} from "./writable";

const DECORATORS_MODULE = "@antelopejs/interface-database-decorators";
const REGISTER_SCHEMA = "RegisterSchema";
const START = "start";
const TABLE_BLOCK = "table";
const SELECT_DECORATOR = "Select";
const ID_FIELD = "_id";
const FULL_INDEX = `export * from "./database";\nexport * from "./data-api";\n`;

/** Resolves a resource ref to one of this batch's controllers, or to one the project has already. */
function batchResolver(plan: MappingPlan): EmitContext["resolveRef"] {
  const existing = resourceRefResolver();
  return (ref) => {
    const planned = plan.resources.find(
      (resource) => resource.ref === ref.resource,
    );
    if (!planned) {
      if (!existing) {
        throw new UnknownReferenceError(ref.resource);
      }
      return existing(ref);
    }
    const name = planned.names.apiName;
    return {
      text: name,
      import: { name, targetFile: path.join(planned.folder, "data-api.ts") },
    };
  };
}

interface ResourceFiles {
  database: string;
  dataApi: string;
  index: string;
}

/** Writes a file of the transaction: created, or rewritten when the relation was mapped before. */
function writeFile(
  project: Project,
  transaction: Transaction,
  filePath: string,
  text: string,
): void {
  const existing = project.getSourceFile(filePath);
  if (existing) {
    transaction.track(existing);
    existing.replaceWithText(text);
    return;
  }
  transaction.track(project.createSourceFile(filePath, text), true);
}

function writeResource(
  project: Project,
  transaction: Transaction,
  resource: PlannedResource,
  resolveRef: EmitContext["resolveRef"],
): ResourceFiles {
  const files: ResourceFiles = {
    database: path.join(resource.folder, "database.ts"),
    dataApi: path.join(resource.folder, "data-api.ts"),
    index: path.join(resource.folder, "index.ts"),
  };
  const database = buildDatabaseFile({
    names: resource.names,
    filePath: files.database,
    schema: resource.description.schema,
    fields: resource.tableFields,
    idField: resource.hasKey,
  });
  writeFile(project, transaction, files.database, database.text);
  const dataApi = buildDataApiFile({
    names: resource.names,
    filePath: files.dataApi,
    fields: resource.apiFields,
    routes: resource.routes,
    resolveRef,
  });
  writeFile(project, transaction, files.dataApi, dataApi.text);
  writeFile(project, transaction, files.index, FULL_INDEX);
  return files;
}

/** A relation mapped again is exported by the barrel already. */
function exportOnce(barrel: SourceFile, specifier: string): void {
  const exported = barrel
    .getExportDeclarations()
    .some((entry) => entry.getModuleSpecifierValue() === specifier);
  if (!exported) {
    addSortedExport(barrel, specifier);
  }
}

/** The module's `start` registers each mapped schema, which binds its table classes to it. */
function registerSchemas(barrel: SourceFile, schemas: string[]): void {
  ensureNamedImport(barrel, REGISTER_SCHEMA, DECORATORS_MODULE);
  const start =
    barrel.getFunction(START) ??
    barrel.addFunction({
      name: START,
      isExported: true,
      isAsync: true,
      returnType: "Promise<void>",
    });
  const body = start.getBodyText() ?? "";
  for (const schema of schemas) {
    const call = `await ${REGISTER_SCHEMA}(${JSON.stringify(schema)});`;
    if (!body.includes(call)) {
      start.addStatements(call);
    }
  }
}

interface WrittenResources {
  result: OpResult<MappedResult[]>;
}

function writeAll(
  input: MapResourcesInput,
  plan: MappingPlan,
): WrittenResources {
  const project = getWritableProject();
  const barrel = resolveRootBarrel(project, input.module);
  if (!barrel) {
    return {
      result: unsupported<MappedResult[]>(
        `module "${input.module}" has no src/index.ts`,
      ),
    };
  }
  const transaction = new Transaction(project);
  transaction.track(barrel);
  const resolveRef = batchResolver(plan);
  const mapped = plan.resources.map((resource) => {
    const files = writeResource(project, transaction, resource, resolveRef);
    exportOnce(barrel, barrelSpecifier(barrel, resource.folder));
    return {
      relation: resource.relation,
      ref: resource.ref,
      files: Object.values(files).filter(
        (file): file is string => file !== undefined,
      ),
    };
  });
  const records = mappedRecordsOf(input.module);
  relabelPointingColumns(project, transaction, records, plan);
  registerSchemas(barrel, [
    ...new Set(plan.resources.map((resource) => resource.description.schema)),
  ]);
  return { result: commit(transaction, mapped) };
}

function pageName(resource: PlannedResource): string {
  return path
    .relative(path.dirname(path.dirname(resource.folder)), resource.folder)
    .split(path.sep)
    .join("-");
}

/** The connection's category in the module, created the first time a TableView needs it. */
function ensureCategory(input: MapResourcesInput): OpResult<string> {
  const ref = `pages.${input.connection}`;
  if (findCategoryRecord(ref)) {
    return { ok: true, data: ref, changes: [] };
  }
  const created = createCategory({
    name: input.connection,
    displayName: input.connection.toUpperCase(),
    module: input.module,
  });
  return created.ok ? { ...created, data: created.data.ref } : created;
}

function addPage(
  input: MapResourcesInput,
  category: string,
  resource: PlannedResource,
): OpResult<string> {
  const page = createPage({
    name: pageName(resource),
    displayName: resource.displayName,
    category,
    module: input.module,
  });
  if (!page.ok) {
    return page;
  }
  const config: Record<string, unknown> = { caption: resource.displayName };
  if (resource.label) {
    config.labelKey = resource.label;
  }
  const block = addBlock({
    page: page.data.ref,
    name: TABLE_BLOCK,
    type: "TableView",
    controller: resource.ref,
    config,
  });
  return block.ok
    ? {
        ok: true,
        data: page.data.ref,
        changes: [...page.changes, ...block.changes],
      }
    : block;
}

interface PagesWritten {
  changes: FileChange[];
  warnings: OpWarning[];
  category?: string;
}

function pageRefOf(category: string, resource: PlannedResource): string {
  const record = findCategoryRecord(category);
  return joinSlug(record?.fullSlug ?? "", pageName(resource));
}

/** A remapped TableView keeps its page, with the title, caption and label the new choices give it. */
function updatePage(ref: string, resource: PlannedResource): OpResult<string> {
  const renamed = configurePage(ref, { displayName: resource.displayName });
  if (!renamed.ok) {
    return renamed;
  }
  const patch: Record<string, unknown> = { caption: resource.displayName };
  if (resource.label) {
    patch.labelKey = resource.label;
  }
  const configured = configureBlock(`${ref}#${TABLE_BLOCK}`, patch);
  return configured.ok
    ? {
        ...configured,
        data: ref,
        changes: [...renamed.changes, ...configured.changes],
      }
    : configured;
}

/** The page a relation's choices call for: created, updated, or removed when it lost its TableView. */
function syncPage(
  input: MapResourcesInput,
  category: string,
  resource: PlannedResource,
): OpResult<string | undefined> {
  const ref = pageRefOf(category, resource);
  const existing = findPageRecord(ref);
  if (!resource.tableView) {
    if (!existing) {
      return { ok: true, data: undefined, changes: [] };
    }
    const removed = deletePage(ref);
    return removed.ok ? { ...removed, data: undefined } : removed;
  }
  return existing
    ? updatePage(ref, resource)
    : addPage(input, category, resource);
}

function writePages(
  input: MapResourcesInput,
  plan: MappingPlan,
  mapped: MappedResult[],
): PagesWritten {
  const written: PagesWritten = { changes: [], warnings: [] };
  const category = `pages.${input.connection}`;
  const needsCategory = plan.resources.some((resource) => resource.tableView);
  if (!needsCategory && !findCategoryRecord(category)) {
    return written;
  }
  const ensured = ensureCategory(input);
  if (!ensured.ok) {
    written.warnings.push({
      code: "page_not_written",
      message: JSON.stringify(ensured.error),
    });
    return written;
  }
  written.changes.push(...ensured.changes);
  written.category = ensured.data;
  for (const resource of plan.resources) {
    const page = syncPage(input, ensured.data, resource);
    if (!page.ok) {
      written.warnings.push({
        code: "page_not_written",
        message: `${resource.relation}: ${JSON.stringify(page.error)}`,
      });
      continue;
    }
    written.changes.push(...page.changes);
    const entry = mapped.find(
      (candidate) => candidate.relation === resource.relation,
    );
    if (entry && page.data) {
      entry.page = page.data;
    }
  }
  return written;
}

function relationOf(record: ResourceRecord): string {
  return `${record.schema}.${record.tableName}`;
}

/** The resources the module has mapped already, by relation. */
export function mappedRecordsOf(module: string): Map<string, ResourceRecord> {
  return new Map(
    listResourceRecords()
      .filter((record) => moduleOfFile(record.databaseFile)?.id === module)
      .map((record) => [relationOf(record), record]),
  );
}

function labelOf(record: ResourceRecord): string | undefined {
  return record.apiClass
    .getProperties()
    .find(
      (prop) =>
        prop.getName() !== ID_FIELD &&
        prop.getDecorator(SELECT_DECORATOR) !== undefined,
    )
    ?.getName();
}

/** A relation the module mapped before, as a target relation columns of this batch may point at. */
function mappedTarget(
  record: ResourceRecord,
  description: RelationDescription,
): BatchTarget {
  return {
    resource: {
      relation: relationOf(record),
      label: labelOf(record),
      tableView: record.routes === undefined || record.routes.length > 0,
      writable: false,
      fields: [],
    },
    description,
    names: {
      className: record.className,
      modelName: record.modelName,
      apiName: record.apiName,
      tableName: record.tableName,
      route: record.route,
    },
    ref: record.ref,
  };
}

/** The relations columns of the batch refer to that the batch does not hold. */
function referencedOutside(input: MapResourcesInput): string[] {
  const batch = new Set(input.resources.map((resource) => resource.relation));
  return [
    ...new Set(
      input.resources.flatMap((resource) =>
        resource.fields
          .map((field) => field.relation)
          .filter(
            (relation): relation is string =>
              relation !== undefined && !batch.has(relation),
          ),
      ),
    ),
  ];
}

function mappedTargets(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
): BatchTarget[] {
  const records = mappedRecordsOf(input.module);
  return referencedOutside(input).flatMap((relation) => {
    const record = records.get(relation);
    const description = descriptions.find(
      (candidate) => `${candidate.schema}.${candidate.name}` === relation,
    );
    return record && description ? [mappedTarget(record, description)] : [];
  });
}

function planned(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
): MappingPlan | OpResult<MapResourcesResult> {
  const module = targetModule(input.module);
  if (!module || module.isProject) {
    return invalidConfig<MapResourcesResult>(
      `map into a local module bound to the database, not ${module ? "the project's own" : `unknown module "${input.module}"`}`,
    );
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const src = srcDir(project, input.module);
  if (!src) {
    return unsupported<MapResourcesResult>(
      `module "${input.module}" has no src/index.ts`,
    );
  }
  try {
    return planMapping(
      input,
      descriptions,
      src,
      mappedTargets(input, descriptions),
    );
  } catch (error) {
    if (error instanceof MappingRefusal) {
      return invalidConfig<MapResourcesResult>(error.message);
    }
    throw error;
  }
}

function recordMapping(input: MapResourcesInput): void {
  markMapped(input.module, {
    connection: input.connection,
    mapped: input.resources.map((resource) => resource.relation),
    excluded: input.excluded ?? [],
  });
}

/**
 * Maps relations described by `descriptions` into a module bound to their database: the tables
 * and controllers in one typechecked transaction, then the connection's category and the
 * relations' TableView pages. A relation mapped before is rewritten, and its page follows.
 */
export function mapDescribedResources(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
): OpResult<MapResourcesResult> {
  const plan = planned(input, descriptions);
  if ("ok" in plan) {
    return plan;
  }
  if (plan.resources.length === 0) {
    recordMapping(input);
    return { ok: true, data: { resources: [], leftOut: [] }, changes: [] };
  }
  const { result } = writeAll(input, plan);
  if (!result.ok) {
    return result;
  }
  recordMapping(input);
  const pages = writePages(input, plan, result.data);
  const data = {
    resources: result.data,
    leftOut: plan.leftOut,
    category: pages.category,
  };
  const changes = [...result.changes, ...pages.changes].filter(changed);
  const warnings = [...(result.warnings ?? []), ...pages.warnings];
  return warnings.length > 0
    ? { ok: true, data, changes, warnings }
    : { ok: true, data, changes };
}

/** A file a remap rewrote to the text it had is not a change. */
function changed(change: FileChange): boolean {
  return change.kind !== "modify" || change.diff !== "";
}

/** The relations the call needs described: its own, and the mapped ones its columns point at. */
function describedRelations(input: MapResourcesInput): string[] {
  return [
    ...new Set([
      ...input.resources.map((resource) => resource.relation),
      ...referencedOutside(input),
    ]),
  ];
}

/**
 * Reads the descriptions of the relations through the builder's catalog connection, then maps
 * them with {@link mapDescribedResources}.
 */
export async function mapResources(
  input: MapResourcesInput,
): Promise<OpResult<MapResourcesResult>> {
  const catalog = catalogOf(input.connection);
  if (!catalog) {
    return invalidConfig<MapResourcesResult>(
      `dms-builder has no catalog connection "${input.connection}"; declare one in its importOverrides`,
    );
  }
  const relations = describedRelations(input);
  if (relations.length === 0) {
    return mapDescribedResources(input, []);
  }
  try {
    return mapDescribedResources(
      input,
      await catalog.DescribeRelations(relations),
    );
  } catch (error) {
    return invalidConfig<MapResourcesResult>(
      `the catalog of "${input.connection}" refused: ${(error as Error).message}`,
    );
  }
}

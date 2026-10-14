import fs from "node:fs";
import path from "node:path";
import type {
  FileChange,
  MapResourcesInput,
  MapResourcesResult,
  MappedRelationDescription,
  MappedResult,
  OpResult,
  OpWarning,
} from "@antelopejs/interface-dms-builder";
import type { Project, SourceFile } from "ts-morph";
import { ensureNamedImport } from "./emit";
import {
  MappingRefusal,
  type MappingPlan,
  type PlannedResource,
  planMapping,
} from "./map-resources-plan";
import { markMapped } from "./mapped-modules";
import { targetModule } from "./modules";
import { addBlock, commit, invalidConfig, unsupported } from "./ops";
import { createPage } from "./ops-blocks";
import { createCategory } from "./ops-categories";
import { addSortedExport, barrelSpecifier, srcDir } from "./placement";
import { buildDataApiFile, buildDatabaseFile } from "./resource-emit-types";
import { resourceRefResolver } from "./resource-index";
import { findCategoryRecord } from "./source-index";
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
const DATABASE_ONLY_INDEX = `export * from "./database";\n`;
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
  dataApi?: string;
  index: string;
}

function writeResource(
  project: Project,
  transaction: Transaction,
  resource: PlannedResource,
  resolveRef: EmitContext["resolveRef"],
): ResourceFiles {
  const files: ResourceFiles = {
    database: path.join(resource.folder, "database.ts"),
    index: path.join(resource.folder, "index.ts"),
  };
  const database = buildDatabaseFile({
    names: resource.names,
    filePath: files.database,
    schema: resource.description.schema,
    fields: resource.tableFields,
    idField: resource.hasKey,
  });
  transaction.track(
    project.createSourceFile(files.database, database.text),
    true,
  );
  if (resource.tableView) {
    files.dataApi = path.join(resource.folder, "data-api.ts");
    const dataApi = buildDataApiFile({
      names: resource.names,
      filePath: files.dataApi,
      fields: resource.apiFields,
      routes: resource.routes,
      resolveRef,
    });
    transaction.track(
      project.createSourceFile(files.dataApi, dataApi.text),
      true,
    );
  }
  const index = resource.tableView ? FULL_INDEX : DATABASE_ONLY_INDEX;
  transaction.track(project.createSourceFile(files.index, index), true);
  return files;
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
  const existing = plan.resources.find((resource) =>
    fs.existsSync(resource.folder),
  );
  if (existing) {
    return {
      result: invalidConfig<MappedResult[]>(
        `${existing.relation} is already mapped, at ${existing.folder}`,
      ),
    };
  }
  const transaction = new Transaction(project);
  transaction.track(barrel);
  const resolveRef = batchResolver(plan);
  const mapped = plan.resources.map((resource) => {
    const files = writeResource(project, transaction, resource, resolveRef);
    addSortedExport(barrel, barrelSpecifier(barrel, resource.folder));
    return {
      relation: resource.relation,
      ref: resource.tableView ? resource.ref : undefined,
      files: Object.values(files).filter(
        (file): file is string => file !== undefined,
      ),
    };
  });
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
}

function writePages(
  input: MapResourcesInput,
  plan: MappingPlan,
  mapped: MappedResult[],
): PagesWritten {
  const written: PagesWritten = { changes: [], warnings: [] };
  const viewed = plan.resources.filter((resource) => resource.tableView);
  if (viewed.length === 0) {
    return written;
  }
  const category = ensureCategory(input);
  if (!category.ok) {
    written.warnings.push({
      code: "page_not_written",
      message: JSON.stringify(category.error),
    });
    return written;
  }
  written.changes.push(...category.changes);
  for (const resource of viewed) {
    const page = addPage(input, category.data, resource);
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
    if (entry) {
      entry.page = page.data;
    }
  }
  return written;
}

function planned(
  input: MapResourcesInput,
  descriptions: MappedRelationDescription[],
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
    return planMapping(input, descriptions, src);
  } catch (error) {
    if (error instanceof MappingRefusal) {
      return invalidConfig<MapResourcesResult>(error.message);
    }
    throw error;
  }
}

/**
 * Maps relations of a database the project does not own into a module bound to it: the tables
 * and controllers in one typechecked transaction, then the connection's category and one
 * TableView page per relation that has one.
 */
export function mapResources(
  input: MapResourcesInput,
  descriptions: MappedRelationDescription[],
): OpResult<MapResourcesResult> {
  const plan = planned(input, descriptions);
  if ("ok" in plan) {
    return plan;
  }
  const { result } = writeAll(input, plan);
  if (!result.ok) {
    return result;
  }
  markMapped(input.module, input.connection);
  const pages = writePages(input, plan, result.data);
  const data = { resources: result.data, leftOut: plan.leftOut };
  const warnings = [...(result.warnings ?? []), ...pages.warnings];
  return warnings.length > 0
    ? {
        ok: true,
        data,
        changes: [...result.changes, ...pages.changes],
        warnings,
      }
    : { ok: true, data, changes: [...result.changes, ...pages.changes] };
}

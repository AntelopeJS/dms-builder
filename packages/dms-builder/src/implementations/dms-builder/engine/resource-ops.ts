import fs from "node:fs";
import path from "node:path";
import type {
  CreateResourceInput,
  DuplicateScope,
  OpResult,
  OpWarning,
  ResourceFiles,
  ResourceLocation,
  ResourceRef,
} from "@antelopejs/interface-dms-builder";
import { type ClassDeclaration, type Project, type SourceFile } from "ts-morph";
import {
  barrelSpecifier,
  findNearestBarrel,
  resolveWithinSrc,
  srcDir,
} from "./placement";
import {
  CORE_SCHEMA_NAME_VALUE,
  isResourceRoute,
  resourceClassName,
  resourceNames,
  resourceRoute,
} from "./resource-emit";
import {
  buildDataApiFile,
  buildDatabaseFile,
  buildResourceIndex,
} from "./resource-emit-types";
import {
  findResourceRecord,
  invalidateResourceIndex,
  type ResourceRecord,
  resourceRefResolver,
} from "./resource-index";
import {
  findCategoryRecord,
  findPageRecord,
  invalidateSourceIndex,
} from "./source-index";
import { UnknownDataTypeError, UnknownReferenceError } from "./value";
import { getWritableProject, refreshFromDisk, Transaction } from "./writable";
import { describeValue } from "./describe-value";
import { RESERVED_FIELD_NAMES } from "./reserved-names";

const API_ROUTE_PREFIX = "/api/";

function duplicate<T = void>(name: string, scope: DuplicateScope): OpResult<T> {
  return { ok: false, error: { code: "duplicate_name", name, scope } };
}

function unsupported<T = void>(detail: string): OpResult<T> {
  return { ok: false, error: { code: "unsupported", detail } };
}

function invalidConfig<T = void>(message: string): OpResult<T> {
  return {
    ok: false,
    error: { code: "invalid_config", issues: [{ pointer: "", message }] },
  };
}

function invalidDataType<T = void>(error: UnknownDataTypeError): OpResult<T> {
  return {
    ok: false,
    error: {
      code: "invalid_config",
      issues: [
        {
          pointer: "",
          message: `${error.message}; call GetCatalog for valid DataType ids`,
        },
      ],
    },
  };
}

function commit<T>(
  transaction: Transaction,
  data: T,
  warnings: OpWarning[] = [],
): OpResult<T> {
  const errors = transaction.typecheckErrors();
  if (errors.length > 0) {
    transaction.rollback();
    return {
      ok: false,
      error: { code: "typecheck_failed", diagnostics: errors },
    };
  }
  const changes = transaction.flush();
  invalidateSourceIndex();
  invalidateResourceIndex();
  return warnings.length > 0
    ? { ok: true, data, changes, warnings }
    : { ok: true, data, changes };
}

interface OpenResource {
  project: Project;
  databaseFile: SourceFile;
  dataApiFile: SourceFile;
  tableClass: ClassDeclaration;
  dataApiClass: ClassDeclaration;
}

export function openResource(record: ResourceRecord): OpenResource | undefined {
  const project = getWritableProject();
  refreshFromDisk(project);
  const databaseFile = project.getSourceFile(record.databaseFile);
  const dataApiFile = project.getSourceFile(record.dataApiFile);
  if (!databaseFile || !dataApiFile) {
    return undefined;
  }
  const tableClass = databaseFile.getClass(record.className);
  const dataApiClass = dataApiFile.getClass(record.apiName);
  if (!tableClass || !dataApiClass) {
    return undefined;
  }
  return { project, databaseFile, dataApiFile, tableClass, dataApiClass };
}

export function parseFieldPath(
  fieldPath: string,
): { ref: string; field: string } | undefined {
  const hash = fieldPath.indexOf("#");
  if (hash < 0) {
    return undefined;
  }
  const ref = fieldPath.slice(0, hash);
  const field = fieldPath.slice(hash + 1);
  if (!ref || !field) {
    return undefined;
  }
  return { ref, field };
}

function refFromName(name: string): string {
  const route = resourceRoute(name);
  return route.startsWith(API_ROUTE_PREFIX)
    ? route.slice(API_ROUTE_PREFIX.length)
    : route;
}

type CreateData = { ref: ResourceRef; files: ResourceFiles };

interface ResolvedPlacement {
  folder: string;
  files: ResourceFiles;
  barrel: SourceFile;
  moduleSpecifier: string;
}

function resolveResourceBaseDir(
  src: string,
  location: ResourceLocation | undefined,
): string | OpResult<CreateData> {
  if (location === undefined) {
    return src;
  }
  if (typeof location === "string") {
    const resolved = resolveWithinSrc(src, location);
    return (
      resolved ??
      invalidConfig<CreateData>(
        `location "${location}" escapes the project src directory`,
      )
    );
  }
  if ("category" in location) {
    const category = findCategoryRecord(location.category);
    if (!category) {
      return invalidConfig<CreateData>(
        `unknown category "${location.category}"`,
      );
    }
    return category.importModule?.endsWith(".ts")
      ? path.dirname(category.importModule)
      : src;
  }
  const page = findPageRecord(location.page);
  if (!page) {
    return invalidConfig<CreateData>(`unknown page "${location.page}"`);
  }
  return path.dirname(page.filepath);
}

function resolveResourcePlacement(
  project: Project,
  input: CreateResourceInput,
): ResolvedPlacement | OpResult<CreateData> {
  const src = srcDir(project);
  if (!src) {
    return unsupported<CreateData>("no root barrel (src/index.ts) found");
  }
  const baseDir = resolveResourceBaseDir(src, input.location);
  if (typeof baseDir !== "string") {
    return baseDir;
  }
  const barrel = findNearestBarrel(project, baseDir);
  if (!barrel) {
    return unsupported<CreateData>("no root barrel (src/index.ts) found");
  }
  const folder = path.join(baseDir, input.name);
  return {
    folder,
    files: {
      database: path.join(folder, "database.ts"),
      dataApi: path.join(folder, "data-api.ts"),
      index: path.join(folder, "index.ts"),
    },
    barrel,
    moduleSpecifier: barrelSpecifier(barrel, folder),
  };
}

export function createResource(
  input: CreateResourceInput,
): OpResult<{ ref: ResourceRef; files: ResourceFiles }> {
  const className = resourceClassName(input.name);
  if (!input.name || !className) {
    return invalidConfig<{ ref: ResourceRef; files: ResourceFiles }>(
      "resource name must contain at least one alphanumeric character",
    );
  }
  const ref = refFromName(input.name);
  if (findResourceRecord(ref)) {
    return duplicate<{ ref: ResourceRef; files: ResourceFiles }>(
      input.name,
      "resource",
    );
  }
  for (const field of input.fields) {
    const reserved = reservedFieldError<{
      ref: ResourceRef;
      files: ResourceFiles;
    }>(field.name);
    if (reserved) {
      return reserved;
    }
  }
  if (input.routes) {
    if (input.routes.length === 0) {
      return invalidConfig<{ ref: ResourceRef; files: ResourceFiles }>(
        "routes must list at least one route, or be omitted for all routes",
      );
    }
    // findIndex, not find: an `undefined` element is itself an invalid route,
    // and `find` cannot tell that from "every route is valid" -- so
    // `routes: [undefined]` passed validation and emitted a resource that
    // registers no endpoints at all.
    const invalidIndex = input.routes.findIndex(
      (route) => !isResourceRoute(route),
    );
    if (invalidIndex !== -1) {
      return invalidConfig<{ ref: ResourceRef; files: ResourceFiles }>(
        `unknown route ${describeValue(input.routes[invalidIndex])}; valid routes: list, get, create, edit, delete, select, archive, export`,
      );
    }
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const placement = resolveResourcePlacement(project, input);
  if ("ok" in placement) {
    return placement;
  }
  const { folder, files, barrel, moduleSpecifier } = placement;
  if (fs.existsSync(folder)) {
    return duplicate<{ ref: ResourceRef; files: ResourceFiles }>(
      input.name,
      "resource",
    );
  }
  const names = resourceNames(input.name);
  const schema =
    input.schema && input.schema !== CORE_SCHEMA_NAME_VALUE
      ? input.schema
      : undefined;
  let databaseText: string;
  let dataApiText: string;
  let warnings: OpWarning[];
  const resolveRef = resourceRefResolver();
  try {
    const database = buildDatabaseFile({
      names,
      filePath: files.database,
      schema,
      fields: input.fields,
      seeds: input.seeds,
      resolveRef,
    });
    const dataApi = buildDataApiFile({
      names,
      filePath: files.dataApi,
      fields: input.fields,
      routes: input.routes,
      resolveRef,
    });
    databaseText = database.text;
    dataApiText = dataApi.text;
    warnings = [...database.warnings, ...dataApi.warnings];
  } catch (error) {
    if (error instanceof UnknownDataTypeError) {
      return invalidDataType<{ ref: ResourceRef; files: ResourceFiles }>(error);
    }
    const refFail = refError(error);
    if (refFail) {
      return refFail;
    }
    throw error;
  }
  const transaction = new Transaction(project);
  transaction.track(barrel);
  const databaseFile = project.createSourceFile(files.database, databaseText);
  transaction.track(databaseFile, true);
  const dataApiFile = project.createSourceFile(files.dataApi, dataApiText);
  transaction.track(dataApiFile, true);
  const indexFile = project.createSourceFile(files.index, buildResourceIndex());
  transaction.track(indexFile, true);
  barrel.addExportDeclaration({ moduleSpecifier });
  return commit(transaction, { ref, files }, warnings);
}

export function refError(error: unknown): OpResult<never> | undefined {
  if (error instanceof UnknownReferenceError) {
    return invalidConfig<never>(
      `${error.message}; call ListResources for valid resource refs`,
    );
  }
  return undefined;
}

export function reservedFieldError<T = void>(
  name: string,
): OpResult<T> | undefined {
  if (RESERVED_FIELD_NAMES.has(name)) {
    return invalidConfig<T>(
      `field name "${name}" is reserved by the DataController (route or model property); choose another`,
    );
  }
  return undefined;
}

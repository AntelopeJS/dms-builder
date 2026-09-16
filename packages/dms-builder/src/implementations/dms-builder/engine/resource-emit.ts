import type { ResourceRoute } from "@antelopejs/interface-dms-builder";
import { pascalCase } from "./emit";

export const CORE_SCHEMA_NAME_VALUE = "dms-core";
const CORE_SCHEMA_IDENTIFIER = "CORE_SCHEMA_NAME";

const API_MODULE = "@antelopejs/interface-api";
const DATA_API_MODULE = "@antelopejs/interface-data-api";
const METADATA_MODULE = "@antelopejs/interface-data-api/metadata";
const DB_MODULE = "@antelopejs/interface-database-decorators";
const DATATYPE_MODULE =
  "@antelopejs/interface-dms/base/data-types/default-types";
const SEARCHABLE_MODULE = "@antelopejs/interface-dms/base/searchable";
export const TABLE_VIEW_MODULE = "@antelopejs/interface-dms/base/table-view";
const CONSTANTS_MODULE = "@antelopejs/interface-dms/constants";
const TENANT_MODEL_MODULE = "@antelopejs/interface-dms/tenant-scoped-model";
export const DATABASE_LOCAL = "./database";

export const RESOURCE_ROUTES: readonly ResourceRoute[] = [
  "list",
  "get",
  "create",
  "edit",
  "delete",
  "select",
  "archive",
  "export",
];

const EXPORT_ROUTES_SPREAD = "...TableViewRoutes.ExportRoutes";

const ROUTE_MEMBERS: Record<ResourceRoute, [key: string, member: string][]> = {
  list: [
    ["list", "List"],
    ["count", "Count"],
  ],
  get: [["get", "Get"]],
  create: [["new", "New"]],
  edit: [["edit", "Edit"]],
  delete: [["delete", "Delete"]],
  select: [["select", "Select"]],
  archive: [
    ["archive", "Archive"],
    ["restore", "Restore"],
  ],
  export: [],
};

const KEY_TO_ROUTE: Record<string, ResourceRoute> = {
  list: "list",
  get: "get",
  new: "create",
  edit: "edit",
  delete: "delete",
  select: "select",
  archive: "archive",
  restore: "archive",
};

export function isResourceRoute(value: string): value is ResourceRoute {
  return (RESOURCE_ROUTES as readonly string[]).includes(value);
}

export function routeMapExpr(
  routes: readonly ResourceRoute[] | undefined,
): string {
  if (!routes) {
    return "TableViewRoutes.All";
  }
  const selected = RESOURCE_ROUTES.filter((route) => routes.includes(route));
  const parts: string[] = [];
  for (const route of selected) {
    if (route === "export") {
      parts.push(EXPORT_ROUTES_SPREAD);
      continue;
    }
    for (const [key, member] of ROUTE_MEMBERS[route]) {
      parts.push(`${key}: TableViewRoutes.${member}`);
    }
  }
  return `{ ${parts.join(", ")} }`;
}

/**
 * Maps an emitted DataController route map back to the semantic `ResourceRoute`
 * set: `keys` are the object-literal property names, `hasExportRoutes` is whether
 * `...TableViewRoutes.ExportRoutes` was spread in. Returns `undefined` for the
 * full `TableViewRoutes.All` map (its keys round-trip to every route).
 */
export function routesFromRouteMap(
  keys: Iterable<string>,
  hasExportRoutes: boolean,
): ResourceRoute[] {
  const found = new Set<ResourceRoute>();
  for (const key of keys) {
    const route = KEY_TO_ROUTE[key];
    if (route) {
      found.add(route);
    }
  }
  if (hasExportRoutes) {
    found.add("export");
  }
  return RESOURCE_ROUTES.filter((route) => found.has(route));
}

export const DECORATOR_IMPORTS: Record<string, string> = {
  Controller: API_MODULE,
  DataController: DATA_API_MODULE,
  RegisterDataController: DATA_API_MODULE,
  Access: METADATA_MODULE,
  AccessMode: METADATA_MODULE,
  Listable: METADATA_MODULE,
  ModelReference: METADATA_MODULE,
  Optional: METADATA_MODULE,
  Sortable: METADATA_MODULE,
  Model: DB_MODULE,
  BasicDataModel: DB_MODULE,
  Field: DB_MODULE,
  Fixture: DB_MODULE,
  Index: DB_MODULE,
  RegisterTable: DB_MODULE,
  Table: DB_MODULE,
  Get: API_MODULE,
  Parameter: API_MODULE,
  TenantScopedModel: TENANT_MODEL_MODULE,
  Searchable: SEARCHABLE_MODULE,
  Column: TABLE_VIEW_MODULE,
  Select: TABLE_VIEW_MODULE,
  TableViewRoutes: TABLE_VIEW_MODULE,
  [CORE_SCHEMA_IDENTIFIER]: CONSTANTS_MODULE,
};

export const DATA_API_MODULE_ORDER = [
  API_MODULE,
  DATA_API_MODULE,
  METADATA_MODULE,
  DB_MODULE,
  DATATYPE_MODULE,
  SEARCHABLE_MODULE,
  TABLE_VIEW_MODULE,
  DATABASE_LOCAL,
];

export const DATABASE_MODULE_ORDER = [DB_MODULE, CONSTANTS_MODULE];

export interface ResourceNames {
  className: string;
  modelName: string;
  apiName: string;
  tableName: string;
  route: string;
}

function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

function camelCase(value: string): string {
  const pascal = pascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function pluralize(value: string): string {
  if (/(s|x|z|ch|sh)$/.test(value)) {
    return `${value}es`;
  }
  if (/[^aeiou]y$/.test(value)) {
    return `${value.slice(0, -1)}ies`;
  }
  return `${value}s`;
}

export function resourceClassName(name: string): string {
  return pascalCase(name);
}

export function resourceModelName(name: string): string {
  return `${resourceClassName(name)}Model`;
}

export function resourceApiName(name: string): string {
  return `${camelCase(name)}DataAPI`;
}

export function resourceTableName(name: string): string {
  return pluralize(words(name).join("_"));
}

export function resourceRoute(name: string): string {
  return `/api/${words(name).join("-")}`;
}

export function resourceNames(name: string): ResourceNames {
  return {
    className: resourceClassName(name),
    modelName: resourceModelName(name),
    apiName: resourceApiName(name),
    tableName: resourceTableName(name),
    route: resourceRoute(name),
  };
}

export interface DbType {
  field: string;
  ts: string;
  fallback: boolean;
}

export const DB_TYPE_MAP: Record<string, { field: string; ts: string }> = {
  string: { field: "string", ts: "string" },
  email: { field: "string", ts: "string" },
  url: { field: "string", ts: "string" },
  password: { field: "string", ts: "string" },
  color: { field: "string", ts: "string" },
  phone: { field: "string", ts: "string" },
  rich_text: { field: "string", ts: "string" },
  select: { field: "string", ts: "string" },
  number: { field: "number", ts: "number" },
  price: { field: "number", ts: "number" },
  percentage: { field: "number", ts: "number" },
  date: { field: "date", ts: "Date" },
  boolean: { field: "boolean", ts: "boolean" },
};

import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import type {
  ColumnDescription,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import type {
  MappedRelation,
  OpResult,
  Proposed,
  ProposedField,
  ProposedResource,
  ResourceFieldStructure,
  TabsChoice,
} from "@antelopejs/interface-dms-builder";
import { catalogOf } from "./catalog-connection";
import { displayOfDataType, tabsOf } from "./column-display";
import { mappedRecordsOf } from "./map-resources";
import { TABLE_BLOCK } from "./map-resources-pages";
import { humanized } from "./name-words";
import { mappedConnectionOfFile } from "./mapped-modules";
import { invalidConfig } from "./ops";
import type { ResourceRecord } from "./resource-index";
import {
  buildResourceStructure,
  tableFieldDeclarations,
} from "./resource-structure";
import { type PageRecord, joinSlug } from "./scan";
import { buildPageStructure } from "./page-structure";
import { findCategoryRecord, findPageRecord } from "./source-index";

/** The rule every choice read back from a mapped module cites: it is what the module holds. */
const MAPPED_RULE = "mapped";
const QUOTES = /^["']|["']$/g;

function mapped<T>(value: T): Proposed<T> {
  return { value, rule: MAPPED_RULE, kind: "fact" };
}

function propertyName(name: string): string {
  return name.replace(QUOTES, "");
}

interface RelationTarget {
  $ref?: { resource?: string };
}

/** The relation a controller field points at, by the ref of the resource its DataType names. */
function targetOf(
  field: ResourceFieldStructure | undefined,
  relations: Map<string, string>,
): string | undefined {
  const config = field?.dataType?.config;
  const controller = config?.dataApiController as RelationTarget | undefined;
  const ref = controller?.$ref?.resource;
  return ref ? relations.get(ref) : undefined;
}

interface FieldSources {
  declared: Map<string, string>;
  controller: Map<string, ResourceFieldStructure>;
  relations: Map<string, string>;
}

function fieldOf(
  column: ColumnDescription,
  sources: FieldSources,
): ProposedField {
  const aspects = sources.controller.get(column.name);
  const declared =
    sources.declared.get(column.name) ??
    column.accepts[0]?.declared ??
    "string";
  const reading = column.accepts.find((entry) => entry.declared === declared);
  const field: ProposedField = {
    column: column.name,
    native: column.native,
    accepts: column.accepts.map((entry) => entry.declared),
    declared: { ...mapped(declared), lossy: reading?.lossy },
    label: mapped(aspects?.label ?? humanized(column.name)),
    listable: mapped(aspects?.listable ?? false),
    filterable: mapped(aspects?.filterable ?? false),
    sortable: mapped(aspects?.sortable ?? false),
    searchable: mapped(aspects?.searchable ?? false),
  };
  const display = displayOfDataType(aspects?.dataType);
  if (display) {
    field.display = mapped(display);
  }
  const target = targetOf(aspects, sources.relations);
  if (target) {
    field.relation = { ...mapped(target), implied: false };
  }
  return field;
}

function pageOf(
  connection: string,
  record: ResourceRecord,
): PageRecord | undefined {
  const folder = path.dirname(record.databaseFile);
  const name = path
    .relative(path.dirname(path.dirname(folder)), folder)
    .split(path.sep)
    .join("-");
  const category = findCategoryRecord(`pages.${connection}`);
  return category && findPageRecord(joinSlug(category.fullSlug, name));
}

/**
 * The tabs the page's TableView holds, when they are the ones a badge column's items write: tabs
 * edited by hand are not the mapping's, so a mapping sent back does not rewrite them.
 */
function tabsOfPage(
  page: PageRecord | undefined,
  fields: ProposedField[],
): TabsChoice | undefined {
  const structure = page && buildPageStructure(page.ref);
  const table = structure?.ok
    ? structure.data.blocks.find((block) => block.name === TABLE_BLOCK)
    : undefined;
  const stored = table?.config?.tabs;
  const field = fields.find(
    (candidate) =>
      candidate.display?.value.kind === "badge" &&
      isDeepStrictEqual(
        stored,
        tabsOf(candidate.column, candidate.display.value),
      ),
  );
  return field && { column: field.column };
}

function sourcesOf(
  record: ResourceRecord,
  relations: Map<string, string>,
): FieldSources {
  const structure = buildResourceStructure(record.ref);
  const fields = structure.ok ? structure.data.fields : [];
  const declared = new Map(
    [...tableFieldDeclarations(record.tableClass)].map(([name, entry]) => [
      propertyName(name),
      propertyName(entry.field),
    ]),
  );
  return {
    declared,
    controller: new Map(
      fields.map((field) => [propertyName(field.name), field]),
    ),
    relations,
  };
}

/** The catalog's columns, the ones the module declares first and in its order. */
function inModuleOrder(
  description: RelationDescription,
  sources: FieldSources,
): ColumnDescription[] {
  const order = [...sources.declared.keys()];
  const rank = (column: ColumnDescription) => {
    const index = order.indexOf(column.name);
    return index === -1 ? order.length : index;
  };
  return [...description.columns].sort(
    (left, right) => rank(left) - rank(right),
  );
}

function relationOf(
  connection: string,
  record: ResourceRecord,
  description: RelationDescription,
  relations: Map<string, string>,
): MappedRelation {
  const sources = sourcesOf(record, relations);
  const label = [...sources.controller.values()].find(
    (field) => field.selectable && field.name !== "_id",
  );
  const tableView = record.routes === undefined || record.routes.length > 0;
  const page = pageOf(connection, record);
  const fields = inModuleOrder(description, sources).map((column) =>
    fieldOf(column, sources),
  );
  const tabs = tabsOfPage(page, fields);
  const resource: ProposedResource = {
    relation: `${description.schema}.${description.name}`,
    tableView: mapped(tableView),
    writable: mapped(record.routes === undefined),
    label: mapped(label ? propertyName(label.name) : null),
    title: mapped(page?.displayName ?? humanized(description.name)),
    fields,
    leftOut: [],
    writes: description.writes,
  };
  if (tabs) {
    resource.tabs = mapped(tabs);
  }
  const keys = new Set(description.key?.columns ?? []);
  return {
    ref: record.ref,
    resource,
    included: resource.fields
      .map((field) => field.column)
      .filter(
        (column) =>
          sources.declared.has(column) &&
          (!keys.has(column) || sources.controller.has(column)),
      ),
  };
}

/**
 * The relations a module maps for a connection, read back from its code as their current choices,
 * so they can be changed and mapped again. Columns the catalog lists and the module does not
 * declare are answered too, outside `included`, as are the key columns `MapResources` adds itself.
 */
export async function mappedChoices(
  connection: string,
  module: string,
): Promise<OpResult<MappedRelation[]>> {
  const catalog = catalogOf(connection);
  if (!catalog) {
    return invalidConfig<MappedRelation[]>(
      `dms-builder has no catalog connection "${connection}"; declare one in its importOverrides`,
    );
  }
  const records = [...mappedRecordsOf(module)].filter(
    ([, record]) => mappedConnectionOfFile(record.databaseFile) === connection,
  );
  if (records.length === 0) {
    return { ok: true, data: [], changes: [] };
  }
  const schemas = [
    ...new Set(records.map(([relation]) => relation.split(".")[0])),
  ];
  const present = new Set(
    (await catalog.ListRelations(schemas)).map(
      (summary) => `${summary.schema}.${summary.name}`,
    ),
  );
  const found = records.filter(([relation]) => present.has(relation));
  const missing = records
    .map(([relation]) => relation)
    .filter((relation) => !present.has(relation));
  const descriptions =
    found.length > 0
      ? await catalog.DescribeRelations(found.map(([relation]) => relation))
      : [];
  const relations = new Map(
    records.map(([relation, record]) => [record.ref, relation]),
  );
  const data = found.map(([relation, record]) =>
    relationOf(
      connection,
      record,
      descriptions.find(
        (description) =>
          `${description.schema}.${description.name}` === relation,
      )!,
      relations,
    ),
  );
  if (missing.length === 0) {
    return { ok: true, data, changes: [] };
  }
  return {
    ok: true,
    data,
    changes: [],
    warnings: missing.map((relation) => ({
      code: "relation_missing",
      message: `${relation} is mapped, but the database no longer has it, or the role cannot see it`,
    })),
  };
}

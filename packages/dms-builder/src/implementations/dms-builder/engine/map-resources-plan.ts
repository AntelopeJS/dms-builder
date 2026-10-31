import path from "node:path";
import type {
  ColumnDescription,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import type {
  ColumnDisplay,
  DataTypeValue,
  FieldSpec,
  LeftOutColumn,
  MapResourcesInput,
  MappedField,
  MappedResource,
  OpWarning,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import { nativeKind } from "./native-kind";
import { pascalCase } from "./emit";
import type { ResourceNames } from "./resource-emit";
import { RESERVED_FIELD_NAMES } from "./reserved-names";
import { MixedTypeDeclarations } from "./mixed-types";
import {
  type TabConfig,
  fieldDataType,
  plannedTabs,
  suits,
} from "./column-display";
import type { DisplayDefaults } from "./display-defaults";
import { refuse } from "./mapping-refusal";
import { humanized, singular, words } from "./name-words";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const ID_COLUMN = "_id";
const READ_ROUTES: ResourceRoute[] = ["list", "get", "select", "export"];

/** The DataType a TableView column shows for each declaration; others stay off the TableView. */
const DATA_TYPES: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  date: "date",
};

const TS_TYPES: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  date: "Date",
  object: "Record<string, unknown>",
  any: "unknown",
};

/** One relation, planned: names, the table's fields, and the controller's when it has a TableView. */
export interface PlannedResource {
  relation: string;
  description: RelationDescription;
  names: ResourceNames;
  ref: string;
  folder: string;
  tableFields: FieldSpec[];
  apiFields: FieldSpec[];
  hasKey: boolean;
  tableView: boolean;
  routes?: ResourceRoute[];
  label?: string;
  displayName: string;
  tabs?: TabConfig[];
  /** The page's tabs are the ones a mapping wrote, and the call turns tabs off. */
  clearTabs: boolean;
}

export interface MappingPlan {
  resources: PlannedResource[];
  leftOut: LeftOutColumn[];
  warnings: OpWarning[];
}

function tsType(declared: string): string {
  if (declared.endsWith("[]")) {
    return `${tsType(declared.slice(0, -2))}[]`;
  }
  return TS_TYPES[declared] ?? "unknown";
}

function namesFor(
  input: MapResourcesInput,
  resource: MappedResource,
  description: RelationDescription,
): ResourceNames {
  const className =
    resource.className ?? pascalCase(singular(description.name));
  if (!IDENTIFIER.test(className)) {
    refuse(
      `relation ${resource.relation} needs a className: "${className}" is not one`,
    );
  }
  const apiName = `${className.charAt(0).toLowerCase()}${className.slice(1)}DataAPI`;
  const route = `/api/${[input.connection, description.schema, description.name]
    .map((part) => words(part).join("-"))
    .join("/")}`;
  return {
    className,
    modelName: `${className}Model`,
    apiName,
    tableName: description.name,
    route,
  };
}

function columnOf(
  description: RelationDescription,
  name: string,
): ColumnDescription {
  return (
    description.columns.find((column) => column.name === name) ??
    refuse(
      `relation ${description.schema}.${description.name} has no column "${name}"`,
    )
  );
}

/** The declaration chosen for a column, which must be one the catalog says registration accepts. */
function declaredFor(
  description: RelationDescription,
  column: ColumnDescription,
  wanted: string | undefined,
): string {
  const accepted = column.accepts.length
    ? column.accepts.map((entry) => entry.declared)
    : MixedTypeDeclarations(column);
  if (accepted.length === 0) {
    refuse(
      `column ${description.schema}.${description.name}.${column.name} is ${column.native}, which no field type reads`,
    );
  }
  const declared = wanted ?? accepted[0];
  if (!accepted.includes(declared)) {
    refuse(
      `column ${description.schema}.${description.name}.${column.name} is ${column.native}: declare it as ${accepted.join(" or ")}, not ${declared}`,
    );
  }
  return declared;
}

/**
 * What the plan knows about a relation a column may refer to: one of the batch, or one the module
 * has mapped already.
 */
export interface BatchTarget {
  resource: MappedResource;
  description: RelationDescription;
  names: ResourceNames;
  ref: string;
}

function relationName(description: RelationDescription): string {
  return `${description.schema}.${description.name}`;
}

function describedAs(
  descriptions: RelationDescription[],
  relation: string,
): RelationDescription {
  return (
    descriptions.find(
      (description) => relationName(description) === relation,
    ) ?? refuse(`no description of ${relation} was given`)
  );
}

interface ChosenField {
  field: MappedField;
  onController: boolean;
}

/**
 * The fields to declare: the ones chosen, then each key column left out. Such a key is on the
 * controller only when a writable TableView has to set it. A column named `_id`, the key of a
 * document source, is the alias every keyed table declares already, so it is never declared again;
 * nor is a key column no field type reads, such as a RethinkDB compound key, which `_id` serves.
 */
function chosenFields(
  resource: MappedResource,
  description: RelationDescription,
): ChosenField[] {
  const chosen = resource.fields
    .filter((field) => field.column !== ID_COLUMN)
    .map((field) => ({ field, onController: true }));
  const keyColumns = (description.key?.columns ?? []).filter(
    (name) =>
      name !== ID_COLUMN && columnOf(description, name).accepts.length > 0,
  );
  for (const column of keyColumns) {
    if (!resource.fields.some((field) => field.column === column)) {
      const settable =
        resource.writable &&
        isNaturalKey(description, columnOf(description, column));
      chosen.push({ field: { column }, onController: settable });
    }
  }
  return chosen;
}

function tableField(field: MappedField, declared: string): FieldSpec {
  return {
    name: field.column,
    dataType: { $dataType: DATA_TYPES[declared] ?? "string" },
    dbField: { field: JSON.stringify(declared), ts: tsType(declared) },
  };
}

function relationDataType(target: BatchTarget, column: string): DataTypeValue {
  if (!target.resource.label) {
    refuse(
      `${column} refers to ${relationName(target.description)}, which has no label to show`,
    );
  }
  return {
    $dataType: "relation",
    config: {
      dataApiController: { $ref: { resource: target.ref } },
      keyMapping: { label: target.resource.label, value: "_id" },
    },
  };
}

/** A relation column's target: a mapped relation with a TableView and a single-column key. */
function referenceTarget(
  targets: Map<string, BatchTarget>,
  description: RelationDescription,
  field: MappedField,
): BatchTarget | undefined {
  if (!field.relation) {
    return undefined;
  }
  const target =
    targets.get(field.relation) ??
    refuse(
      `${relationName(description)}.${field.column} refers to ${field.relation}, which is neither in this batch nor mapped in the module`,
    );
  if (
    target.description.key?.columns.length !== 1 ||
    !target.resource.tableView
  ) {
    refuse(
      `${field.relation} has no single-column key and TableView, so ${field.column} cannot be a relation column onto it`,
    );
  }
  const key = columnOf(target.description, target.description.key.columns[0]);
  const native = columnOf(description, field.column).native;
  const declared = description.references.some(
    (reference) =>
      reference.from.columns.length === 1 &&
      reference.from.columns[0] === field.column &&
      reference.to.relation === field.relation &&
      reference.to.columns.length === 1 &&
      reference.to.columns[0] === key.name,
  );
  if (!declared && nativeKind(key.native) !== nativeKind(native)) {
    refuse(
      `${relationName(description)}.${field.column} holds ${native} and the key of ${field.relation} holds ${key.native}, so no value of one can find a row of the other`,
    );
  }
  return target;
}

interface ControllerChoice {
  spec?: FieldSpec;
  display?: ColumnDisplay;
  reason?: string;
}

/**
 * The display of a column: the one sent, none for null, and for a field that left it out the one
 * its relation held before or the rules propose, when it suits the declaration.
 */
function displayOf(
  defaults: DisplayDefaults | undefined,
  field: MappedField,
  declared: string,
): ColumnDisplay | undefined {
  if (field.display !== undefined) {
    return field.display ?? undefined;
  }
  const fallback =
    defaults?.kind === "mapped"
      ? defaults.displays.get(field.column)
      : defaults?.propose(field.column, declared);
  return fallback && suits(fallback, declared) ? fallback : undefined;
}

/**
 * A key column the database does not fill in: a new row can only be created with it, so a
 * writable TableView lets it be set. On edit it stays an assertion, never an assignment.
 */
function isNaturalKey(
  description: RelationDescription,
  column: ColumnDescription,
): boolean {
  return (
    (description.key?.columns ?? []).includes(column.name) &&
    !column.hasDefault &&
    column.readOnly === undefined
  );
}

function isReadOnly(
  resource: MappedResource,
  description: RelationDescription,
  column: ColumnDescription,
): boolean {
  const isKey = (description.key?.columns ?? []).includes(column.name);
  return (
    !resource.writable ||
    column.readOnly !== undefined ||
    (isKey && !isNaturalKey(description, column))
  );
}

/** The controller's field for a column, or why the TableView leaves it out. */
function controllerField(
  plan: FieldPlan,
  field: MappedField,
  declared: string,
): ControllerChoice {
  const { resource, description, targets } = plan;
  if (!IDENTIFIER.test(field.column)) {
    return {
      reason:
        "its name is not a TypeScript identifier, so a controller cannot declare it",
    };
  }
  if (RESERVED_FIELD_NAMES.has(field.column)) {
    return {
      reason: `"${field.column}" is a DataController member, so a controller cannot declare it`,
    };
  }
  const target = referenceTarget(targets, description, field);
  if (target && field.display) {
    refuse(
      `${relationName(description)}.${field.column} is a relation column, which takes no display`,
    );
  }
  if (!target && !DATA_TYPES[declared]) {
    return {
      reason: `a ${declared} field is not shown in a TableView in this version`,
    };
  }
  const column = columnOf(description, field.column);
  const readOnly = isReadOnly(resource, description, column);
  const display = target
    ? undefined
    : displayOf(plan.defaults, field, declared);
  return {
    display,
    spec: {
      name: field.column,
      label: field.label ?? humanized(field.column),
      dataType: target
        ? relationDataType(target, field.column)
        : fieldDataType(
            display,
            declared,
            { $dataType: DATA_TYPES[declared] },
            `${relationName(description)}.${field.column}`,
          ),
      listable: field.listable ?? true,
      filterable: field.filterable ?? false,
      sortable: field.sortable ?? false,
      searchable: field.searchable ?? false,
      selectable: resource.label === field.column,
      access: readOnly ? "read" : "readwrite",
      required: !readOnly && !column.nullable && !column.hasDefault,
    },
  };
}

interface FieldPlan {
  resource: MappedResource;
  description: RelationDescription;
  targets: Map<string, BatchTarget>;
  leftOut: LeftOutColumn[];
  defaults?: DisplayDefaults;
}

interface PlannedFields {
  tableFields: FieldSpec[];
  apiFields: FieldSpec[];
  /** The display each controller field is drawn with, for the ones with one. */
  displays: Map<string, ColumnDisplay>;
  /** A text column left its display out and nothing could tell whether it is a badge. */
  unproposed: boolean;
}

/** Whether the rules had no profile to read a text column left without a display by. */
function isUnproposed(
  plan: FieldPlan,
  field: MappedField,
  declared: string,
): boolean {
  return (
    field.display === undefined &&
    field.relation === undefined &&
    declared === "string" &&
    plan.defaults?.kind === "new" &&
    plan.defaults.source === "name"
  );
}

function plannedFields(plan: FieldPlan): PlannedFields {
  const tableFields: FieldSpec[] = [];
  const apiFields: FieldSpec[] = [];
  const displays = new Map<string, ColumnDisplay>();
  let unproposed = false;
  for (const { field, onController } of chosenFields(
    plan.resource,
    plan.description,
  )) {
    const column = columnOf(plan.description, field.column);
    const declared = field.relation
      ? "string"
      : declaredFor(plan.description, column, field.declared);
    if (field.relation) {
      declaredFor(plan.description, column, "string");
    }
    tableFields.push(tableField(field, declared));
    if (!onController) {
      continue;
    }
    const choice = controllerField(plan, field, declared);
    unproposed ||=
      choice.spec !== undefined && isUnproposed(plan, field, declared);
    if (choice.spec) {
      apiFields.push(choice.spec);
      if (choice.display) {
        displays.set(choice.spec.name, choice.display);
      }
    } else {
      plan.leftOut.push({
        relation: relationName(plan.description),
        column: field.column,
        reason: choice.reason ?? "",
      });
    }
  }
  return { tableFields, apiFields, displays, unproposed };
}

function targetsOf(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  mapped: BatchTarget[],
): Map<string, BatchTarget> {
  const targets = new Map<string, BatchTarget>(
    mapped.map((target) => [target.resource.relation, target]),
  );
  const batch = new Set<string>();
  for (const resource of input.resources) {
    const description = describedAs(descriptions, resource.relation);
    const names = namesFor(input, resource, description);
    if (batch.has(resource.relation)) {
      refuse(`${resource.relation} is in the batch twice`);
    }
    batch.add(resource.relation);
    if (
      [...targets.values()].some(
        (target) =>
          target.names.className === names.className &&
          target.resource.relation !== resource.relation,
      )
    ) {
      refuse(
        `two relations map to class ${names.className}; give one a className`,
      );
    }
    const tableView = resource.tableView && description.key !== null;
    targets.set(resource.relation, {
      resource: { ...resource, tableView },
      description,
      names,
      ref: names.route.replace(/^\/api\//, ""),
    });
  }
  return targets;
}

/**
 * A TableView's routes: all of them when writable, the read ones otherwise. A stats-only relation
 * serves none: its controller exists so queries can name it as a resource, and nothing reaches
 * it over HTTP.
 */
function RoutesOf(resource: MappedResource): ResourceRoute[] | undefined {
  if (!resource.tableView) {
    return [];
  }
  return resource.writable ? undefined : READ_ROUTES;
}

/**
 * Checks every choice against the catalog's descriptions and plans what each relation becomes.
 * A column or tabs left out take what `defaults` holds for their relation. Throws a
 * `MappingRefusal` naming the first choice it cannot honour.
 */
export function planMapping(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  srcRoot: string,
  mapped: BatchTarget[] = [],
  defaults: ReadonlyMap<string, DisplayDefaults> = new Map(),
): MappingPlan {
  const targets = targetsOf(input, descriptions, mapped);
  const leftOut: LeftOutColumn[] = [];
  const warnings: OpWarning[] = [];
  const batch = input.resources.map((resource) =>
    targets.get(resource.relation)!,
  );
  const resources = batch.map((target) => {
    const relationDefaults = defaults.get(target.resource.relation);
    const { tableFields, apiFields, displays, unproposed } = plannedFields({
      resource: target.resource,
      description: target.description,
      targets,
      leftOut,
      defaults: relationDefaults,
    });
    const description = target.description;
    if (unproposed) {
      warnings.push({
        code: "display_not_proposed",
        message: `${relationName(description)}: the profile could not be read and no analysis was kept, so no text column was proposed a badge; send a display to set one`,
      });
    }
    return {
      relation: target.resource.relation,
      description,
      names: target.names,
      ref: target.ref,
      folder: path.join(
        srcRoot,
        ...[description.schema, description.name].map((part) =>
          words(part).join("-"),
        ),
      ),
      tableFields,
      apiFields,
      hasKey: description.key !== null,
      tableView: target.resource.tableView,
      routes: RoutesOf(target.resource),
      label: target.resource.label,
      displayName: target.resource.title ?? humanized(description.name),
      tabs: plannedTabs(
        target.resource,
        relationName(description),
        apiFields,
        displays,
        relationDefaults?.kind === "new",
      ),
      clearTabs:
        target.resource.tabs === null &&
        relationDefaults?.kind === "mapped" &&
        relationDefaults.generatedTabs,
    };
  });
  return { resources, leftOut, warnings };
}

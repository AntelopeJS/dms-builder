import path from "node:path";
import type {
  ColumnDescription,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import type {
  DataTypeValue,
  FieldSpec,
  LeftOutColumn,
  MapResourcesInput,
  MappedField,
  MappedResource,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import { nativeKind } from "./native-kind";
import { pascalCase } from "./emit";
import type { ResourceNames } from "./resource-emit";
import { RESERVED_FIELD_NAMES } from "./reserved-names";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
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

/** A mapped relation refused, with the reason the caller is told. */
export class MappingRefusal extends Error {}

function refuse(message: string): never {
  throw new MappingRefusal(message);
}

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
}

export interface MappingPlan {
  resources: PlannedResource[];
  leftOut: LeftOutColumn[];
}

function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

/** A relation name's singular, as class names take it: `accounts` → `account`. */
export function singular(name: string): string {
  if (name.endsWith("ies")) {
    return `${name.slice(0, -3)}y`;
  }
  if (/(ss|us|is)$/.test(name)) {
    return name;
  }
  return name.endsWith("s") ? name.slice(0, -1) : name;
}

/** A database name as a person reads it: `ordered_at` → `Ordered at`. */
export function humanized(name: string): string {
  const spaced = words(name).join(" ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
  const accepted = column.accepts.map((entry) => entry.declared);
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
 * controller only when a writable TableView has to set it.
 */
function chosenFields(
  resource: MappedResource,
  description: RelationDescription,
): ChosenField[] {
  const chosen = resource.fields.map((field) => ({
    field,
    onController: true,
  }));
  for (const column of description.key?.columns ?? []) {
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
  if (nativeKind(key.native) !== nativeKind(native)) {
    refuse(
      `${relationName(description)}.${field.column} holds ${native} and the key of ${field.relation} holds ${key.native}, so no value of one can find a row of the other`,
    );
  }
  return target;
}

interface ControllerChoice {
  spec?: FieldSpec;
  reason?: string;
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
  if (!target && !DATA_TYPES[declared]) {
    return {
      reason: `a ${declared} field is not shown in a TableView in this version`,
    };
  }
  const column = columnOf(description, field.column);
  const readOnly = isReadOnly(resource, description, column);
  return {
    spec: {
      name: field.column,
      label: field.label ?? humanized(field.column),
      dataType: target
        ? relationDataType(target, field.column)
        : { $dataType: DATA_TYPES[declared] },
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
}

function plannedFields(plan: FieldPlan): [FieldSpec[], FieldSpec[]] {
  const tableFields: FieldSpec[] = [];
  const apiFields: FieldSpec[] = [];
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
    if (choice.spec) {
      apiFields.push(choice.spec);
    } else {
      plan.leftOut.push({
        relation: relationName(plan.description),
        column: field.column,
        reason: choice.reason ?? "",
      });
    }
  }
  return [tableFields, apiFields];
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
 * Throws a {@link MappingRefusal} naming the first choice it cannot honour.
 */
export function planMapping(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  srcRoot: string,
  mapped: BatchTarget[] = [],
): MappingPlan {
  const targets = targetsOf(input, descriptions, mapped);
  const leftOut: LeftOutColumn[] = [];
  const batch = input.resources.map((resource) =>
    targets.get(resource.relation)!,
  );
  const resources = batch.map((target) => {
    const plan = {
      resource: target.resource,
      description: target.description,
      targets,
      leftOut,
    };
    const [tableFields, apiFields] = plannedFields(plan);
    const description = target.description;
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
    };
  });
  return { resources, leftOut };
}

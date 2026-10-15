import path from "node:path";
import type {
  DataTypeValue,
  FieldSpec,
  LeftOutColumn,
  MapResourcesInput,
  MappedColumnDescription,
  MappedField,
  MappedRelationDescription,
  MappedResource,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
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
  description: MappedRelationDescription;
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

function singular(name: string): string {
  if (name.endsWith("ies")) {
    return `${name.slice(0, -3)}y`;
  }
  if (/(ss|us|is)$/.test(name)) {
    return name;
  }
  return name.endsWith("s") ? name.slice(0, -1) : name;
}

function humanized(name: string): string {
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
  description: MappedRelationDescription,
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
  description: MappedRelationDescription,
  name: string,
): MappedColumnDescription {
  return (
    description.columns.find((column) => column.name === name) ??
    refuse(
      `relation ${description.schema}.${description.name} has no column "${name}"`,
    )
  );
}

/** The declaration chosen for a column, which must be one the catalog says registration accepts. */
function declaredFor(
  description: MappedRelationDescription,
  column: MappedColumnDescription,
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

/** What the plan knows about every relation of the batch, for references between them. */
interface BatchTarget {
  resource: MappedResource;
  description: MappedRelationDescription;
  names: ResourceNames;
  ref: string;
}

function relationName(description: MappedRelationDescription): string {
  return `${description.schema}.${description.name}`;
}

function describedAs(
  descriptions: MappedRelationDescription[],
  relation: string,
): MappedRelationDescription {
  return (
    descriptions.find(
      (description) => relationName(description) === relation,
    ) ?? refuse(`no description of ${relation} was given`)
  );
}

/** The fields to declare: the ones chosen, then each key column left out, read-only. */
function chosenFields(
  resource: MappedResource,
  description: MappedRelationDescription,
): MappedField[] {
  const chosen = [...resource.fields];
  for (const column of description.key?.columns ?? []) {
    if (!chosen.some((field) => field.column === column)) {
      const settable =
        resource.writable &&
        isNaturalKey(description, columnOf(description, column));
      chosen.push({ column, listable: settable });
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
  description: MappedRelationDescription,
  field: MappedField,
): BatchTarget | undefined {
  if (!field.relation) {
    return undefined;
  }
  const target =
    targets.get(field.relation) ??
    refuse(
      `${relationName(description)}.${field.column} refers to ${field.relation}, which is not mapped in this batch`,
    );
  if (
    target.description.key?.columns.length !== 1 ||
    !target.resource.tableView
  ) {
    refuse(
      `${field.relation} has no single-column key and TableView, so ${field.column} cannot be a relation column onto it`,
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
  description: MappedRelationDescription,
  column: MappedColumnDescription,
): boolean {
  return (
    (description.key?.columns ?? []).includes(column.name) &&
    !column.hasDefault &&
    column.readOnly === undefined
  );
}

function isReadOnly(
  resource: MappedResource,
  description: MappedRelationDescription,
  column: MappedColumnDescription,
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
  description: MappedRelationDescription;
  targets: Map<string, BatchTarget>;
  leftOut: LeftOutColumn[];
}

function plannedFields(plan: FieldPlan): [FieldSpec[], FieldSpec[]] {
  const tableFields: FieldSpec[] = [];
  const apiFields: FieldSpec[] = [];
  for (const field of chosenFields(plan.resource, plan.description)) {
    const column = columnOf(plan.description, field.column);
    const declared = field.relation
      ? "string"
      : declaredFor(plan.description, column, field.declared);
    if (field.relation) {
      declaredFor(plan.description, column, "string");
    }
    tableFields.push(tableField(field, declared));
    if (field.listable === false) {
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
  descriptions: MappedRelationDescription[],
): Map<string, BatchTarget> {
  const targets = new Map<string, BatchTarget>();
  for (const resource of input.resources) {
    const description = describedAs(descriptions, resource.relation);
    const names = namesFor(input, resource, description);
    if (
      [...targets.values()].some(
        (target) => target.names.className === names.className,
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
  descriptions: MappedRelationDescription[],
  srcRoot: string,
): MappingPlan {
  const targets = targetsOf(input, descriptions);
  const leftOut: LeftOutColumn[] = [];
  const resources = [...targets.values()].map((target) => {
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
      displayName: humanized(description.name),
    };
  });
  return { resources, leftOut };
}

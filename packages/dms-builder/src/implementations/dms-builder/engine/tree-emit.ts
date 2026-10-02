// A tree read from the page's tables, written as one route: the levels handed
// to the DMS's own helper, which reads the tables and answers the nodes.
//
// The route stays a single call over an object literal, which is what read-back
// recognizes; the DMS does the reading, so a saved tree and its preview answer
// the same nodes.

import type {
  AddTreeInput,
  ImportRef,
  OpResult,
  ResourceFieldStructure,
  TreeLevelInput,
} from "@antelopejs/interface-dms-builder";
import { invalidConfig, notFound } from "./ops";
import { isIdentifier } from "./paths";
import { indentationText, resolveProjectRoot } from "./project";
import { isPerTenantSchema, kebab, RESPONSE_MODULE } from "./query-emit";
import { decoratorImport } from "./resource-emit-types";
import { findResourceRecord, type ResourceRecord } from "./resource-index";
import { buildResourceStructure } from "./resource-structure";
import {
  DATE_TYPES,
  DEFAULT_TREE_PREFIX,
  LEVEL_KEYS,
  TREE_BRANCH_PARAMETER,
  TREE_CONTEXT_PARAMETER,
  TREE_HELPER,
  TREE_NODE_TYPE,
  TREE_PERIODS,
} from "./tree-constants";

/** Names a parameter of the route already holds, or JavaScript keeps. */
const TAKEN_NAMES = new Set([
  "_user",
  TREE_BRANCH_PARAMETER,
  TREE_CONTEXT_PARAMETER,
  "default",
  "delete",
  "new",
  "class",
  "function",
  "this",
  "in",
  "for",
  "do",
  "if",
  "switch",
  "case",
  "return",
  "var",
  "let",
  "const",
]);

export function defaultTreeEndpoint(name: string): string {
  return `${DEFAULT_TREE_PREFIX}${kebab(name)}`;
}

/** A table the levels read, injected into the route as its model. */
export interface TreeModel {
  resource: string;
  record: ResourceRecord;
  /** The route parameter holding it. */
  param: string;
}

export interface CompiledTree {
  name: string;
  endpoint: string;
  levels: TreeLevelInput[];
  lazy: boolean;
  /** One per table the levels read, in the order they first read it. */
  models: TreeModel[];
}

/** A parameter name for a table's model: its ref, as an identifier. */
function paramName(ref: string, taken: Set<string>): string {
  const words = ref.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let name = words
    .map((word, at) =>
      at === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
  if (!isIdentifier(name) || /^\d/.test(name)) {
    name = `table${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }
  let candidate = name;
  for (
    let at = 2;
    taken.has(candidate) || TAKEN_NAMES.has(candidate);
    at += 1
  ) {
    candidate = `${name}${at}`;
  }
  taken.add(candidate);
  return candidate;
}

function fieldsOf(ref: string): ResourceFieldStructure[] {
  const structure = buildResourceStructure(ref);
  return structure.ok ? structure.data.fields : [];
}

/** What is wrong with one level, in a sentence, or nothing. */
function levelProblem(
  level: TreeLevelInput,
  at: number,
  fields: ResourceFieldStructure[],
): string | undefined {
  const rank = `level ${at + 1}`;
  const known = new Set(fields.map((field) => field.name));
  const named = (field: unknown): boolean =>
    typeof field === "string" && known.has(field);
  if (level.by !== undefined && !named(level.by)) {
    return `${rank} ranks by "${String(level.by)}", which ${level.resource} has no column of`;
  }
  if (level.every !== undefined) {
    const field = fields.find((entry) => entry.name === level.by);
    if (!TREE_PERIODS.includes(level.every)) {
      return `${rank} spans "${String(level.every)}", which is not a period`;
    }
    if (!DATE_TYPES.has(field?.dataType?.$dataType ?? "")) {
      return `${rank} spans a period of "${String(level.by)}", which is not a date`;
    }
  }
  for (const key of ["parent", "link", "icon"] as const) {
    if (level[key] !== undefined && typeof level[key] !== "string") {
      return `${rank}'s ${key} is not a text`;
    }
  }
  for (const key of ["parent", "link"] as const) {
    if (level[key] !== undefined && !named(level[key])) {
      return `${rank} names "${String(level[key])}" as its ${key}, which ${level.resource} has no column of`;
    }
  }
  if (level.label !== undefined) {
    if (!Array.isArray(level.label)) {
      return `${rank}'s label is not a list of columns`;
    }
    const unknown = level.label.find((field) => !named(field));
    if (unknown !== undefined) {
      return `${rank} is named by "${String(unknown)}", which ${level.resource} has no column of`;
    }
  }
  return undefined;
}

/** Whether the levels come in an order the DMS reads: groups first, then linked rows. */
function orderProblem(levels: TreeLevelInput[]): string | undefined {
  const firstRows = levels.findIndex((level) => level.by === undefined);
  for (const [at, level] of levels.entries()) {
    if (level.by !== undefined) {
      if (firstRows !== -1 && at > firstRows) {
        return `level ${at + 1} ranks rows after a level listing them; ranking levels come first`;
      }
      if (level.parent !== undefined || level.link !== undefined) {
        return `level ${at + 1} ranks rows, so it sits under nothing`;
      }
    } else if (at > firstRows && level.link === undefined) {
      return `level ${at + 1} lists rows under a row of the level above, so it needs the column linking them`;
    } else if (at === firstRows && level.link !== undefined) {
      return `level ${at + 1} is the first listing rows, so there is no row above it to link to`;
    }
  }
  return undefined;
}

/** A tree as its route will be written, or what is wrong with it. */
export function compileTree(
  input: AddTreeInput,
): CompiledTree | OpResult<never> {
  if (!isIdentifier(input.name)) {
    return invalidConfig<never>(
      `tree name "${String(input.name)}" is not an identifier`,
    );
  }
  const endpoint = input.endpoint ?? defaultTreeEndpoint(input.name);
  if (!endpoint.startsWith("/")) {
    return invalidConfig<never>(
      `tree endpoint "${endpoint}" must start with "/"`,
    );
  }
  const levels = Array.isArray(input.levels) ? input.levels : [];
  if (levels.length === 0) {
    return invalidConfig<never>(`tree "${input.name}" reads no table`);
  }
  const taken = new Set<string>();
  const models = new Map<string, TreeModel>();
  for (const [at, level] of levels.entries()) {
    if (!models.has(level.resource)) {
      const record = findResourceRecord(level.resource);
      if (!record) {
        return notFound<never>(level.resource);
      }
      models.set(level.resource, {
        resource: level.resource,
        record,
        param: paramName(level.resource, taken),
      });
    }
    const problem = levelProblem(level, at, fieldsOf(level.resource));
    if (problem) {
      return invalidConfig<never>(`tree "${input.name}": ${problem}`);
    }
  }
  const order = orderProblem(levels);
  if (order) {
    return invalidConfig<never>(`tree "${input.name}": ${order}`);
  }
  return {
    name: input.name,
    endpoint,
    levels,
    lazy: input.lazy === true,
    models: [...models.values()],
  };
}

/** A level as the route hands it over: its table, then its settings in order. */
function levelText(level: TreeLevelInput, param: string): string {
  const parts = [`table: ${param}.table`];
  for (const key of LEVEL_KEYS) {
    const value = level[key];
    if (Array.isArray(value)) {
      parts.push(
        `${key}: [${value.map((entry) => JSON.stringify(entry)).join(", ")}]`,
      );
    } else if (value !== undefined) {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return `{ ${parts.join(", ")} }`;
}

export function treeRouteMethodText(
  tree: CompiledTree,
  pageClass: string,
): { text: string; symbols: ImportRef[] } {
  const indent = indentationText(resolveProjectRoot());
  const at = (depth: number): string => indent.repeat(depth);
  const symbols: ImportRef[] = [
    decoratorImport("Get"),
    decoratorImport("AuthUserWithPermission"),
    decoratorImport("User"),
    { name: TREE_HELPER, module: RESPONSE_MODULE },
    { name: TREE_NODE_TYPE, module: RESPONSE_MODULE },
  ];
  const parameters = [
    `${at(1)}@AuthUserWithPermission(${pageClass}) _user: User,`,
  ];
  for (const model of tree.models) {
    const decorator = isPerTenantSchema(model.record.schema)
      ? "TenantScopedModel"
      : "Model";
    symbols.push(decoratorImport(decorator));
    parameters.push(
      `${at(1)}@${decorator}(${model.record.modelName}) ${model.param}: ${model.record.modelName},`,
    );
  }
  if (tree.lazy) {
    // A branch is asked for at the route's own address, read off the request:
    // written down, it would go stale the day the page moves.
    symbols.push(
      decoratorImport("Parameter"),
      decoratorImport("Context"),
      decoratorImport("RequestContext"),
    );
    parameters.push(
      `${at(1)}@Parameter(${JSON.stringify(TREE_BRANCH_PARAMETER)}, "query") ${TREE_BRANCH_PARAMETER}: string,`,
      `${at(1)}@Context() ${TREE_CONTEXT_PARAMETER}: RequestContext,`,
    );
  }
  const params = new Map(
    tree.models.map((model) => [model.resource, model.param]),
  );
  const source = [
    `${at(2)}{`,
    `${at(3)}levels: [`,
    ...tree.levels.map(
      (level) =>
        `${at(4)}${levelText(level, params.get(level.resource) as string)},`,
    ),
    `${at(3)}],`,
    ...(tree.lazy ? [`${at(3)}lazy: true,`] : []),
    `${at(2)}},`,
  ];
  const request = tree.lazy
    ? [
        `${at(2)}{ url: ${TREE_CONTEXT_PARAMETER}.url.pathname, ${TREE_BRANCH_PARAMETER} },`,
      ]
    : [];
  const text = [
    `@Get(${JSON.stringify(tree.endpoint)})`,
    `async ${tree.name}(`,
    ...parameters,
    `): Promise<${TREE_NODE_TYPE}[]> {`,
    `${at(1)}return ${TREE_HELPER}(`,
    ...source,
    ...request,
    `${at(1)});`,
    "}",
  ].join("\n");
  return { text, symbols };
}

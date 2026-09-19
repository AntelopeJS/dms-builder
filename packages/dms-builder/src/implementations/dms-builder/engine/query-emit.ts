import type {
  ImportRef,
  QueryOutputKind,
} from "@antelopejs/interface-dms-builder";
import {
  type CompiledChain,
  getQueryTemplate,
  type MethodParam,
} from "./query-template";
import { decoratorImport } from "./resource-emit-types";

/**
 * The prefix new query endpoints default to. Only a default — `AddQueryInput.endpoint`
 * may put a query at any path, and read-back finds queries by their shape, not by
 * where they sit.
 */
export const DEFAULT_ENDPOINT_PREFIX = "/stats/";
export const TENANT_SCHEMA_NAME_VALUE = "dms-tenant";

/**
 * How a route hands back what the model computed.
 *
 * A calculation answers one thing; the block reading it wants that arranged its
 * own way. The arrangements that need more than a property name — a headline
 * figure, a ranked list, a variation — are built by helpers the DMS publishes,
 * so a route stays one expression and the reader can still recognize it.
 */
interface ResponseEmission {
  returnType: string;
  /** Given the awaited call, and the preceding period's when comparing. */
  body: (current: string, previous?: string) => string;
  /** Symbols the route has to import for that body.  */
  imports: string[];
}

/** How the helpers are reached from a generated route. */
const RESPONSE_HELPERS: Record<string, string> = {
  card: "chartCardData",
  value: "kpiCardData",
  items: "topListData",
};

const RESPONSE_TYPES: Record<string, string> = {
  card: "ChartCardData",
  value: "KpiCardData",
  items: "TopListData",
};

/** The options a helper is handed: what the measure was, and what came before. */
function helperOptions(measure: string | undefined, previous?: string): string {
  const parts: string[] = [];
  if (measure) {
    parts.push(`measure: ${JSON.stringify(measure)}`);
  }
  if (previous) {
    parts.push(`previous: await ${previous}`);
  }
  return parts.length > 0 ? `, { ${parts.join(", ")} }` : "";
}

function plainResponse(key: string, type: string): ResponseEmission {
  return {
    returnType: `Promise<{ ${key}: ${type} }>`,
    body: (current) => `{ ${key}: await ${current} }`,
    imports: [],
  };
}

const SERIES_TYPE = "{ x: number | string; y: number }[]";

/**
 * The arrangement a query's route emits, from what it computes and what the
 * block reading it asked for.
 *
 * A scalar calculation has one arrangement — the number itself; asking for
 * anything else of it would be asking a question the chain did not answer.
 */
function responseEmission(
  output: QueryOutputKind,
  response: string | undefined,
  measure: string | undefined,
): ResponseEmission {
  if (output === "scalar") {
    return plainResponse("value", "number");
  }
  const shape = response ?? "series";
  if (shape === "series") {
    return plainResponse("series", SERIES_TYPE);
  }
  const helper = RESPONSE_HELPERS[shape];
  if (!helper) {
    return plainResponse("series", SERIES_TYPE);
  }
  return {
    returnType: `Promise<${RESPONSE_TYPES[shape]}>`,
    body: (current, previous) =>
      `${helper}(await ${current}${helperOptions(measure, previous)})`,
    imports: [helper, RESPONSE_TYPES[shape]],
  };
}

/**
 * The property a plain response carries, for read-back. The arrangements built
 * by a helper are recognized by the helper's name instead.
 */
const RESPONSE_KEYS: Record<QueryOutputKind, string> = {
  scalar: "value",
  series: "series",
};

/**
 * The output kind a route's response property names, or `undefined` for a
 * property no shape emits.
 *
 * Read-back resolves the kind from what the route returns rather than from the
 * template, so a route whose calculation is no longer recognized still reports
 * what it answers — and so emission and recognition cannot drift apart.
 */
export function outputForResponseKey(key: string): QueryOutputKind | undefined {
  const found = Object.entries(RESPONSE_KEYS).find(([, name]) => name === key);
  return found?.[0] as QueryOutputKind | undefined;
}

/** The arrangement a helper name stands for, for read-back. */
export function shapeForHelper(helper: string): string | undefined {
  const found = Object.entries(RESPONSE_HELPERS).find(
    ([, name]) => name === helper,
  );
  return found?.[0];
}

/** What a template's queries answer with, for a caller outside the emitter. */
export function outputForTemplate(
  template: string,
): QueryOutputKind | undefined {
  return getQueryTemplate(template)?.descriptor.output;
}

export interface CompiledQuery {
  /** Query name — the route method's name. */
  name: string;
  /** The route path, e.g. `/stats/in-stock`. */
  endpoint: string;
  template: string;
  params: Record<string, unknown>;
  chain: CompiledChain;
  /** How the answer is arranged for the block reading it. */
  response?: string;
  /** Whether the route also answers the preceding period. */
  compare?: boolean;
}

/**
 * The model method a route is bound to. Distinct from {@link CompiledQuery.name}
 * because queries wanting the identical chain share one method, so the method a
 * query ends up calling is resolved against what the model already holds.
 */
export interface ModelTarget {
  name: string;
  /** The method already compiles this chain — emit the route, leave it alone. */
  reuse: boolean;
}

function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

export function kebab(value: string): string {
  return words(value).join("-");
}

export function defaultEndpoint(name: string): string {
  return `${DEFAULT_ENDPOINT_PREFIX}${kebab(name)}`;
}

export function queryRef(pageRef: string, name: string): string {
  return `${pageRef}@${name}`;
}

export function parseQueryRef(
  ref: string,
): { page: string; name: string } | undefined {
  const at = ref.lastIndexOf("@");
  if (at <= 0 || at === ref.length - 1) {
    return undefined;
  }
  return { page: ref.slice(0, at), name: ref.slice(at + 1) };
}

/**
 * The model-injection decorator for a resource's schema. `TenantScopedModel`
 * resolves the model against the request's tenant, which only makes sense for a
 * table registered in a per-tenant schema; a core-schema table must use the
 * plain `Model` provider or every query returns zero rows.
 */
export function modelDecoratorFor(schema: string): string {
  return schema === TENANT_SCHEMA_NAME_VALUE ? "TenantScopedModel" : "Model";
}

function methodParamText(param: MethodParam): string {
  return `${param.name}: ${param.type}`;
}

export function queryModelMethodText(
  spec: CompiledQuery,
  modelMethod: string,
): string {
  const parameters = spec.chain.parameters.map(methodParamText).join(", ");
  return `${modelMethod}(${parameters}) ${spec.chain.body}`;
}

/**
 * The route argument for a model parameter. The route reads the value under its
 * public `routeName`; a `@Parameter` yields a string, so a non-string slot
 * coerces here rather than inside the query — keeping the model method's
 * signature honest about what it accepts.
 */
function routeArgument(param: MethodParam): string {
  if (param.type === "number") {
    return `Number(${param.routeName})`;
  }
  if (param.type === "Date") {
    return `new Date(${param.routeName})`;
  }
  if (param.type === "boolean") {
    return `${param.routeName} === "true"`;
  }
  return param.routeName;
}

/** The route parameters a comparison reads the preceding period's bounds from. */
export const COMPARISON_PARAMETERS = ["compareFrom", "compareTo"] as const;

/** Where the response helpers are published. */
const RESPONSE_MODULE = "@antelopejs/interface-dms/base";

/**
 * The same model call over the preceding period, or nothing when the query does
 * not compare.
 *
 * Only a query whose period the route supplies can compare: the bounds are its
 * own parameters, and there is nothing to shift for a calculation that bakes its
 * dates in.
 */
function comparisonCall(
  spec: CompiledQuery,
  modelMethod: string,
): string | undefined {
  if (spec.compare !== true) {
    return undefined;
  }
  const bounds = spec.chain.parameters.filter(
    (parameter) => parameter.type === "Date",
  );
  if (bounds.length !== COMPARISON_PARAMETERS.length) {
    return undefined;
  }
  const args = spec.chain.parameters.map((parameter) => {
    const at = bounds.indexOf(parameter);
    return at === -1
      ? routeArgument(parameter)
      : `new Date(${COMPARISON_PARAMETERS[at]})`;
  });
  return `model.${modelMethod}(${args.join(", ")})`;
}

export function queryRouteMethodText(
  spec: CompiledQuery,
  modelName: string,
  schema: string,
  modelMethod: string,
  pageClass: string,
): { text: string; symbols: ImportRef[] } {
  const modelDecorator = modelDecoratorFor(schema);
  const symbols = [
    decoratorImport("Get"),
    decoratorImport(modelDecorator),
    decoratorImport("AuthUserWithPermission"),
    decoratorImport("User"),
  ];
  const parameters = [
    // The page's own permission, on this route alone. A generated route would
    // otherwise answer to anyone who can reach the server, while the layout it
    // feeds is gated; a parameter decorator keeps the gate off every other route
    // the page owns. The class names itself, which its own body can do.
    `\t@AuthUserWithPermission(${pageClass}) _user: User,`,
    `\t@${modelDecorator}(${modelName}) model: ${modelName},`,
  ];
  for (const param of spec.chain.parameters) {
    symbols.push(decoratorImport("Parameter"));
    parameters.push(
      `\t@Parameter(${JSON.stringify(param.routeName)}, ${JSON.stringify(param.in)}) ${param.routeName}: string,`,
    );
  }
  const args = spec.chain.parameters.map(routeArgument).join(", ");
  const response = responseEmission(
    outputForTemplate(spec.template) ?? "scalar",
    spec.response,
    spec.params.op as string | undefined,
  );
  for (const name of response.imports) {
    symbols.push({ name, module: RESPONSE_MODULE });
  }
  const call = `model.${modelMethod}(${args})`;
  const previous = comparisonCall(spec, modelMethod);
  if (previous) {
    // The preceding period reuses the same method with the bounds the route
    // received for it: one calculation, asked twice.
    for (const parameter of COMPARISON_PARAMETERS) {
      symbols.push(decoratorImport("Parameter"));
      parameters.push(
        `\t@Parameter(${JSON.stringify(parameter)}, "query") ${parameter}: string,`,
      );
    }
  }
  const text = [
    `@Get(${JSON.stringify(spec.endpoint)})`,
    `async ${spec.name}(`,
    ...parameters,
    `): ${response.returnType} {`,
    `\treturn ${response.body(call, previous)};`,
    "}",
  ].join("\n");
  return { text, symbols };
}

import type { ImportRef } from "@antelopejs/interface-dms-builder";
import type { CompiledChain, MethodParam } from "./query-template";
import { decoratorImport } from "./resource-emit-types";

/**
 * The prefix new query endpoints default to. Only a default — `AddQueryInput.endpoint`
 * may put a query at any path, and read-back finds queries by their shape, not by
 * where they sit.
 */
export const DEFAULT_ENDPOINT_PREFIX = "/stats/";
export const TENANT_SCHEMA_NAME_VALUE = "dms-tenant";

/** The route's inline structural return type. Scalar output in v1. */
const SCALAR_RETURN = "Promise<{ value: number }>";

export interface CompiledQuery {
  /** Query name — the route method's name. */
  name: string;
  /** The route path, e.g. `/stats/in-stock`. */
  endpoint: string;
  template: string;
  params: Record<string, unknown>;
  chain: CompiledChain;
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

export function queryRouteMethodText(
  spec: CompiledQuery,
  modelName: string,
  schema: string,
  modelMethod: string,
): { text: string; symbols: ImportRef[] } {
  const modelDecorator = modelDecoratorFor(schema);
  const symbols = [decoratorImport("Get"), decoratorImport(modelDecorator)];
  const parameters = [
    `\t@${modelDecorator}(${modelName}) model: ${modelName},`,
  ];
  for (const param of spec.chain.parameters) {
    symbols.push(decoratorImport("Parameter"));
    parameters.push(
      `\t@Parameter(${JSON.stringify(param.routeName)}, ${JSON.stringify(param.in)}) ${param.routeName}: string,`,
    );
  }
  const args = spec.chain.parameters.map(routeArgument).join(", ");
  const text = [
    `@Get(${JSON.stringify(spec.endpoint)})`,
    `async ${spec.name}(`,
    ...parameters,
    `): ${SCALAR_RETURN} {`,
    `\treturn { value: await model.${modelMethod}(${args}) };`,
    "}",
  ].join("\n");
  return { text, symbols };
}

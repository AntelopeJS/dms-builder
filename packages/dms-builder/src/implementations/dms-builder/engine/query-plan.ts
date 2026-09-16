// The calculation a query performs, separated from how it is written and how it
// is run.
//
// A template turns its parameters into a `QueryPlan`; the plan is then the single
// description three consumers share — the emitter below, the reader that
// recognizes an emitted chain, and (next) the executor that runs a draft's
// calculation for a preview without writing a file. Two implementations of the
// same semantics drift at the first fix; one plan with several backends cannot.

import type {
  FilterOp,
  OpWarning,
  QueryParamBinding,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import {
  type CompiledChain,
  checkField,
  fallbackTypeWarning,
  isParamBinding,
  type MethodParam,
} from "./query-template";

/** One conjunct of the plan's row selection. Filters combine with AND. */
export interface PlanFilter {
  field: string;
  op: FilterOp;
  /** A literal baked into the chain, or a value the route supplies per request. */
  value: unknown;
}

/** What the plan computes over the rows it selected. */
export type PlanMeasure =
  | { kind: "count" }
  | { kind: "aggregate"; op: string; field: string };

/**
 * A calculation over one resource: which rows, and what is computed from them.
 * Deliberately says nothing about `this.table`, method bodies or streams — that
 * is each backend's business.
 */
export interface QueryPlan {
  filters: PlanFilter[];
  measure: PlanMeasure;
}

/** Read a template's `where` parameter as the plan's filters. */
export function planFilters(where: unknown): PlanFilter[] {
  if (!Array.isArray(where)) {
    return [];
  }
  return where.map((raw) => {
    const filter = raw as PlanFilter;
    return { field: filter.field, op: filter.op, value: filter.value };
  });
}

function literalText(value: unknown, ts: string): string {
  if (ts === "Date") {
    return `new Date(${JSON.stringify(value)})`;
  }
  return JSON.stringify(value);
}

/**
 * A model parameter name from the field it filters — `minPrice`, `maxPrice`,
 * `priceNot`, or just `price` — never the route's public name. The two names are
 * independent: the route exposes its own, the model reads a meaningful one. On a
 * name clash (two ops on one field), fall back to a numeric suffix.
 */
function deriveName(field: string, op: FilterOp, taken: Set<string>): string {
  const capital = field.charAt(0).toUpperCase() + field.slice(1);
  const base =
    op === "ge" || op === "gt"
      ? `min${capital}`
      : op === "le" || op === "lt"
        ? `max${capital}`
        : op === "ne"
          ? `${field}Not`
          : field;
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}${suffix}`)) {
    suffix++;
  }
  return `${base}${suffix}`;
}

/** What a filter needs to bind one route parameter. */
interface ParamArgument {
  value: QueryParamBinding;
  field: string;
  op: FilterOp;
  ts: string;
  parameters: Map<string, MethodParam>;
  taken: Set<string>;
}

/**
 * Binds the parameter, or reuses the binding a previous filter already made for
 * this public name — `checkParamConflicts` has established they agree. The model
 * parameter is named from this filter's field/op; the body references that name,
 * while the binding's `$param.name` rides along only for the route to expose.
 */
function paramArgument({
  value,
  field,
  op,
  ts,
  parameters,
  taken,
}: ParamArgument): string {
  const routeName = value.$param.name;
  let param = parameters.get(routeName);
  if (!param) {
    const name = deriveName(field, op, taken);
    taken.add(name);
    param = { name, routeName, type: ts, in: value.$param.in ?? "query" };
    parameters.set(routeName, param);
  }
  return param.name;
}

interface EmittedFilters {
  text: string;
  parameters: MethodParam[];
  warnings: OpWarning[];
}

function emitFilters(
  filters: PlanFilter[],
  fields: ResourceFieldStructure[],
): EmittedFilters {
  const parameters = new Map<string, MethodParam>();
  const taken = new Set<string>();
  const warnings: OpWarning[] = [];
  const parts = filters.map((filter) => {
    const resolved = checkField(fields, filter.field, "");
    const ts = "ts" in resolved ? resolved.ts : "string";
    if ("ts" in resolved) {
      warnings.push(...fallbackTypeWarning(filter.field, resolved));
    }
    const argument = isParamBinding(filter.value)
      ? paramArgument({
          value: filter.value,
          field: filter.field,
          op: filter.op,
          ts,
          parameters,
          taken,
        })
      : literalText(filter.value, ts);
    return `.filter((row) => row.key(${JSON.stringify(filter.field)}).${filter.op}(${argument}))`;
  });
  return {
    text: parts.join(""),
    parameters: [...parameters.values()],
    warnings,
  };
}

function measureCall(measure: PlanMeasure): string {
  if (measure.kind === "count") {
    return "count()";
  }
  return `${measure.op}(${JSON.stringify(measure.field)})`;
}

/**
 * The plan as the body of a model method. The one place a chain's text is
 * decided: a template contributes a plan, never a string.
 */
export function emitPlan(
  plan: QueryPlan,
  fields: ResourceFieldStructure[],
): CompiledChain {
  const filters = emitFilters(plan.filters, fields);
  return {
    body: `{\n\treturn this.table${filters.text}.${measureCall(plan.measure)};\n}`,
    parameters: filters.parameters,
    warnings: filters.warnings,
  };
}

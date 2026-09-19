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
 * The periods a date field is bucketed into before grouping.
 *
 * No week: neither adapter exposes an ISO week, and deriving one from the day of
 * the year puts the first days of January in a week that belongs to the previous
 * year. A wrong week is worse than a missing one.
 */
export const PLAN_BUCKETS = ["day", "month", "quarter", "year"] as const;
export type PlanBucket = (typeof PLAN_BUCKETS)[number];

/** How the rows are grouped: by a field's value, or by a period of a date field. */
export interface PlanGroup {
  field: string;
  /** Absent for a plain field; set to bucket a date field into periods. */
  bucket?: PlanBucket;
  /**
   * IANA zone the bucket is computed in. The database extracts in UTC when this
   * is absent, which shifts every row near a period boundary into its neighbour.
   */
  timezone?: string;
}

/** Ordering of the groups: by the group itself, or by what was measured. */
export interface PlanOrder {
  by: "group" | "measure";
  direction: "asc" | "desc";
}

/**
 * A calculation over one resource: which rows, how they are grouped, what is
 * computed from them, and which of the results are kept.
 *
 * Deliberately says nothing about `this.table`, method bodies or streams — that
 * is each backend's business.
 */
export interface QueryPlan {
  filters: PlanFilter[];
  measure: PlanMeasure;
  /** Absent for a scalar: the measure is taken over every selected row at once. */
  group?: PlanGroup;
  order?: PlanOrder;
  /** Keeps the first N groups after ordering — a top N. */
  limit?: number;
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

function measureCall(measure: PlanMeasure, over: string): string {
  if (measure.kind === "count") {
    return "count()";
  }
  return `${measure.op}(${JSON.stringify(over)})`;
}

/** The zone argument the date extractors take, or nothing when none was asked for. */
function zoneArgument(group: PlanGroup): string {
  return group.timezone ? JSON.stringify(group.timezone) : "";
}

/**
 * A date field reduced to one ordered number per period: `2026` for a year,
 * `202601` for a month, `20260114` for a day.
 *
 * A number rather than a label, because the group is also what the series is
 * ordered by — and because a label belongs to the response, which knows the
 * viewer's locale, not to a chain compiled into the source. The response envelope
 * turns it back into a date.
 */
function bucketExpression(group: PlanGroup, row: string): string {
  const zone = zoneArgument(group);
  const part = (name: string) =>
    `${row}.key(${JSON.stringify(group.field)}).${name}(${zone})`;
  const year = part("year");
  if (group.bucket === "year") {
    return year;
  }
  if (group.bucket === "quarter") {
    // Months are 1-based, so the quarter is (month - 1) / 3 floored, plus one.
    return `${year}.mul(10).add(${part("month")}.sub(1).div(3).floor().add(1))`;
  }
  const month = `${year}.mul(100).add(${part("month")})`;
  if (group.bucket === "month") {
    return month;
  }
  return `${month}.mul(100).add(${part("day")})`;
}

/** The projected field a bucketed group is grouped on. */
/**
 * Which period an emitted bucket expression computes, by rebuilding each
 * candidate and comparing — the emitter is the grammar, so a reader asking it
 * cannot drift from what was written.
 *
 * Whitespace is ignored on both sides: the expression is read out of a file a
 * formatter may have rewrapped since it was emitted.
 */
export function readBucketExpression(
  text: string,
  row: string,
  field: string,
  timezone?: string,
): PlanBucket | undefined {
  const squeeze = (value: string) => value.replace(/\s+/g, "");
  const target = squeeze(text);
  return PLAN_BUCKETS.find(
    (bucket) =>
      squeeze(bucketExpression({ field, bucket, timezone }, row)) === target,
  );
}

const GROUP_KEY = "bucket";
/** The projected field a bucketed aggregate measures, the row being replaced. */
const VALUE_KEY = "value";
/** The mapper's parameter: the group being folded, whatever it was grouped by. */
const GROUP_PARAM = "group";

/**
 * Projects what the grouping needs before grouping on it.
 *
 * Only a bucketed group needs this: `group` takes a field name, not an
 * expression, so the period has to become a field of its own first. The measured
 * field rides along, since the projection replaces the row.
 */
function bucketProjection(plan: QueryPlan, group: PlanGroup): string {
  const members = [`${GROUP_KEY}: ${bucketExpression(group, "row")}`];
  if (plan.measure.kind === "aggregate") {
    members.push(
      `${VALUE_KEY}: row.key(${JSON.stringify(plan.measure.field)})`,
    );
  }
  return `.map((row) => ({ ${members.join(", ")} }))`;
}

function orderCall(order: PlanOrder | undefined): string {
  if (!order) {
    return "";
  }
  const key = order.by === "group" ? "x" : "y";
  return `.orderBy(${JSON.stringify(key)}, ${JSON.stringify(order.direction)})`;
}

function limitCall(limit: number | undefined): string {
  return limit === undefined ? "" : `.slice(0, ${limit})`;
}

/**
 * The grouped form: one row per group, shaped as the points a series is made of.
 *
 * `x`/`y` rather than the field's own names because every consumer of a grouped
 * result reads points, and naming them here keeps the response envelope from
 * having to know which field was grouped on.
 */
function emitGrouped(
  plan: QueryPlan,
  group: PlanGroup,
  filterText: string,
): string {
  const bucketed = group.bucket !== undefined;
  const projection = bucketed ? bucketProjection(plan, group) : "";
  const key = bucketed ? GROUP_KEY : group.field;
  const measuredField =
    bucketed && plan.measure.kind === "aggregate" ? VALUE_KEY : "";
  const over =
    plan.measure.kind === "aggregate"
      ? measuredField || plan.measure.field
      : "";
  const mapper = `(rows, ${GROUP_PARAM}) => ({ x: ${GROUP_PARAM}, y: rows.${measureCall(plan.measure, over)} })`;
  return (
    `this.table${filterText}${projection}` +
    `.group(${JSON.stringify(key)}, ${mapper})` +
    `${orderCall(plan.order)}${limitCall(plan.limit)}`
  );
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
  const chain = plan.group
    ? emitGrouped(plan, plan.group, filters.text)
    : `this.table${filters.text}.${measureCall(
        plan.measure,
        plan.measure.kind === "aggregate" ? plan.measure.field : "",
      )}`;
  return {
    body: `{\n\treturn ${chain};\n}`,
    parameters: filters.parameters,
    warnings: filters.warnings,
  };
}

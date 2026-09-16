// Running a plan instead of writing it.
//
// The second backend over `QueryPlan`: the same calculation built as real calls
// on a table handle rather than as source text, so a draft's data can be shown
// before anything reaches disk. It mirrors the emitter branch for branch on
// purpose — the two are checked against each other by transcribing this one back
// into the text the other produces.

import type { ResourceFieldStructure } from "@antelopejs/interface-dms-builder";
import type {
  PlanFilter,
  PlanGroup,
  PlanMeasure,
  QueryPlan,
} from "./query-plan";
import { checkField, isParamBinding } from "./query-template";

/** A value in a query, as the database's proxy exposes it. */
export interface PlanValue {
  eq(value: unknown): PlanValue;
  ne(value: unknown): PlanValue;
  gt(value: unknown): PlanValue;
  ge(value: unknown): PlanValue;
  lt(value: unknown): PlanValue;
  le(value: unknown): PlanValue;
  year(timezone?: string): PlanValue;
  month(timezone?: string): PlanValue;
  day(timezone?: string): PlanValue;
  mul(value: unknown): PlanValue;
  div(value: unknown): PlanValue;
  add(value: unknown): PlanValue;
  sub(value: unknown): PlanValue;
  floor(): PlanValue;
}

export interface PlanRow {
  key(field: string): PlanValue;
}

/** The stream surface the executor drives, named for what the plan needs of it. */
export interface PlanStream {
  filter(predicate: (row: PlanRow) => unknown): PlanStream;
  map(mapper: (row: PlanRow) => unknown): PlanStream;
  group(
    index: string,
    mapper: (rows: PlanStream, group: unknown) => unknown,
  ): PlanStream;
  orderBy(index: string, direction?: "asc" | "desc"): PlanStream;
  slice(offset: number, count?: number): PlanStream;
  count(field?: string): unknown;
  sum(field?: string): unknown;
  avg(field?: string): unknown;
  min(field?: string): unknown;
  max(field?: string): unknown;
}

/** Values the route would supply per request, by the name the route exposes. */
export type PlanArguments = Record<string, unknown>;

class MissingArgument extends Error {
  constructor(name: string) {
    super(`no value supplied for the "${name}" parameter`);
  }
}

/**
 * The value a filter compares against: the literal it bakes in, or the argument
 * standing in for it — coerced to a date when the field is one, as the generated
 * route's own coercion does.
 */
function filterValue(
  filter: PlanFilter,
  fields: ResourceFieldStructure[],
  args: PlanArguments,
): unknown {
  const resolved = checkField(fields, filter.field, "");
  const ts = "ts" in resolved ? resolved.ts : "string";
  let value = filter.value;
  if (isParamBinding(filter.value)) {
    const name = filter.value.$param.name;
    if (!(name in args)) {
      throw new MissingArgument(name);
    }
    value = args[name];
  }
  if (ts === "Date" && !(value instanceof Date)) {
    return new Date(value as string | number);
  }
  return value;
}

function applyFilters(
  stream: PlanStream,
  plan: QueryPlan,
  fields: ResourceFieldStructure[],
  args: PlanArguments,
): PlanStream {
  return plan.filters.reduce(
    (narrowed, filter) =>
      narrowed.filter((row) => {
        const value = filterValue(filter, fields, args);
        return row.key(filter.field)[filter.op](value);
      }),
    stream,
  );
}

/** The same period arithmetic the emitter writes, as calls. */
function bucketValue(row: PlanRow, group: PlanGroup): PlanValue {
  const zone = group.timezone;
  const part = (name: "year" | "month" | "day") =>
    row.key(group.field)[name](zone);
  const year = part("year");
  if (group.bucket === "year") {
    return year;
  }
  if (group.bucket === "quarter") {
    return year.mul(10).add(part("month").sub(1).div(3).floor().add(1));
  }
  const month = year.mul(100).add(part("month"));
  return group.bucket === "month" ? month : month.mul(100).add(part("day"));
}

function measureOver(
  rows: PlanStream,
  measure: PlanMeasure,
  over: string,
): unknown {
  if (measure.kind === "count") {
    return rows.count();
  }
  const aggregate = measure.op as "sum" | "avg" | "min" | "max";
  return rows[aggregate](over);
}

function applyGroup(
  stream: PlanStream,
  plan: QueryPlan,
  group: PlanGroup,
): PlanStream {
  const bucketed = group.bucket !== undefined;
  const projected = bucketed
    ? stream.map((row) => {
        const members: Record<string, unknown> = {
          bucket: bucketValue(row, group),
        };
        if (plan.measure.kind === "aggregate") {
          members.value = row.key(plan.measure.field);
        }
        return members;
      })
    : stream;
  const key = bucketed ? "bucket" : group.field;
  const over =
    plan.measure.kind === "aggregate"
      ? bucketed
        ? "value"
        : plan.measure.field
      : "";
  const grouped = projected.group(key, (rows, current) => ({
    x: current,
    y: measureOver(rows, plan.measure, over),
  }));
  const ordered = plan.order
    ? grouped.orderBy(
        plan.order.by === "group" ? "x" : "y",
        plan.order.direction,
      )
    : grouped;
  return plan.limit === undefined ? ordered : ordered.slice(0, plan.limit);
}

/**
 * Build the plan against a table handle. The result is what the database's own
 * chain answers — awaitable, a number for a scalar plan and one point per group
 * for a grouped one — so a caller awaits it as it would any query.
 *
 * Throws when an argument a filter binds was not supplied, rather than running a
 * query with a missing bound value in it.
 */
export function executePlan(
  table: PlanStream,
  plan: QueryPlan,
  fields: ResourceFieldStructure[],
  args: PlanArguments = {},
): unknown {
  const narrowed = applyFilters(table, plan, fields, args);
  if (plan.group) {
    return applyGroup(narrowed, plan, plan.group);
  }
  return measureOver(
    narrowed,
    plan.measure,
    plan.measure.kind === "aggregate" ? plan.measure.field : "",
  );
}

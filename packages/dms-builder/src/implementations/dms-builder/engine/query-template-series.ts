// The `series` template: one measure per group, which is what a chart, a top N
// and any other multi-point block reads.
//
// Kept beside the scalar templates rather than inside them because its parameter
// surface is where most of a data source's configuration lands — grouping,
// ordering and the period bucket — and because its chain is the one the reader
// has yet to learn.

import type {
  OptionSchema,
  ResourceFieldStructure,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import {
  type PlanBucket,
  PLAN_BUCKETS,
  type PlanGroup,
  type PlanMeasure,
  type PlanOrder,
  emitPlan,
  planFilters,
} from "./query-plan";
import {
  AGGREGATE_OPS,
  checkField,
  issue,
  type QueryTemplate,
  scanForExpr,
} from "./query-template";
import { checkFilters, whereSchema } from "./query-where";
import { readSeriesChain, type SeriesChain } from "./query-chain-series";
import { whereParams } from "./query-chain";
import { describeValue } from "./describe-value";

const ORDER_KEYS = ["group", "measure"] as const;
const ORDER_DIRECTIONS = ["asc", "desc"] as const;
const MAX_LIMIT = 1000;

interface SeriesParams {
  op?: unknown;
  field?: unknown;
  groupBy?: unknown;
  bucket?: unknown;
  timezone?: unknown;
  orderBy?: unknown;
  direction?: unknown;
  limit?: unknown;
  where?: unknown;
}

function measureOf(params: SeriesParams): PlanMeasure {
  return params.op === "count" || params.op === undefined
    ? { kind: "count" }
    : {
        kind: "aggregate",
        op: params.op as string,
        field: params.field as string,
      };
}

function groupOf(params: SeriesParams): PlanGroup {
  return {
    field: params.groupBy as string,
    bucket: params.bucket as PlanBucket | undefined,
    timezone: params.timezone as string | undefined,
  };
}

function orderOf(params: SeriesParams): PlanOrder | undefined {
  if (params.orderBy === undefined && params.direction === undefined) {
    // A grouped result comes back in whatever order the database produced —
    // MongoDB does not order groups — so an unordered series would draw its
    // points scrambled. Ordering by the group ascending is what a timeline wants.
    return { by: "group", direction: "asc" };
  }
  return {
    by: (params.orderBy as PlanOrder["by"] | undefined) ?? "group",
    direction:
      (params.direction as PlanOrder["direction"] | undefined) ?? "asc",
  };
}

/** The measure half: `count`, or an aggregate over a numeric field. */
function checkMeasure(
  params: SeriesParams,
  fields: ResourceFieldStructure[],
): ValidationIssue[] {
  if (params.op === undefined || params.op === "count") {
    return [];
  }
  if (typeof params.op !== "string" || !AGGREGATE_OPS.has(params.op)) {
    return [
      issue(
        "/op",
        `op must be count or one of ${[...AGGREGATE_OPS].join(", ")}`,
      ),
    ];
  }
  const resolved = checkField(fields, params.field, "/field");
  if ("pointer" in resolved) {
    return [resolved];
  }
  return resolved.ts === "number"
    ? []
    : [
        issue(
          "/field",
          `field ${describeValue(params.field)} is not numeric; ${params.op} needs a number field`,
        ),
      ];
}

/** The grouping half: a field, and the period a date field is bucketed into. */
function checkGroup(
  params: SeriesParams,
  fields: ResourceFieldStructure[],
): ValidationIssue[] {
  const resolved = checkField(fields, params.groupBy, "/groupBy");
  if ("pointer" in resolved) {
    return [resolved];
  }
  if (params.bucket === undefined) {
    // A point's group reaches the response as `number | string`, which is what a
    // chart plots and a list labels. Grouping on anything else emits code that
    // fails to typecheck, and a diagnostic is not something a caller can act on.
    return resolved.ts === "string" || resolved.ts === "number"
      ? []
      : [
          issue(
            "/groupBy",
            `field ${describeValue(params.groupBy)} is a ${resolved.ts}; group by a text or numeric field, or bucket a date field into periods`,
          ),
        ];
  }
  if (
    typeof params.bucket !== "string" ||
    !PLAN_BUCKETS.includes(params.bucket as PlanBucket)
  ) {
    return [
      issue("/bucket", `bucket must be one of ${PLAN_BUCKETS.join(", ")}`),
    ];
  }
  if (resolved.ts !== "Date") {
    return [
      issue(
        "/bucket",
        `field ${describeValue(params.groupBy)} is not a date; only a date field can be bucketed into periods`,
      ),
    ];
  }
  return params.timezone === undefined || typeof params.timezone === "string"
    ? []
    : [
        issue(
          "/timezone",
          "timezone must be an IANA zone name, e.g. Europe/Brussels",
        ),
      ];
}

function checkOrderAndLimit(params: SeriesParams): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (
    params.orderBy !== undefined &&
    !ORDER_KEYS.includes(params.orderBy as (typeof ORDER_KEYS)[number])
  ) {
    issues.push(
      issue("/orderBy", `orderBy must be ${ORDER_KEYS.join(" or ")}`),
    );
  }
  if (
    params.direction !== undefined &&
    !ORDER_DIRECTIONS.includes(
      params.direction as (typeof ORDER_DIRECTIONS)[number],
    )
  ) {
    issues.push(
      issue("/direction", `direction must be ${ORDER_DIRECTIONS.join(" or ")}`),
    );
  }
  if (params.limit !== undefined) {
    const limit = params.limit;
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_LIMIT
    ) {
      issues.push(
        issue(
          "/limit",
          `limit must be a whole number between 1 and ${MAX_LIMIT}`,
        ),
      );
    }
  }
  return issues;
}

function seriesParamsSchema(): Record<string, OptionSchema> {
  return {
    op: {
      type: "string",
      enum: ["count", ...AGGREGATE_OPS],
      optional: true,
      description: "What to measure in each group. Defaults to count.",
    },
    field: {
      type: "string",
      optional: true,
      description:
        "The numeric field the measure reads. Required for every op but count.",
    },
    groupBy: {
      type: "string",
      description: "The field the rows are grouped by.",
    },
    bucket: {
      type: "string",
      enum: [...PLAN_BUCKETS],
      optional: true,
      description:
        "Groups a date field by period instead of by exact value. Only for a date field.",
    },
    timezone: {
      type: "string",
      optional: true,
      description:
        "IANA zone the period is computed in, e.g. Europe/Brussels. Omit to bucket in UTC, which shifts rows near a period boundary.",
    },
    orderBy: {
      type: "string",
      enum: [...ORDER_KEYS],
      optional: true,
      description:
        "Order the points by their group (a timeline) or by what was measured (a ranking). Defaults to group.",
    },
    direction: {
      type: "string",
      enum: [...ORDER_DIRECTIONS],
      optional: true,
      description: "Defaults to ascending.",
    },
    limit: {
      type: "number",
      optional: true,
      description: `Keep only the first N points after ordering — a top N. At most ${MAX_LIMIT}.`,
    },
    where: { ...whereSchema(), optional: true },
  };
}

/**
 * A read chain as the parameters that would produce it. Only what was written is
 * reported: a default the emitter always applies — the ordering every series
 * carries — comes back explicitly, since a caller editing these params and
 * sending them again must get the same chain.
 */
function seriesParams(chain: SeriesChain): Record<string, unknown> {
  const params: Record<string, unknown> = { groupBy: chain.group.field };
  if (chain.measure.kind === "aggregate") {
    params.op = chain.measure.op;
    params.field = chain.measure.field;
  }
  if (chain.group.bucket) {
    params.bucket = chain.group.bucket;
  }
  if (chain.group.timezone) {
    params.timezone = chain.group.timezone;
  }
  if (chain.order) {
    params.orderBy = chain.order.by;
    params.direction = chain.order.direction;
  }
  if (chain.limit !== undefined) {
    params.limit = chain.limit;
  }
  return { ...params, ...whereParams(chain.filters) };
}

export function seriesTemplate(): QueryTemplate {
  return {
    descriptor: {
      id: "series",
      resourceType: "database-table",
      title: "Series",
      description:
        "Measures rows per group — by a field's value, or by day, month, quarter or year of a date field — and answers one point per group.",
      output: "series",
      params: seriesParamsSchema(),
    },
    validate: (params, fields) => [
      ...scanForExpr(params),
      ...checkFilters(params.where, fields),
      ...checkMeasure(params, fields),
      ...checkGroup(params, fields),
      ...checkOrderAndLimit(params),
    ],
    compile: (params, fields) =>
      emitPlan(
        {
          filters: planFilters(params.where),
          measure: measureOf(params),
          group: groupOf(params),
          order: orderOf(params),
          limit: params.limit as number | undefined,
        },
        fields,
      ),
    parse: (method) => {
      const chain = readSeriesChain(method);
      return chain ? seriesParams(chain) : undefined;
    },
  };
}

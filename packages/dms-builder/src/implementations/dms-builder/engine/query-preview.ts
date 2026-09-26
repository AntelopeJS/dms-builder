// Running one of a draft's queries against the real database, so a block can be
// shown its own data before anything is written.
//
// The calculation is the plan the template describes — the same one the emitter
// would have written into a model method — so what a preview shows is what the
// saved page will answer, not an approximation of it.

import { Schema } from "@antelopejs/interface-database";
import type {
  AddQueryInput,
  OpResult,
  QueryOutputKind,
  QueryPoint,
  QueryPreview,
  QueryResponseBody,
  QueryResponseShape,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import { invalidConfig, notFound, unsupported } from "./ops";
import {
  COMPARISON_PARAMETERS,
  isPerTenantSchema,
  outputForTemplate,
  RESPONSE_HELPERS,
  RESPONSE_KEYS,
  RESPONSE_MODULE,
  seriesNaming,
  type SeriesNaming,
} from "./query-emit";
import {
  executePlan,
  type PlanArguments,
  type PlanStream,
} from "./query-plan-execute";
import type { QueryPlan } from "./query-plan";
import { getQueryTemplate, isParamBinding } from "./query-template";
import { findResourceRecord } from "./resource-index";
import { buildResourceStructure } from "./resource-structure";

/** How many points a preview will return before it says it stopped early. */
const PREVIEW_LIMIT = 500;

export interface PreviewRequest {
  query: AddQueryInput;
  /** Values the route would receive, by the name it exposes them under. */
  args?: PlanArguments;
  /**
   * The tenant whose rows to read. A resource in a per-tenant schema has one
   * table per tenant, and reading the wrong one is worse than reading none.
   */
  tenant?: string;
}

/**
 * The instance a preview reads: the one the saved route's model resolves to.
 *
 * Only a per-tenant schema is read at the request's tenant. A table in any
 * other has a single, shared instance, and asking it for the tenant's instance
 * reads an empty one — every preview then answered "no rows" over a table full
 * of them.
 */
export function previewInstance(
  schema: string,
  tenant: string | undefined,
): string | undefined {
  return isPerTenantSchema(schema) ? tenant : undefined;
}

/**
 * The table a resource's rows live in, through the same schema handle the
 * generated model would resolve — no model class is involved, because the class
 * a draft describes does not exist on disk yet.
 */
function openTable(
  schemaId: string,
  tableName: string,
  tenant: string | undefined,
): PlanStream | undefined {
  const schema = Schema.get(schemaId);
  if (!schema) {
    return undefined;
  }
  const instance = tenant ? schema.instance(tenant) : schema.instance();
  // The table handle is the surface a plan drives, narrowed to the calls a plan
  // can make. Typed as unknown first so the widening is one deliberate step.
  const table: unknown = instance.table(tableName);
  return table as PlanStream;
}

type ResponseArranger = (
  points: QueryPoint[],
  options: SeriesNaming & { previous?: QueryPoint[] },
) => QueryResponseBody;

/**
 * The helper the generated route would call, from the DMS this app is running.
 *
 * Resolved at call time rather than imported: the arrangements are published by a
 * DMS newer than this module's floor, and on an older one a preview has to refuse
 * — saving the same query would fail its typecheck — rather than quietly answer a
 * different envelope than the page would serve.
 */
function responseArranger(shape: string): ResponseArranger | undefined {
  const name = RESPONSE_HELPERS[shape];
  if (!name) {
    return undefined;
  }
  try {
    const published = require(RESPONSE_MODULE) as Record<string, unknown>;
    const helper = published[name];
    return typeof helper === "function"
      ? (helper as ResponseArranger)
      : undefined;
  } catch {
    return undefined;
  }
}

/** What the table answered: a figure, or the points, capped where it stopped. */
interface ReadRows {
  points?: QueryPoint[];
  value?: number;
  truncated: boolean;
}

function readRows(rows: unknown): ReadRows {
  if (!Array.isArray(rows)) {
    return { value: Number(rows), truncated: false };
  }
  return {
    points: (rows as QueryPoint[]).slice(0, PREVIEW_LIMIT),
    truncated: rows.length > PREVIEW_LIMIT,
  };
}

/**
 * The envelope the query's route would serve, built from what the table answered.
 *
 * Mirrors the emitter's own decision: a scalar calculation answers the figure
 * itself whatever arrangement was asked for — there is nothing else in it to
 * arrange — a grouped one defaults to its points, and the three arrangements are
 * built by the helper the route would have called, so the preview and the page
 * cannot diverge on a rounding, a label or a missing group.
 */
function arrange(
  read: ReadRows,
  output: QueryOutputKind,
  requested: QueryResponseShape | undefined,
  naming: SeriesNaming,
  previous?: QueryPoint[],
): OpResult<QueryPreview> {
  const points = read.points;
  if (output === "scalar" || !points) {
    return preview({
      output,
      body: { [RESPONSE_KEYS.scalar]: read.value },
      truncated: false,
    });
  }
  const shape = requested ?? "series";
  if (shape === "series") {
    return preview({
      output,
      body: { [RESPONSE_KEYS.series]: points },
      truncated: read.truncated,
    });
  }
  const arranger = responseArranger(shape);
  if (!arranger) {
    return unsupported<QueryPreview>(
      `the installed DMS does not publish ${RESPONSE_HELPERS[shape]}, so a "${shape}" response cannot be built — the route saving it would not compile either`,
    );
  }
  return preview({
    output,
    response: shape,
    body: arranger(points, previous ? { ...naming, previous } : naming),
    truncated: read.truncated,
  });
}

/**
 * The arguments the route hands the calculation for the preceding period: the
 * comparison's bounds, in the place of the two date bounds the query binds — the
 * same substitution the emitted route makes. None when the query binds no such
 * pair, or the caller sent no comparison bounds.
 */
function precedingArguments(
  plan: QueryPlan,
  fields: ResourceFieldStructure[],
  args: PlanArguments,
): PlanArguments | undefined {
  const dates = new Set(
    fields
      .filter((field) => field.dataType?.$dataType === "date")
      .map((field) => field.name),
  );
  const bounds = [
    ...new Set(
      plan.filters.flatMap((filter) =>
        dates.has(filter.field) && isParamBinding(filter.value)
          ? [filter.value.$param.name]
          : [],
      ),
    ),
  ];
  if (bounds.length !== COMPARISON_PARAMETERS.length) {
    return undefined;
  }
  const preceding: PlanArguments = { ...args };
  for (const [at, name] of bounds.entries()) {
    const value = args[COMPARISON_PARAMETERS[at]];
    if (value === undefined) {
      return undefined;
    }
    preceding[name] = value;
  }
  return preceding;
}

/** A preview writes nothing, so there is nothing for a caller to diff. */
function preview(data: QueryPreview): OpResult<QueryPreview> {
  return { ok: true, data, changes: [] };
}

/**
 * Run a query against a table already opened.
 *
 * Split from resolving the schema so the part that decides what a preview says —
 * validation, the shape of the answer, where it stops reading — can be driven
 * without a database behind it.
 */
export async function runPlanPreview(
  table: PlanStream,
  request: PreviewRequest,
  fields: ResourceFieldStructure[],
): Promise<OpResult<QueryPreview>> {
  const { query } = request;
  const template = getQueryTemplate(query.template);
  if (!template) {
    return invalidConfig<QueryPreview>(
      `unknown query template "${query.template}"; call ListQueryTemplates for valid ids`,
    );
  }
  const params = query.params ?? {};
  const issues = template.validate(params, fields);
  if (issues.length > 0) {
    return { ok: false, error: { code: "invalid_config", issues } };
  }
  try {
    const plan = template.plan(params, fields);
    const args = request.args ?? {};
    const rows = await executePlan(table, plan, fields, args);
    // The period before, read the way the route reads it, so the card's
    // variation shows before the page is saved.
    const preceding = query.compare
      ? precedingArguments(plan, fields, args)
      : undefined;
    const previous = preceding
      ? readRows(await executePlan(table, plan, fields, preceding)).points
      : undefined;
    return arrange(
      readRows(rows),
      outputForTemplate(query.template) ??
        (Array.isArray(rows) ? "series" : "scalar"),
      query.response,
      seriesNaming(params, fields, query.resource),
      previous,
    );
  } catch (error) {
    return unsupported<QueryPreview>(
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Run a query the caller has not saved, and answer what its route would.
 *
 * Read-only by construction: a plan describes filters, a grouping and a measure,
 * and there is no way to express a write in one.
 */
export async function runQueryPreview(
  request: PreviewRequest,
): Promise<OpResult<QueryPreview>> {
  const { query } = request;
  const record = findResourceRecord(query.resource);
  if (!record) {
    return notFound<QueryPreview>(query.resource);
  }
  const template = getQueryTemplate(query.template);
  if (!template) {
    return invalidConfig<QueryPreview>(
      `unknown query template "${query.template}"; call ListQueryTemplates for valid ids`,
    );
  }
  const structure = buildResourceStructure(query.resource);
  if (!structure.ok) {
    return structure as OpResult<QueryPreview>;
  }
  const table = openTable(
    record.schema,
    record.tableName,
    previewInstance(record.schema, request.tenant),
  );
  if (!table) {
    // No database wired, or a schema the app never registered: a preview cannot
    // invent rows, and saying so beats an empty chart the caller reads as data.
    return unsupported<QueryPreview>(
      `schema "${record.schema}" is not registered, so there is no table to read`,
    );
  }
  return runPlanPreview(table, request, structure.data.fields);
}

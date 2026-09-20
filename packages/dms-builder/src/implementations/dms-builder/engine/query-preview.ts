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
import { getQueryTemplate } from "./query-template";
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
  options: SeriesNaming,
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
    body: arranger(points, naming),
    truncated: read.truncated,
  });
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
    const rows = await executePlan(
      table,
      template.plan(params, fields),
      fields,
      request.args ?? {},
    );
    return arrange(
      readRows(rows),
      outputForTemplate(query.template) ??
        (Array.isArray(rows) ? "series" : "scalar"),
      query.response,
      seriesNaming(params, fields, query.resource),
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
  const table = openTable(record.schema, record.tableName, request.tenant);
  if (!table) {
    // No database wired, or a schema the app never registered: a preview cannot
    // invent rows, and saying so beats an empty chart the caller reads as data.
    return unsupported<QueryPreview>(
      `schema "${record.schema}" is not registered, so there is no table to read`,
    );
  }
  return runPlanPreview(table, request, structure.data.fields);
}

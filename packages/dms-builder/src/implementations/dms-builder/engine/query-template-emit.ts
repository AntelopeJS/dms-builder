// The templates the engine ships: what each accepts as parameters, what it
// computes, and how it reads itself back from emitted code.
//
// The chain's text is rendered by query-plan.ts: a template describes a plan, it
// does not write code.

import type {
  OptionSchema,
  ResourceFieldStructure,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { stringLiteralValue } from "./literals";
import { emitPlan, planFilters } from "./query-plan";
import { FILTER_OPS, readChain, whereParams } from "./query-chain";
import { describeValue } from "./describe-value";
import {
  AGGREGATE_OPS,
  checkField,
  checkFilter,
  checkParamConflicts,
  issue,
  QueryTemplate,
  registerQueryTemplate,
  scanForExpr,
} from "./query-template";
/** Validates a `where` clause: an optional array of well-typed filters. */
export function checkFilters(
  where: unknown,
  fields: ResourceFieldStructure[],
  pointer = "/where",
): ValidationIssue[] {
  if (where === undefined) {
    return [];
  }
  if (!Array.isArray(where)) {
    return [issue(pointer, "where must be an array of filters")];
  }
  const issues = where.flatMap((filter, index) =>
    checkFilter(filter, fields, `${pointer}/${index}`),
  );
  return issues.length > 0 ? issues : checkParamConflicts(where, fields);
}

function countTemplate(): QueryTemplate {
  return {
    descriptor: {
      id: "count",
      resourceType: "database-table",
      title: "Count",
      description: "Counts the rows matching an optional filter.",
      output: "scalar",
      params: { where: { ...whereSchema(), optional: true } },
    },
    validate: (params, fields) => [
      ...scanForExpr(params),
      ...checkFilters(params.where, fields),
    ],
    compile: (params, fields) =>
      emitPlan(
        { filters: planFilters(params.where), measure: { kind: "count" } },
        fields,
      ),
    parse: (method) => {
      const chain = readChain(method);
      if (
        !chain ||
        chain.terminalName !== "count" ||
        chain.terminalArgs.length !== 0
      ) {
        return undefined;
      }
      return whereParams(chain.filters);
    },
  };
}

function aggregateTemplate(): QueryTemplate {
  return {
    descriptor: {
      id: "aggregate",
      resourceType: "database-table",
      title: "Aggregate",
      description:
        "Sums, averages, or takes the min/max of a numeric field over the rows matching an optional filter.",
      output: "scalar",
      params: {
        op: {
          type: "string",
          enum: [...AGGREGATE_OPS],
          description: "Which aggregate to take over the matching rows.",
        },
        field: {
          type: "string",
          description:
            "The numeric field to aggregate. A non-numeric field is rejected.",
        },
        where: { ...whereSchema(), optional: true },
      },
    },
    validate: (params, fields) => {
      const issues = [
        ...scanForExpr(params),
        ...checkFilters(params.where, fields),
      ];
      if (typeof params.op !== "string" || !AGGREGATE_OPS.has(params.op)) {
        issues.push(
          issue("/op", `op must be one of ${[...AGGREGATE_OPS].join(", ")}`),
        );
      }
      const resolved = checkField(fields, params.field, "/field");
      if ("pointer" in resolved) {
        issues.push(resolved);
      } else if (resolved.ts !== "number") {
        issues.push(
          issue(
            "/field",
            `field ${describeValue(params.field)} is not numeric; aggregate needs a number field`,
          ),
        );
      }
      return issues;
    },
    compile: (params, fields) =>
      emitPlan(
        {
          filters: planFilters(params.where),
          measure: {
            kind: "aggregate",
            op: params.op as string,
            field: params.field as string,
          },
        },
        fields,
      ),
    parse: (method) => {
      const chain = readChain(method);
      if (
        !chain ||
        !AGGREGATE_OPS.has(chain.terminalName) ||
        chain.terminalArgs.length !== 1
      ) {
        return undefined;
      }
      const field = stringLiteralValue(chain.terminalArgs[0]);
      if (field === undefined) {
        return undefined;
      }
      return { op: chain.terminalName, field, ...whereParams(chain.filters) };
    },
  };
}

/**
 * A filter value is either baked into the chain or bound to a request parameter.
 * The two shapes are spelled out rather than left as a bare `object`, so a caller
 * reading the descriptor learns the `$param` sentinel from the schema instead of
 * from prose that has to be kept in step with it.
 */
function filterValueSchema(): OptionSchema {
  return {
    type: "unknown",
    description:
      "Either a literal matching the field's type (baked into the chain), or a $param binding (supplied per request).",
    oneOf: [
      {
        type: "string",
        description:
          "A literal. Must match the field's type; a date field takes an ISO string.",
      },
      { type: "number", description: "A numeric literal." },
      { type: "boolean", description: "A boolean literal." },
      {
        type: "object",
        description:
          "Binds this filter to a request parameter instead of baking a value in, so one query answers any value the caller passes.",
        properties: {
          $param: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  "camelCase identifier; becomes the parameter's name (e.g. `min` → `?min=25`).",
              },
              in: {
                type: "string",
                enum: ["query", "param"],
                optional: true,
                description:
                  "Where the route reads the value. Defaults to `query` (`?name=…`). `param` reads a path segment, so the query's endpoint must declare a matching `:name` — the `/stats/…` default has none, so prefer `query` unless the value belongs in the path.",
              },
            },
          },
        },
      },
    ],
  };
}

function whereSchema(): OptionSchema {
  return {
    type: "array",
    description:
      "Filters combined with AND. Omit for no filtering. Two filters may bind the same $param name if they agree on its type and source.",
    items: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description:
            "A field of the resource — must exist and not be opaque (see GetResourceStructure).",
        },
        op: {
          type: "string",
          enum: [...FILTER_OPS],
          description:
            "Comparison. The ordering ops (gt/ge/lt/le) are rejected on boolean and select fields.",
        },
        value: filterValueSchema(),
      },
    },
  };
}

/**
 * Fill the template registry with the templates the engine ships.
 *
 * Called explicitly by the implementation's entry point rather than run as an
 * import side effect: nothing else imports this module for a value, so a bare
 * side-effecting import reads as dead to a linter and was already dropped once —
 * leaving the registry empty, every `AddQuery` failing on an unknown template and
 * every written query reading back as opaque.
 */
export function registerBuiltinQueryTemplates(): void {
  registerQueryTemplate(countTemplate());
  registerQueryTemplate(aggregateTemplate());
}

import { expect } from "chai";
import { runPlanPreview } from "../implementations/dms-builder/engine/query-preview";
import type { PlanStream } from "../implementations/dms-builder/engine/query-plan-execute";
import { registerBuiltinQueryTemplates } from "../implementations/dms-builder/engine/query-template-emit";
import type { ResourceFieldStructure } from "@antelopejs/interface-dms-builder";

function field(name: string, dataType: string): ResourceFieldStructure {
  return { name, dataType: { $dataType: dataType } } as ResourceFieldStructure;
}

const FIELDS = [
  field("amount", "number"),
  field("status", "string"),
  field("createdAt", "date"),
];

/** Every call a plan may make on a stream; each one answers the same handle. */
const CHAIN_CALLS = [
  "filter",
  "map",
  "group",
  "orderBy",
  "slice",
  "count",
  "sum",
  "avg",
  "min",
  "max",
] as const;

/**
 * A table that answers whatever the test decided, without a database. Every call
 * the plan makes returns the same handle, and awaiting it yields the rows.
 */
function tableAnswering(rows: unknown): PlanStream {
  const handle: Partial<PlanStream> & {
    then: (resolve: (value: unknown) => unknown) => unknown;
  } = {
    then: (resolve) => resolve(rows),
  };
  for (const name of CHAIN_CALLS) {
    Object.assign(handle, { [name]: () => handle });
  }
  return handle as PlanStream;
}

function failingTable(message: string): PlanStream {
  const handle: Partial<PlanStream> & {
    then: (resolve: unknown, reject: (error: unknown) => unknown) => unknown;
  } = {
    then: (_resolve, reject) => reject(new Error(message)),
  };
  for (const name of CHAIN_CALLS) {
    Object.assign(handle, { [name]: () => handle });
  }
  return handle as PlanStream;
}

const COUNT_QUERY = {
  name: "orderCount",
  resource: "order",
  template: "count",
};

const MONTHLY = {
  name: "monthly",
  resource: "order",
  template: "series",
  params: { op: "sum", field: "amount", groupBy: "createdAt", bucket: "month" },
};

/** The same source, arranged for the card that reads it. */
const MONTHLY_CARD = { ...MONTHLY, response: "card" as const };

/** Whether the installed DMS publishes the arrangements a route calls. */
function arrangementsAvailable(): boolean {
  try {
    const base = require("@antelopejs/interface-dms/base") as Record<
      string,
      unknown
    >;
    return typeof base.chartCardData === "function";
  } catch {
    return false;
  }
}

/**
 * What a block is shown for a source that has not been written. The calculation
 * itself is covered elsewhere; this is about what the preview says back — its
 * shape, where it stops, and how it refuses.
 */
describe("previewing a query", () => {
  before(() => registerBuiltinQueryTemplates());

  it("answers a number for a scalar query", async () => {
    const result = await runPlanPreview(
      tableAnswering(42),
      { query: COUNT_QUERY },
      FIELDS,
    );

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(result.data.output).to.equal("scalar");
      expect(result.data.body, "the envelope the route serves").to.deep.equal({
        value: 42,
      });
      expect(result.changes, "a preview writes nothing").to.deep.equal([]);
    }
  });

  it("answers points for a series, in the shape a chart reads", async () => {
    const rows = [
      { x: 202601, y: 150 },
      { x: 202602, y: 30 },
    ];
    const result = await runPlanPreview(
      tableAnswering(rows),
      { query: MONTHLY },
      FIELDS,
    );

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(result.data.output).to.equal("series");
      expect(result.data.response, "nothing arranged them").to.equal(undefined);
      expect(result.data.body).to.deep.equal({ series: rows });
      expect(result.data.truncated).to.equal(false);
    }
  });

  it("arranges the points the way the route would, when asked for a card", async function () {
    if (!arrangementsAvailable()) {
      this.skip();
    }
    const rows = [
      { x: 202601, y: 150 },
      { x: 202602, y: 30 },
    ];
    const result = await runPlanPreview(
      tableAnswering(rows),
      { query: MONTHLY_CARD },
      FIELDS,
    );

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(
        result.data.response,
        "the same arrangement read-back reports",
      ).to.equal("card");
      // The card's own headline, taken by the helper the route calls — not the
      // points a chart would have been handed.
      expect(result.data.body.value).to.equal(180);
      expect(result.data.body.series).to.not.deep.equal(rows);
    }
  });

  it("refuses an arrangement the installed DMS cannot build", async function () {
    if (arrangementsAvailable()) {
      this.skip();
    }
    // Answering the bare points here would be the preview disagreeing with the
    // page: saving this query fails its typecheck on the very same helper.
    const result = await runPlanPreview(
      tableAnswering([{ x: 202601, y: 150 }]),
      { query: MONTHLY_CARD },
      FIELDS,
    );

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(JSON.stringify(result.error)).to.contain("chartCardData");
    }
  });

  it("stops reading rather than answering a million points, and says so", async () => {
    const rows = Array.from({ length: 900 }, (_, index) => ({
      x: index,
      y: index,
    }));
    const result = await runPlanPreview(
      tableAnswering(rows),
      { query: MONTHLY },
      FIELDS,
    );

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(result.data.body.series).to.have.length(500);
      // A chart that silently lost its tail is worse than one that reports it.
      expect(result.data.truncated).to.equal(true);
    }
  });

  it("refuses parameters the calculation could not run, before touching the table", async () => {
    const result = await runPlanPreview(
      tableAnswering(0),
      {
        query: {
          ...MONTHLY,
          params: { ...MONTHLY.params, field: "status" },
        },
      },
      FIELDS,
    );

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.error.code).to.equal("invalid_config");
    }
  });

  it("refuses a template it does not know", async () => {
    const result = await runPlanPreview(
      tableAnswering(0),
      { query: { ...COUNT_QUERY, template: "nope" } },
      FIELDS,
    );
    expect(result.ok).to.equal(false);
  });

  it("reports what the database refused instead of throwing at the caller", async () => {
    const result = await runPlanPreview(
      failingTable("relation does not exist"),
      { query: COUNT_QUERY },
      FIELDS,
    );

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(JSON.stringify(result.error)).to.contain(
        "relation does not exist",
      );
    }
  });
});

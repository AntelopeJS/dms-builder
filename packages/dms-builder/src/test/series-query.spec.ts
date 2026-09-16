import { expect } from "chai";
import {
  AddQuery,
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  ListQueryTemplates,
  RemoveQuery,
} from "../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/dashboard";
const MODEL_FILE = "order/database.ts";
const PAGE_FILE = "dashboard/page.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

/** The parameters a monthly revenue chart is configured with. */
const MONTHLY_REVENUE = {
  name: "monthlyRevenue",
  resource: "order",
  template: "series",
  params: {
    op: "sum",
    field: "amount",
    groupBy: "createdAt",
    bucket: "month",
    timezone: "Europe/Brussels",
    where: [{ field: "status", op: "eq", value: "paid" }],
  },
};

/**
 * The reference journey's calculation, written into a real project: a chart's
 * worth of data — a measure per month, filtered — generated from parameters
 * rather than from a route someone had to write.
 */
describe("a series query", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    expectOk(
      await CreateResource({
        name: "order",
        displayName: "Order",
        fields: [
          {
            name: "amount",
            label: "Amount",
            dataType: { $dataType: "number" },
          },
          {
            name: "status",
            label: "Status",
            dataType: { $dataType: "string" },
          },
          {
            name: "createdAt",
            label: "Created",
            dataType: { $dataType: "date" },
          },
        ],
      }),
      "CreateResource",
    );
    expectOk(
      await CreatePage({
        name: "dashboard",
        displayName: "Dashboard",
        category: "pages.shop",
      }),
      "CreatePage",
    );
  });

  after(() => destroyFixture());

  it("is offered as a template, and announces the shape it answers with", async () => {
    const templates = await ListQueryTemplates("database-table");
    const series = templates.find((template) => template.id === "series");
    expect(series?.output).to.equal("series");
    expect(Object.keys(series?.params ?? {})).to.include.members([
      "op",
      "groupBy",
      "bucket",
      "limit",
    ]);
  });

  it("writes the monthly measure into the model", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await AddQuery(PAGE, MONTHLY_REVENUE), "AddQuery");

    const model = app.read(MODEL_FILE);
    expect(model).to.contain('.filter((row) => row.key("status").eq("paid"))');
    expect(model).to.contain(
      '.map((row) => ({ bucket: row.key("createdAt").year("Europe/Brussels")',
    );
    expect(model).to.contain('.group("bucket", (rows, group) =>');
    expect(model, "a timeline is ordered").to.contain('.orderBy("x", "asc")');
  });

  it("answers points rather than a number", async () => {
    const page = app.read(PAGE_FILE);
    expect(page).to.contain(
      "): Promise<{ series: { x: number | string; y: number }[] }> {",
    );
    expect(page).to.contain("return { series: await model.monthlyRevenue() };");
  });

  it("writes a top N as an ordering and a limit", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        name: "topStatuses",
        resource: "order",
        template: "series",
        params: {
          op: "sum",
          field: "amount",
          groupBy: "status",
          orderBy: "measure",
          direction: "desc",
          limit: 5,
        },
      }),
      "AddQuery",
    );

    const model = app.read(MODEL_FILE);
    expect(model).to.contain('.group("status", (rows, group) =>');
    expect(model).to.contain('.orderBy("y", "desc").slice(0, 5);');
    expect(model, "grouping on a field needs no projection").to.not.contain(
      '.map((row) => ({ bucket: row.key("status")',
    );
  });

  it("stays visible and removable while its calculation is not yet readable", async () => {
    // Deliberate intermediate state: reading a grouped chain back is its own
    // task. What matters meanwhile is that the builder still sees the query —
    // a route it could not see is one nobody can remove — and refuses to rewrite
    // what it cannot parse rather than silently reverting an edit.
    const structure = expectOk(
      await GetPageStructure(PAGE),
      "GetPageStructure",
    );
    const series = structure.queries.find(
      (query) => query.name === "monthlyRevenue",
    );

    expect(
      series,
      "an unreadable calculation is still a listed query",
    ).to.not.equal(undefined);
    expect(series?.opaque).to.equal(true);
    expect(series?.opaqueReason).to.equal("unparseable_chain");
    expect(series?.endpoint).to.equal("/stats/monthly-revenue");
    expect(series?.resource).to.equal("order");
    expect(series?.modelMethod).to.equal("monthlyRevenue");
    expect(
      series?.output,
      "what it answers is read from the route, not from the calculation",
    ).to.equal("series");
  });

  it("has its route removed, and leaves its calculation behind for now", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await RemoveQuery(`${PAGE}@topStatuses`), "RemoveQuery");

    expect(app.read(PAGE_FILE), "the route is gone").to.not.contain(
      "topStatuses",
    );

    // The model method stays, and this is the conservative rule working as
    // designed: the engine only deletes a method it recognizes as one of its
    // own, and recognition *is* reading the chain back. Until the reader learns
    // grouped chains, a removed series leaves a dead method behind — which is the
    // right side to err on, since the alternative is deleting something a human
    // wrote. Teaching the reader closes this without touching removal.
    expect(app.read(MODEL_FILE)).to.contain("topStatuses(");
  });

  describe("refuses what the database could not compute", () => {
    async function rejected(
      name: string,
      params: Record<string, unknown>,
    ): Promise<string[]> {
      const result = await AddQuery(PAGE, {
        name,
        resource: "order",
        template: "series",
        params,
      });
      expect(result.ok, `${name} should be refused`).to.equal(false);
      if (result.ok || result.error.code !== "invalid_config") {
        throw new Error(
          `expected invalid_config, got ${JSON.stringify(result)}`,
        );
      }
      return (result.error.issues ?? []).map((issue) => issue.pointer);
    }

    it("a period bucket on a field that is not a date", async function () {
      this.timeout(OP_TIMEOUT);
      expect(
        await rejected("badBucket", { groupBy: "status", bucket: "month" }),
      ).to.include("/bucket");
    });

    it("a measure over a field that is not numeric", async function () {
      this.timeout(OP_TIMEOUT);
      expect(
        await rejected("badMeasure", {
          op: "sum",
          field: "status",
          groupBy: "status",
        }),
      ).to.include("/field");
    });

    it("a grouping field the resource does not have", async function () {
      this.timeout(OP_TIMEOUT);
      expect(await rejected("badGroup", { groupBy: "nope" })).to.include(
        "/groupBy",
      );
    });

    it("a limit that is not a whole number in range", async function () {
      this.timeout(OP_TIMEOUT);
      expect(
        await rejected("badLimit", { groupBy: "status", limit: 0 }),
      ).to.include("/limit");
      expect(
        await rejected("badLimit2", { groupBy: "status", limit: 2.5 }),
      ).to.include("/limit");
    });

    it("an expression smuggled in as a filter value", async function () {
      this.timeout(OP_TIMEOUT);
      const pointers = await rejected("injected", {
        groupBy: "status",
        where: [
          { field: "amount", op: "gt", value: { $expr: "process.env.SECRET" } },
        ],
      });
      expect(pointers.length).to.be.greaterThan(0);
      expect(app.read(MODEL_FILE)).to.not.contain("process.env");
    });
  });
});

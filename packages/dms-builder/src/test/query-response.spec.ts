import { expect } from "chai";
import {
  AddQuery,
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
} from "../implementations/dms-builder";
import type { AddQueryInput } from "@antelopejs/interface-dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";
const PAGE_FILE = "board/page.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

/** A monthly measure, which every arrangement below is built from. */
const MONTHLY: AddQueryInput = {
  name: "revenue",
  resource: "order",
  template: "series",
  params: {
    op: "sum",
    field: "amount",
    groupBy: "createdAt",
    bucket: "month",
  },
};

/** The same, with the bounds the page's period selector supplies. */
const PERIOD_BOUNDS = [
  { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
  { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
];

async function queryNamed(name: string) {
  const structure = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
  return structure.queries.find((query) => query.name === name);
}

/**
 * One calculation, arranged for whichever block reads it.
 *
 * A chart wants the points, a card wants a figure above them, a ranked list
 * wants entries — and the route stays one expression in every case, which is what
 * keeps it readable back into the parameters that produced it.
 */
describe("how a query's answer is arranged", () => {
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
        name: "board",
        displayName: "Board",
        category: "pages.shop",
      }),
      "CreatePage",
    );
  });

  after(() => destroyFixture());

  it("answers the points themselves by default", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await AddQuery(PAGE, MONTHLY), "AddQuery");
    expect(app.read(PAGE_FILE)).to.contain(
      "return { series: await model.revenue() };",
    );
  });

  it("builds a card's headline figure from the same points", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        ...MONTHLY,
        name: "revenueCard",
        response: "card",
      }),
      "AddQuery",
    );

    const page = app.read(PAGE_FILE);
    // The series is named after the field being summed, under the label the
    // resource gives it: left to the helper's fallback, a legend would read
    // "sum" to whoever configured the card.
    expect(page).to.contain(
      'chartCardData(await model.revenueCard(), { measure: "sum", label: "Amount" })',
    );
    // On one line because it fits on one: that is what the project's formatter
    // makes of it, and generated code the next `format` would rewrite is code
    // that arrives with a diff nobody asked for.
    expect(page, "the helper is imported, not reinvented").to.contain(
      'import { ChartCardData, chartCardData } from "@antelopejs/interface-dms/base";',
    );
    expect(page).to.contain("): Promise<ChartCardData> {");
  });

  it("states the measure a card counts with, which the caller never asked for", async function () {
    this.timeout(OP_TIMEOUT);
    // No `op`: the template counts rows when none is named, and the helper takes
    // the measure as required — so a route emitted with no options at all does
    // not compile, and this save comes back `typecheck_failed`.
    expectOk(
      await AddQuery(PAGE, {
        ...MONTHLY,
        name: "ordersCard",
        params: { groupBy: "createdAt", bucket: "month" },
        response: "card",
      }),
      "AddQuery",
    );
    // A count has no field to name the series after, so it is named after the
    // resource whose rows it counts.
    expect(app.read(PAGE_FILE)).to.contain(
      'chartCardData(await model.ordersCard(), { measure: "count", label: "order" })',
    );
  });

  it("builds a ranked list from the same points", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        ...MONTHLY,
        name: "topMonths",
        response: "items",
      }),
      "AddQuery",
    );
    expect(app.read(PAGE_FILE)).to.contain(
      "topListData(await model.topMonths()",
    );
  });

  it("reads the arrangement back, so a card stays editable", async () => {
    const card = await queryNamed("revenueCard");
    expect(card?.opaque, "an arrangement is not an opaque body").to.not.equal(
      true,
    );
    expect(card?.template).to.equal("series");
    expect(
      card?.response,
      "the arrangement reads back beside the parameters",
    ).to.equal("card");
    expect(card?.params).to.include({ op: "sum" });
  });

  describe("comparing against the period before", () => {
    it("asks the same calculation twice, with the bounds the route received", async function () {
      this.timeout(OP_TIMEOUT);
      expectOk(
        await AddQuery(PAGE, {
          ...MONTHLY,
          name: "revenueTrend",
          params: { ...MONTHLY.params, where: PERIOD_BOUNDS },
          response: "card",
          compare: true,
        }),
        "AddQuery",
      );

      const page = app.read(PAGE_FILE);
      expect(
        page,
        "the preceding period is a parameter, not a guess",
      ).to.contain('@Parameter("compareFrom", "query") compareFrom: string,');
      expect(page).to.contain(
        '@Parameter("compareTo", "query") compareTo: string,',
      );
      expect(page).to.contain(
        "previous: await model.revenueTrend(new Date(compareFrom), new Date(compareTo))",
      );
    });

    it("reads the comparison back, so the next save keeps it", async () => {
      const trend = await queryNamed("revenueTrend");
      expect(trend?.opaque).to.not.equal(true);
      expect(trend?.compare).to.equal(true);
      expect(
        (await queryNamed("revenueCard"))?.compare,
        "a card that does not compare says nothing of it",
      ).to.equal(undefined);
    });

    it("declines to compare a calculation whose dates are baked in", async function () {
      this.timeout(OP_TIMEOUT);
      // Nothing to shift: without bounds the route supplies, there is no
      // preceding period to ask for, and emitting one would invent a window.
      expectOk(
        await AddQuery(PAGE, {
          ...MONTHLY,
          name: "revenueFixed",
          response: "card",
          compare: true,
        }),
        "AddQuery",
      );
      expect(app.read(PAGE_FILE)).to.not.contain(
        "previous: await model.revenueFixed",
      );
    });
  });
});

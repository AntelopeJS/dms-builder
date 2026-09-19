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
 * Whether the installed DMS publishes the helpers a generated route imports.
 *
 * The arrangements are built by `@antelopejs/interface-dms/base`, so emitting one
 * against a DMS that predates them writes a route that cannot compile. The suite
 * says so and steps aside rather than failing on a version mismatch it cannot fix.
 */
function helpersAvailable(): boolean {
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
 * One calculation, arranged for whichever block reads it.
 *
 * A chart wants the points, a card wants a figure above them, a ranked list
 * wants entries — and the route stays one expression in every case, which is what
 * keeps it readable back into the parameters that produced it.
 */
describe("how a query's answer is arranged", () => {
  before(async function () {
    this.timeout(120_000);
    if (!helpersAvailable()) {
      this.skip();
    }
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
    expect(page).to.contain(
      'chartCardData(await model.revenueCard(), { measure: "sum" })',
    );
    expect(page, "the helper is imported, not reinvented").to.contain(
      'import {\n  ChartCardData,\n  chartCardData,\n} from "@antelopejs/interface-dms/base";',
    );
    expect(page).to.contain("): Promise<ChartCardData> {");
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

import path from "node:path";
import { expect } from "chai";
import type {
  ColumnDisplay,
  MappedField,
  MappedResource,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import {
  AnalyseDatabase,
  GetAnalysis,
  MapResources,
} from "../implementations/dms-builder";
import { setCatalogConnectionsForTests } from "../implementations/dms-builder/engine/catalog-connection";
import { setModuleReloadForTests } from "../implementations/dms-builder/engine/module-reload";
import { INFO, Profiled } from "./analysis-catalog";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { projectFile } from "./helpers/project-files";
import {
  handEditedTabs,
  ordersInput,
  pageText,
  SHOP,
} from "./helpers/shop-orders";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

let app: Fixture;

function moduleFile(relative: string): string {
  return projectFile(app.root, path.join("modules", MODULE, "src", relative));
}

const PROFILES = new Map([
  [
    "shop.customers",
    Profiled("shop.customers", 4, { name: { traits: ["label-candidate"] } }),
  ],
  [
    "shop.orders",
    Profiled("shop.orders", 10, {
      reference: { traits: ["label-candidate"] },
      status: {
        traits: ["enum-like"],
        categories: { paid: 5, pending: 3, cancelled: 2 },
      },
    }),
  ],
]);

let profilesDown = false;

const SETTLED: ColumnDisplay = {
  kind: "badge",
  items: [
    { value: "paid", label: "Settled", tone: "info" },
    { value: "pending", label: "Waiting", tone: "neutral" },
  ],
};

/** What an assistant sends when its example shows no `display` and no `tabs`. */
function bareInput(
  overrides: Partial<MappedResource> = {},
  total: Partial<MappedField> = {},
): MapResourcesInput {
  return ordersInput({
    fields: [
      { column: "reference" },
      { column: "customer_id", relation: "shop.customers", label: "Customer" },
      { column: "status", filterable: true },
      { column: "total", ...total },
    ],
    tabs: undefined,
    ...overrides,
  });
}

async function analysed(): Promise<void> {
  const started = await AnalyseDatabase({ connection: "shop", module: MODULE });
  if (!started.ok) {
    throw new Error(`AnalyseDatabase: ${JSON.stringify(started.error)}`);
  }
  for (;;) {
    const state = await GetAnalysis(started.data.id);
    if (state.ok && state.data.status !== "running") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("mapping with the display and the tabs left out", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    profilesDown = false;
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({
      shop: {
        async Info() {
          return INFO;
        },
        async ListRelations() {
          return SHOP;
        },
        async DescribeRelations(relations: string[]) {
          return SHOP.filter((description) =>
            relations.includes(`${description.schema}.${description.name}`),
          );
        },
        async Profile(request) {
          if (profilesDown) {
            throw new Error("the profile timed out");
          }
          const profile = PROFILES.get(request.relation);
          if (!profile) {
            throw new Error(`no profile of ${request.relation}`);
          }
          return profile;
        },
        async CheckReference() {
          return {
            status: "ok",
            value: {
              containment: 1,
              checkedRows: 10,
              sampled: false,
              targetIsKey: true,
            },
          };
        },
      },
    });
    setModuleReloadForTests(reloadedAtOnce);
  });

  afterEach(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("takes the badge, the price and the tabs the profile proposes for a relation not mapped before", async () => {
    expectOk(await MapResources(bareInput()), "MapResources");
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.include("new DefaultDataTypes.SelectType({");
    expect(orders).to.include(
      '{ label: "Cancelled", value: "cancelled", textColor: "error" }',
    );
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
    expect((await pageText()).replace(/\s+/g, " ")).to.include(
      'id: "status-paid"',
    );
  });

  it("keeps the display a relation mapped before has when a remap leaves it out", async () => {
    expectOk(
      await MapResources(
        ordersInput({
          fields: [
            { column: "reference" },
            { column: "status", filterable: true, display: SETTLED },
            { column: "total", display: { kind: "price" } },
          ],
          tabs: { column: "status" },
        }),
      ),
      "first mapping",
    );
    expectOk(await MapResources(bareInput()), "remap without display");
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.include('{ label: "Settled", value: "paid"');
    expect(orders).to.not.include("Cancelled");
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
    expect(await pageText()).to.include('label: "Settled"');
  });

  it("does not give a relation mapped before the display the profile proposes for a column that had none", async () => {
    expectOk(
      await MapResources(bareInput({}, { display: null })),
      "first mapping with a plain total",
    );
    expectOk(await MapResources(bareInput()), "remap without display");
    expect(moduleFile("shop/orders/data-api.ts")).to.not.include("PriceType");
  });

  it("writes the column plain for a display of null, and no tabs over a plain column", async () => {
    expectOk(
      await MapResources(
        bareInput({
          fields: [
            { column: "reference" },
            { column: "status", filterable: true, display: null },
            { column: "total", display: null },
          ],
        }),
      ),
      "MapResources",
    );
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.not.include("SelectType");
    expect(orders).to.not.include("PriceType");
    expect(await pageText()).to.not.include("tabs");
  });

  it("writes the plain column over a display the relation had when the display is null", async () => {
    expectOk(await MapResources(ordersInput()), "first mapping");
    expectOk(
      await MapResources(
        ordersInput({
          fields: [
            { column: "reference" },
            { column: "status", filterable: true, display: null },
            { column: "total", display: null },
          ],
          tabs: undefined,
        }),
      ),
      "remap with null displays",
    );
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.not.include("SelectType");
    expect(orders).to.not.include("PriceType");
  });

  it("writes no tabs for tabs of null on a new relation, and removes the tabs the mapping wrote on a mapped one", async () => {
    expectOk(await MapResources(bareInput({ tabs: null })), "new, tabs null");
    expect(await pageText()).to.not.include("status-paid");
    expect(moduleFile("shop/orders/data-api.ts")).to.include("SelectType");
    expectOk(await MapResources(ordersInput()), "tabs written");
    expect(await pageText()).to.include("status-paid");
    expectOk(
      await MapResources(bareInput({ tabs: null })),
      "remap with tabs null",
    );
    expect(await pageText()).to.not.include("status-paid");
    expect(moduleFile("shop/orders/data-api.ts")).to.include("SelectType");
  });

  it("keeps the tabs a person edited when tabs is null", async () => {
    await handEditedTabs();
    expectOk(
      await MapResources(bareInput({ tabs: null })),
      "remap with tabs null",
    );
    expect(await pageText()).to.include('label: "Everything"');
  });

  it("proposes the price by the column's name and says no badge was proposed when no profile can be read", async () => {
    profilesDown = true;
    const mapped = await MapResources(bareInput());
    expectOk(mapped, "MapResources");
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
    expect(orders).to.not.include("SelectType");
    expect(JSON.stringify(mapped.ok && mapped.warnings)).to.include(
      "shop.orders",
    );
  });

  it("takes the badge from the last analysis of the connection when the profile cannot be read at map time", async () => {
    await analysed();
    profilesDown = true;
    expectOk(await MapResources(bareInput()), "MapResources");
    expect(moduleFile("shop/orders/data-api.ts")).to.include(
      '{ label: "Cancelled", value: "cancelled", textColor: "error" }',
    );
  });
});

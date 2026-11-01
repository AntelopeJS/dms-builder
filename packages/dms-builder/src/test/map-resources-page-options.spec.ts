import { expect } from "chai";
import {
  ConfigurePage,
  CreateCategory,
  CreatePage,
  ListCategories,
  ListPages,
  MapResources,
} from "../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  freshApp,
  installShopCatalog,
  ordersInput,
  ordersPage,
  pageSource,
  removeShopCatalog,
} from "./helpers/table-view-shop";
import { MODULE, OP_TIMEOUT } from "./mapped-database";

describe("the page options of a mapped table", function () {
  this.timeout(OP_TIMEOUT);

  before(installShopCatalog);

  beforeEach(freshApp);

  after(removeShopCatalog);

  it("starts the mapped pages at order 100 so a dashboard that takes no order still comes first", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const pages = await ListPages();
    expect(pages.map((page) => [page.id, page.order])).to.deep.equal([
      ["shop-customers", 100],
      ["shop-orders", 100],
    ]);
    expectOk(
      await CreatePage({
        name: "dashboard",
        displayName: "Dashboard",
        category: "pages.shop",
        module: MODULE,
      }),
      "CreatePage",
    );
    const dashboard = (await ListPages()).find(
      (page) => page.id === "dashboard",
    )!;
    expect(dashboard.order ?? 0).to.be.lessThan(100);
  });

  it("writes the icon, description and order a mapping sends, and the table options with them", async () => {
    expectOk(
      await MapResources(
        ordersInput({
          icon: "i-ph-shopping-cart",
          description: "Every order and where it stands.",
          order: 120,
          tableOptions: {
            kanban: { groupBy: "status" },
            footer: {
              summary: [{ label: "Revenue", op: "sum", field: "total" }],
            },
          },
        }),
      ),
      "MapResources",
    );
    const page = await ordersPage();
    expect(page.icon).to.equal("i-ph-shopping-cart");
    expect(page.order).to.equal(120);
    const source = await pageSource();
    expect(source).to.include(
      'description: "Every order and where it stands."',
    );
    expect(source).to.include('kanban: { groupByField: "status" }');
    expect(source).to.include('op: "sum"');
  });

  it("warns instead of failing when the table options are refused, and keeps the page", async () => {
    const mapped = await MapResources(
      ordersInput({ tableOptions: { kanban: { groupBy: "total" } } }),
    );
    expect(mapped.ok && JSON.stringify(mapped.warnings)).to.include(
      "page_not_written",
    );
    expect(await pageSource()).to.not.include("kanban");
  });

  it("keeps the order and icon a page has when a remap leaves them out, and updates them when sent", async () => {
    expectOk(
      await MapResources(ordersInput({ icon: "i-ph-receipt", order: 130 })),
      "first",
    );
    expectOk(await MapResources(ordersInput()), "remap without");
    let page = await ordersPage();
    expect([page.icon, page.order]).to.deep.equal(["i-ph-receipt", 130]);
    expectOk(
      await MapResources(ordersInput({ icon: "i-ph-package", order: 105 })),
      "remap with",
    );
    page = await ordersPage();
    expect([page.icon, page.order]).to.deep.equal(["i-ph-package", 105]);
  });

  it("gives an order to a page mapped before orders were written", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const page = await ordersPage();
    expectOk(
      await ConfigurePage(page.ref, { order: undefined }),
      "ConfigurePage",
    );
    expect((await ordersPage()).order).to.equal(undefined);
    expectOk(await MapResources(ordersInput()), "remap");
    expect((await ordersPage()).order).to.equal(100);
  });

  it("updates the title, icon, description and order of a mapped page through ConfigurePage", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const page = await ordersPage();
    expectOk(
      await ConfigurePage(page.ref, {
        displayName: "Customer orders",
        icon: "i-ph-receipt",
        description: "Orders by status.",
        order: 101,
      }),
      "ConfigurePage",
    );
    const after = await ordersPage();
    expect([after.displayName, after.icon, after.order]).to.deep.equal([
      "Customer orders",
      "i-ph-receipt",
      101,
    ]);
    expect(await pageSource()).to.include('description: "Orders by status."');
  });

  it("names a page by its humanized relation name when the mapping sends no title", async () => {
    expectOk(
      await MapResources({
        module: MODULE,
        connection: "shop",
        resources: [
          {
            relation: "shop.orders",
            tableView: true,
            writable: false,
            fields: [{ column: "reference" }],
          },
        ],
      }),
      "MapResources",
    );
    expect((await ordersPage()).displayName).to.equal("Orders");
  });

  it("keeps a category created beforehand", async () => {
    expectOk(
      await CreateCategory({
        name: "shop",
        displayName: "Shop",
        module: MODULE,
      }),
      "CreateCategory",
    );
    expectOk(await MapResources(ordersInput()), "MapResources");
    expect(
      (await ListCategories()).map((category) => category.displayName),
    ).to.include("Shop");
  });
});

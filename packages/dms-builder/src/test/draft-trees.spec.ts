import { expect } from "chai";
import {
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  SetPageBlocks,
} from "../implementations/dms-builder";
import type {
  AddTreeInput,
  OpResult,
  PageStructure,
} from "@antelopejs/interface-dms-builder";
import { treePreviewRequestFromUrl } from "../implementations/dms-builder/engine/tree-preview";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";
const PAGE_FILE = "board/page.ts";
const OP_TIMEOUT = 60_000;

/**
 * The DMS publishes `treeNodes` from the release after the one this package
 * installs. The app the engine writes typechecks every save, so it is told of the
 * helper the way that release declares it.
 */
const HELPER_DECLARATION = `import type { TreeNode } from "@antelopejs/interface-dms/base";
declare module "@antelopejs/interface-dms/base" {
  export function treeNodes(
    source: { levels: Array<Record<string, unknown>>; lazy?: boolean },
    request?: { url?: string; branch?: string },
  ): Promise<TreeNode[]>;
}
`;

let app: Fixture;

const CATEGORIES: AddTreeInput = {
  name: "categories",
  levels: [{ resource: "category", parent: "parent", label: ["name"] }],
  lazy: true,
};

const CUSTOMERS: AddTreeInput = {
  name: "customers",
  levels: [
    { resource: "customer", label: ["name"], icon: "i-ph-user" },
    { resource: "order", link: "customer", label: ["createdAt", "amount"] },
  ],
};

const tree = (name: string) => ({
  name,
  type: "Tree",
  config: { fetchUrl: `${PAGE}/tree/${name}`, selectionBehavior: "toggle" },
});

async function structure(): Promise<PageStructure> {
  return expectOk(await GetPageStructure(PAGE), "GetPageStructure");
}

function refusal(result: OpResult<unknown>): string {
  expect(result.ok, "refused").to.equal(false);
  return JSON.stringify((result as { error: unknown }).error);
}

/**
 * A tree read from tables is a block and the route answering it, written in
 * one save like a block and its query: the levels handed to the DMS, read back
 * as levels, and left alone once someone has rewritten them by hand.
 */
describe("trees in a page draft", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    app.write("tree-nodes.d.ts", HELPER_DECLARATION);
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    const text = (name: string) => ({
      name,
      label: name,
      dataType: { $dataType: "string" },
    });
    for (const [name, fields] of [
      ["category", [text("name"), text("parent")]],
      ["customer", [text("name")]],
      [
        "order",
        [
          text("customer"),
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
      ],
    ] as const) {
      expectOk(
        await CreateResource({ name, displayName: name, fields: [...fields] }),
        `CreateResource ${name}`,
      );
    }
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

  it("writes the block and the route answering its tree in one save", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [tree("categories")],
        trees: [CATEGORIES],
      }),
      "SetPageBlocks",
    );

    const page = app.read(PAGE_FILE);
    expect(page).to.contain('@Get("/tree/categories")');
    expect(page).to.contain("@Model(CategoryModel) category: CategoryModel,");
    expect(page).to.contain(
      '{ table: category.table, label: ["name"], parent: "parent" },',
    );
    expect(page, "a branch is asked for where the tree was").to.contain(
      "{ url: context.url.pathname, branch },",
    );
    expect((await structure()).trees).to.deep.equal([
      { endpoint: "/tree/categories", ...CATEGORIES },
    ]);
  });

  it("injects each table its levels read, and reads them back in order", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [tree("categories"), tree("customers")],
        trees: [CATEGORIES, CUSTOMERS],
      }),
      "SetPageBlocks",
    );

    const page = app.read(PAGE_FILE);
    expect(page).to.contain("@Model(CustomerModel) customer: CustomerModel,");
    expect(page).to.contain("@Model(OrderModel) order: OrderModel,");
    expect(page, "read whole, it asks for no branch").to.not.match(
      /async customers\([^)]*branch/,
    );
    const customers = (await structure()).trees?.find(
      (entry) => entry.name === "customers",
    );
    expect(customers).to.deep.equal({
      endpoint: "/tree/customers",
      ...CUSTOMERS,
    });
  });

  it("refuses levels the DMS could not read, saying why", async function () {
    this.timeout(OP_TIMEOUT);
    const save = (levels: AddTreeInput["levels"]) =>
      SetPageBlocks(PAGE, {
        blocks: [tree("broken")],
        trees: [{ name: "broken", levels }],
      });
    expect(refusal(await save([{ resource: "order", by: "nope" }]))).to.match(
      /no column of/,
    );
    expect(
      refusal(
        await save([{ resource: "order", by: "amount", every: "month" }]),
      ),
    ).to.match(/not a date/);
    expect(
      refusal(
        await save([
          { resource: "customer", label: ["name"] },
          { resource: "order", label: ["amount"] },
        ]),
      ),
    ).to.match(/column linking them/);
    expect(app.read(PAGE_FILE), "nothing was written").to.not.contain("broken");
  });

  it("keeps a tree a block still reads, and drops it once none does", async function () {
    this.timeout(OP_TIMEOUT);
    const kept = await SetPageBlocks(PAGE, {
      blocks: [tree("categories"), tree("customers")],
      trees: [CATEGORIES],
    });
    expect(JSON.stringify(kept)).to.contain("tree_kept");
    expect(app.read(PAGE_FILE)).to.contain('@Get("/tree/customers")');

    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [tree("categories")],
        trees: [CATEGORIES],
      }),
      "SetPageBlocks",
    );
    expect(app.read(PAGE_FILE)).to.not.contain('@Get("/tree/customers")');
    expect(app.read(PAGE_FILE), "nor the model only it read").to.not.contain(
      "OrderModel",
    );
  });

  it("leaves a tree edited by hand as it is", async function () {
    this.timeout(OP_TIMEOUT);
    app.write(
      PAGE_FILE,
      app
        .read(PAGE_FILE)
        .replace('parent: "parent" }', 'parent: "par" + "ent" }'),
    );
    const [categories] = (await structure()).trees ?? [];
    expect(categories).to.deep.equal({
      name: "categories",
      endpoint: "/tree/categories",
      opaque: true,
    });

    const saved = await SetPageBlocks(PAGE, {
      blocks: [tree("categories")],
      trees: [{ ...CATEGORIES, lazy: false }],
    });
    expect(JSON.stringify(saved)).to.contain("tree_opaque");
    expect(app.read(PAGE_FILE)).to.contain('"par" + "ent"');
  });
});

describe("a tree preview asked for by address", () => {
  it("reads the tree and its branch, and answers branches at the same address", () => {
    const levels = [
      { resource: "category", parent: "parent", label: ["name"] },
    ];
    const url = new URL(
      `http://localhost/api/builder/tree-preview?tree=${encodeURIComponent(
        JSON.stringify({ levels, lazy: true }),
      )}&branch=${encodeURIComponent('[0,"x"]')}`,
    );
    const request = expectOk(treePreviewRequestFromUrl(url, "acme"), "parse");
    expect(request.branch).to.equal('[0,"x"]');
    expect(request.tenant).to.equal("acme");
    expect(request.tree.levels).to.deep.equal(levels);
    const own = new URL(request.url, "http://localhost");
    expect(own.pathname).to.equal("/api/builder/tree-preview");
    expect(
      own.searchParams.get("branch"),
      "each branch names its own",
    ).to.equal(null);
    expect(JSON.parse(own.searchParams.get("tree") ?? "")).to.deep.equal({
      levels,
      lazy: true,
    });
  });

  it("refuses an address naming no tree", () => {
    const url = new URL("http://localhost/api/builder/tree-preview?tree=nope");
    expect(treePreviewRequestFromUrl(url, undefined).ok).to.equal(false);
  });
});

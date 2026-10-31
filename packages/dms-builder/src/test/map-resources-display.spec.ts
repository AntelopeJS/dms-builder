import path from "node:path";
import { expect } from "chai";
import type {
  ColumnDisplay,
  MappedField,
  MappedRelation,
  MappedResource,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import type {
  ColumnDescription,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import {
  ConfigureBlock,
  GetMapping,
  ListPages,
  MapResources,
} from "../implementations/dms-builder";
import { setCatalogConnectionsForTests } from "../implementations/dms-builder/engine/catalog-connection";
import { setModuleReloadForTests } from "../implementations/dms-builder/engine/module-reload";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { fileText } from "./helpers/file-text";
import { projectFile } from "./helpers/project-files";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

let app: Fixture;

function Column(
  name: string,
  declared: string,
  extra: Partial<ColumnDescription> = {},
): ColumnDescription {
  return {
    name,
    native: declared,
    nullable: true,
    hasDefault: false,
    generated: false,
    identity: null,
    accepts: [{ declared }],
    comment: null,
    ...extra,
  };
}

function Relation(
  name: string,
  columns: ColumnDescription[],
  references: RelationDescription["references"] = [],
): RelationDescription {
  return {
    schema: "shop",
    name,
    kind: "table",
    key: { columns: ["id"], source: "primary" },
    writes: { insert: true, update: true, delete: true },
    estimatedRows: null,
    estimate: null,
    comment: null,
    columns,
    indexes: [],
    references,
    referencedBy: [],
  };
}

const SHOP: RelationDescription[] = [
  Relation("customers", [
    Column("id", "string", { nullable: false }),
    Column("name", "string"),
  ]),
  Relation(
    "orders",
    [
      Column("id", "string", { nullable: false }),
      Column("reference", "string"),
      Column("customer_id", "string"),
      Column("status", "string"),
      Column("total", "number"),
    ],
    [
      {
        name: "orders_customer_id_fkey",
        from: { relation: "shop.orders", columns: ["customer_id"] },
        to: { relation: "shop.customers", columns: ["id"] },
      },
    ],
  ),
];

const STATUS: ColumnDisplay = {
  kind: "badge",
  items: [
    { value: "paid", label: "Paid", tone: "success" },
    { value: "pending", label: "Pending", tone: "warning" },
    { value: "cancelled", label: "Cancelled", tone: "error" },
  ],
};

const FIELDS: MappedField[] = [
  { column: "reference" },
  { column: "customer_id", relation: "shop.customers", label: "Customer" },
  { column: "status", filterable: true, display: STATUS },
  { column: "total", display: { kind: "price" } },
];

function ordersInput(
  overrides: Partial<MappedResource> = {},
): MapResourcesInput {
  return {
    module: MODULE,
    connection: "shop",
    resources: [
      {
        relation: "shop.customers",
        label: "name",
        tableView: true,
        writable: false,
        fields: [{ column: "name" }],
      },
      {
        relation: "shop.orders",
        label: "reference",
        tableView: true,
        writable: false,
        fields: FIELDS,
        tabs: { column: "status" },
        ...overrides,
      },
    ],
  };
}

function moduleFile(relative: string): string {
  return projectFile(app.root, path.join("modules", MODULE, "src", relative));
}

async function pageText(): Promise<string> {
  const page = (await ListPages()).find((entry) => entry.id === "shop-orders");
  expect(page, "the orders page").to.not.equal(undefined);
  return fileText(page!.filepath);
}

/** What the workspace sends to map a relation again from what `GetMapping` read back. */
function echoed(entry: MappedRelation): MappedResource {
  const { resource } = entry;
  const mapped: MappedResource = {
    relation: resource.relation,
    title: resource.title.value,
    tableView: resource.tableView.value,
    writable: resource.writable.value,
    fields: resource.fields
      .filter((field) => entry.included.includes(field.column))
      .map((field) => {
        const sent: MappedField = {
          column: field.column,
          label: field.label.value,
          listable: field.listable.value,
          filterable: field.filterable.value,
          sortable: field.sortable.value,
          searchable: field.searchable.value,
        };
        if (field.relation) {
          sent.relation = field.relation.value;
        } else {
          sent.declared = field.declared.value;
        }
        if (field.display) {
          sent.display = field.display.value;
        }
        return sent;
      }),
  };
  if (resource.label.value) {
    mapped.label = resource.label.value;
  }
  if (resource.tabs) {
    mapped.tabs = resource.tabs.value;
  }
  return mapped;
}

async function ordersMapped(): Promise<MappedRelation> {
  const read = await GetMapping("shop", MODULE);
  expectOk(read, "GetMapping");
  const found = (read.ok ? read.data : []).find(
    (entry) => entry.resource.relation === "shop.orders",
  );
  expect(found, "shop.orders mapped").to.not.equal(undefined);
  return found!;
}

/** The orders mapped with tabs, then the page's tabs replaced the way a person editing the page would. */
async function handEditedTabs(): Promise<void> {
  expectOk(await MapResources(ordersInput()), "MapResources");
  const page = (await ListPages()).find((entry) => entry.id === "shop-orders");
  expectOk(
    await ConfigureBlock(`${page!.ref}#table`, {
      tabs: [
        { id: "all", label: "Everything" },
        {
          id: "late",
          label: "Late",
          filter: { accessorKey: "status", value: "pending", mode: "is" },
        },
      ],
    }),
    "ConfigureBlock",
  );
}

describe("mapping columns with a display and a TableView with tabs", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({
      shop: {
        async ListRelations() {
          return SHOP;
        },
        async DescribeRelations(relations: string[]) {
          return SHOP.filter((description) =>
            relations.includes(`${description.schema}.${description.name}`),
          );
        },
      },
    });
    setModuleReloadForTests(reloadedAtOnce);
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("writes a badge as a select of toned items, a price as the price DataType, and the relation under its label", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.include("new DefaultDataTypes.SelectType({");
    expect(orders).to.include(
      '{ label: "Paid", value: "paid", textColor: "success" }',
    );
    expect(orders).to.include(
      '{ label: "Cancelled", value: "cancelled", textColor: "error" }',
    );
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
    expect(orders).to.include('name: "Customer"');
    expect(moduleFile("shop/orders/database.ts")).to.include(
      '@Field("string") declare status: string;',
    );
  });

  it("writes the tabs: All, then a tab per value in the badge's order, in its tone", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const page = (await pageText()).replace(/\s+/g, " ");
    expect(page).to.include('{ id: "all", label: "All" }');
    expect(page).to.include(
      '{ id: "status-paid", label: "Paid", filter: { accessorKey: "status", value: "paid", mode: "is" }, textColor: "success", }',
    );
    expect(page.indexOf("status-paid")).to.be.lessThan(
      page.indexOf("status-pending"),
    );
  });

  it("refuses a badge on a number column, a price on a text one, and a tone the dashboard lacks", async () => {
    const pink = Object.assign(
      { value: "paid", label: "Paid", tone: "success" as const },
      { tone: "pink" },
    );
    const fields: MappedField[] = [
      { column: "total", display: STATUS },
      { column: "status", display: { kind: "price" } },
      { column: "status", display: { kind: "badge", items: [pink] } },
    ];
    const refusals = await Promise.all(
      fields.map((field) =>
        MapResources(
          ordersInput({ fields: [{ column: "reference" }, field], tabs: null }),
        ),
      ),
    );
    for (const refused of refusals) {
      expect(refused.ok).to.equal(false);
    }
    expect(JSON.stringify(refusals[0])).to.include("shop.orders.total");
    expect(JSON.stringify(refusals[2])).to.include("pink");
  });

  it("refuses tabs by a column that is not a filterable badge", async () => {
    const plain = await MapResources(
      ordersInput({ tabs: { column: "total" } }),
    );
    expect(plain.ok).to.equal(false);
    const unfiltered = await MapResources(
      ordersInput({
        fields: [
          { column: "reference" },
          { column: "status", display: STATUS },
        ],
      }),
    );
    expect(unfiltered.ok).to.equal(false);
    expect(JSON.stringify(unfiltered)).to.include("shop.orders.status");
  });

  it("reads the display and the tabs back, and a remap that sends them back changes nothing", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const read = await ordersMapped();
    const status = read.resource.fields.find(
      (field) => field.column === "status",
    );
    expect(status?.display?.value).to.deep.equal(STATUS);
    expect(
      read.resource.fields.find((field) => field.column === "total")?.display
        ?.value,
    ).to.deep.equal({ kind: "price" });
    expect(read.resource.tabs?.value).to.deep.equal({ column: "status" });
    const remapped = await MapResources({
      module: MODULE,
      connection: "shop",
      resources: [echoed(read)],
    });
    expectOk(remapped, "MapResources from GetMapping");
    expect(
      remapped.ok && remapped.changes.map((change) => change.diff),
    ).to.deep.equal([]);
    expect(moduleFile("shop/orders/data-api.ts")).to.include(
      "new DefaultDataTypes.SelectType({",
    );
  });

  it("keeps the tabs a person edited on the page when a remap sends the mapping back", async () => {
    await handEditedTabs();
    const read = await ordersMapped();
    expect(read.resource.tabs).to.equal(undefined);
    expectOk(
      await MapResources({
        module: MODULE,
        connection: "shop",
        resources: [echoed(read)],
      }),
      "MapResources after a hand edit",
    );
    const page = await pageText();
    expect(page).to.include('label: "Everything"');
    expect(page).to.not.include("status-paid");
    expect(moduleFile("shop/orders/data-api.ts")).to.include(
      "new DefaultDataTypes.SelectType({",
    );
  });

  it("writes the plain column when the display is null, and leaves the tabs the page holds", async () => {
    await handEditedTabs();
    expectOk(
      await MapResources(
        ordersInput({
          fields: [
            { column: "reference" },
            { column: "status", filterable: true, display: null },
            { column: "total" },
          ],
          tabs: null,
        }),
      ),
      "MapResources without displays",
    );
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.not.include("SelectType");
    expect(orders).to.not.include("PriceType");
    expect(await pageText()).to.include('label: "Everything"');
  });
});

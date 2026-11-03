import { expect } from "chai";
import type {
  MappedField,
  MappedResource,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import { GetMapping, MapResources } from "../implementations/dms-builder";
import { setCatalogConnectionsForTests } from "../implementations/dms-builder/engine/catalog-connection";
import { setModuleReloadForTests } from "../implementations/dms-builder/engine/module-reload";
import { INFO } from "./analysis-catalog";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { SHOP } from "./helpers/shop-orders";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

let described: RelationDescription[] = SHOP;

const COMMENTED_SHOP: RelationDescription[] = SHOP.map((relation) => ({
  ...relation,
  columns: relation.columns.map((column) =>
    column.name === "customer_id"
      ? { ...column, comment: "Who placed it. Set at checkout." }
      : column,
  ),
}));

function customers(overrides: Partial<MappedResource> = {}): MappedResource {
  return {
    relation: "shop.customers",
    label: "name",
    tableView: true,
    writable: false,
    fields: [{ column: "name" }],
    ...overrides,
  };
}

function orders(fields: MappedField[]): MappedResource {
  return {
    relation: "shop.orders",
    label: "reference",
    tableView: true,
    writable: false,
    fields,
  };
}

function inputOf(...resources: MappedResource[]): MapResourcesInput {
  return { module: MODULE, connection: "shop", resources };
}

const LEFT_OUT: MappedField[] = [
  { column: "reference" },
  { column: "customer_id", relation: "shop.customers" },
  { column: "status" },
];

async function labelsOfOrders(): Promise<Record<string, string>> {
  const read = await GetMapping("shop", MODULE);
  expectOk(read, "GetMapping");
  const entry = (read.ok ? read.data : []).find(
    (candidate) => candidate.resource.relation === "shop.orders",
  );
  expect(entry, "orders in GetMapping").to.not.equal(undefined);
  return Object.fromEntries(
    entry!.resource.fields.map((field) => [field.column, field.label.value]),
  );
}

describe("mapping with the label of a relation column left out", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    described = SHOP;
    createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({
      shop: {
        async Info() {
          return INFO;
        },
        async ListRelations() {
          return described;
        },
        async DescribeRelations(relations: string[]) {
          return described.filter((description) =>
            relations.includes(`${description.schema}.${description.name}`),
          );
        },
        async Profile() {
          throw new Error("the profile timed out");
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

  it("titles a new relation column by its target in singular, and keeps the other columns humanized", async () => {
    expectOk(
      await MapResources(inputOf(customers(), orders(LEFT_OUT))),
      "MapResources",
    );
    expect(await labelsOfOrders()).to.include({
      customer_id: "Customer",
      reference: "Reference",
      status: "Status",
    });
  });

  it("titles the column by the title the batch gives its target", async () => {
    expectOk(
      await MapResources(
        inputOf(customers({ title: "Accounts" }), orders(LEFT_OUT)),
      ),
      "MapResources",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Account");
  });

  it("titles the column by the page title of a target mapped by an earlier call", async () => {
    expectOk(
      await MapResources(inputOf(customers({ title: "Clients" }))),
      "target alone",
    );
    expectOk(await MapResources(inputOf(orders(LEFT_OUT))), "orders alone");
    expect((await labelsOfOrders()).customer_id).to.equal("Client");
  });

  it("writes the label as sent", async () => {
    expectOk(
      await MapResources(
        inputOf(
          customers(),
          orders([
            {
              column: "customer_id",
              relation: "shop.customers",
              label: "Buyer",
            },
          ]),
        ),
      ),
      "MapResources",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Buyer");
  });

  it("keeps the label a relation mapped before has when a remap leaves it out", async () => {
    expectOk(
      await MapResources(
        inputOf(
          customers(),
          orders([
            {
              column: "customer_id",
              relation: "shop.customers",
              label: "Buyer",
            },
          ]),
        ),
      ),
      "first mapping",
    );
    expectOk(
      await MapResources(inputOf(customers(), orders(LEFT_OUT))),
      "remap without label",
    );
    expect(await labelsOfOrders()).to.include({
      customer_id: "Buyer",
      reference: "Reference",
    });
  });

  it("titles a relation column the relation mapped before did not have by its target", async () => {
    expectOk(
      await MapResources(
        inputOf(customers(), orders([{ column: "reference" }])),
      ),
      "first mapping",
    );
    expectOk(
      await MapResources(inputOf(customers(), orders(LEFT_OUT))),
      "remap with a relation column",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Customer");
  });

  it("keeps the database comment's title over the target's for a column it commented", async () => {
    described = COMMENTED_SHOP;
    expectOk(
      await MapResources(inputOf(customers(), orders(LEFT_OUT))),
      "MapResources",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Who placed it");
  });

  it("keeps the humanized column name for a column that points nowhere", async () => {
    expectOk(
      await MapResources(
        inputOf(orders([{ column: "customer_id" }, { column: "reference" }])),
      ),
      "MapResources",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Customer id");
  });
});

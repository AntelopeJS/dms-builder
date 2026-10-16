import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  ListPages,
  ListResources,
  MapResources,
} from "../implementations/dms-builder";
import { setCatalogConnectionsForTests } from "../implementations/dms-builder/engine/catalog-connection";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { FAKE_CATALOG, INPUT, MODULE, OP_TIMEOUT } from "./mapped-database";

let app: Fixture;

function moduleFile(relative: string): string {
  return fs.readFileSync(
    path.join(app.root, "modules", MODULE, "src", relative),
    "utf8",
  );
}

/**
 * A mapping changed after it was written: a relation mapped again from new choices, its page
 * following, and the relations decided against recorded in the module.
 */
describe("mapping again a database already mapped", function () {
  this.timeout(OP_TIMEOUT);

  before(async () => {
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({ erp: FAKE_CATALOG });
    expectOk(await MapResources(INPUT), "MapResources");
  });

  after(() => {
    setCatalogConnectionsForTests();
    destroyFixture();
  });

  it("rewrites a relation mapped before from new choices, and keeps its page", async () => {
    const remapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.countries",
          label: "name",
          tableView: true,
          writable: false,
          fields: [{ column: "name", searchable: true }],
        },
      ],
    });
    expectOk(remapped, "MapResources remap");
    const touched = remapped.ok
      ? remapped.changes.map((change) => change.path)
      : [];
    expect(
      touched.every((file) => file.includes("countries")),
      touched.join(", "),
    ).to.equal(true);
    const countries = moduleFile("sales/countries/data-api.ts");
    expect(countries).to.not.include("ReadWrite");
    expect(countries).to.not.match(/declare code:/);
    const pages = (await ListPages()).map((page) => page.id);
    expect(pages).to.include("sales-countries");
  });

  it("removes the page of a relation mapped again without a TableView, and keeps its resource", async () => {
    const remapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.countries",
          tableView: false,
          writable: false,
          fields: [{ column: "name" }],
        },
      ],
    });
    expectOk(remapped, "MapResources without a TableView");
    const pages = (await ListPages()).map((page) => page.id);
    expect(pages).to.not.include("sales-countries");
    const refs = (await ListResources()).map((resource) => resource.ref);
    expect(refs).to.include("erp/sales/countries");
  });

  it("points a relation column at a relation the module mapped before", async () => {
    const remapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.contacts",
          label: "first_name",
          tableView: true,
          writable: true,
          fields: [
            { column: "first_name" },
            { column: "account_id", relation: "sales.accounts" },
          ],
        },
      ],
    });
    expectOk(remapped, "MapResources onto a mapped target");
    const contacts = moduleFile("sales/contacts/data-api.ts");
    expect(contacts).to.include("dataApiController: accountDataAPI");
    expect(contacts).to.include('keyMapping: { label: "name", value: "_id" }');
  });

  it("records relations decided against, and forgets one once it is mapped", async () => {
    const manifest = () =>
      JSON.parse(
        fs.readFileSync(
          path.join(app.root, "modules", MODULE, "package.json"),
          "utf8",
        ),
      ).dmsBuilder;
    const excluded = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [],
      excluded: [
        { relation: "sales.audit", reason: "a log" },
        { relation: "sales.products", reason: "not needed" },
      ],
    });
    expectOk(excluded, "MapResources exclusions");
    expect(manifest().excluded).to.deep.equal({
      "sales.audit": "a log",
      "sales.products": "not needed",
    });
    const mapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.products",
          label: "label",
          tableView: true,
          writable: true,
          fields: [{ column: "label" }, { column: "count" }],
        },
      ],
    });
    expectOk(mapped, "MapResources of an excluded relation");
    expect(manifest()).to.deep.equal({
      mapped: "erp",
      excluded: { "sales.audit": "a log" },
    });
  });

  it("refuses a connection the builder does not declare, saying where to declare it", async () => {
    const refused = await MapResources({ ...INPUT, connection: "crm" });
    expect(refused.ok).to.equal(false);
    expect(JSON.stringify(refused)).to.include("importOverrides");
  });
});

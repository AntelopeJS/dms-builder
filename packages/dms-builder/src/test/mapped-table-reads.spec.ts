import path from "node:path";
import { expect } from "chai";
import { MapResources, PreviewQuery } from "../implementations/dms-builder";
import { setCatalogConnectionsForTests } from "../implementations/dms-builder/engine/catalog-connection";
import { setModuleReloadForTests } from "../implementations/dms-builder/engine/module-reload";
import { tableRowCounts } from "../implementations/dms-builder/engine/table-readers";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { installModuleDatabase } from "./helpers/module-database";
import { FAKE_CATALOG, INPUT, MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

const ACCOUNTS = "erp/sales/accounts";

/** What the "erp" database holds in `sales.accounts`, by status, and its row count. */
const BY_STATUS = [
  { x: "active", y: 3 },
  { x: "closed", y: 1 },
];
const ACCOUNT_ROWS = 412;

/**
 * A module mapping a connection's tables reads them through the `interface-database` its project
 * entry binds it to, the connection's driver, and not the project's own database: what the builder
 * reads of those tables comes from the same place the saved page reads them.
 */
describe("reading a table mapped from another database", function () {
  this.timeout(OP_TIMEOUT);

  before(async () => {
    const app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({ erp: FAKE_CATALOG });
    setModuleReloadForTests(reloadedAtOnce);
    expectOk(await MapResources(INPUT), "MapResources");
    installModuleDatabase(path.join(app.root, "modules", MODULE), {
      sales: { accounts: { points: BY_STATUS, count: ACCOUNT_ROWS } },
    });
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("previews a figure from the database the module is bound to", async () => {
    const preview = expectOk(
      await PreviewQuery({
        query: { name: "accountCount", resource: ACCOUNTS, template: "count" },
      }),
      "PreviewQuery",
    );

    expect(preview.body).to.deep.equal({ value: ACCOUNT_ROWS });
  });

  it("previews the points of a series from that database", async () => {
    const preview = expectOk(
      await PreviewQuery({
        query: {
          name: "accountsByStatus",
          resource: ACCOUNTS,
          template: "series",
          params: { op: "count", groupBy: "status" },
        },
      }),
      "PreviewQuery",
    );

    expect(preview.body).to.deep.equal({ series: BY_STATUS });
  });

  it("counts the table's rows in that database", async () => {
    expect(await tableRowCounts(undefined)).to.include({
      [ACCOUNTS]: ACCOUNT_ROWS,
    });
  });
});

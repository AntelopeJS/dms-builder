import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import { ConfigureProject } from "../implementations/dms-builder";
import {
  connectionDetails,
  connectionWiring,
  removeDatabaseConnection,
  setConnectionUrl,
} from "../implementations/dms-builder/engine/database-connection";
import {
  configureProjectWithVariable,
  projectVariable,
} from "../implementations/dms-builder/engine/project-env";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { builderRecord, moduleFolderExists } from "./helpers/module-manifest";
import { projectFile } from "./helpers/project-files";

const OP_TIMEOUT = 120_000;
const CATALOG = "@antelopejs/interface-database-catalog";
const DATABASE = "@antelopejs/interface-database";
const PASSWORD = "s3cret-pw";
const URL = `postgres://reader:${PASSWORD}@db.example:5432/erp?sslmode=require`;

let app: Fixture;

function connectSteps(
  connection: string,
  tables: ProjectConfigStep,
): ProjectConfigStep[] {
  const driver = `builder-db-${connection}`;
  const catalog = {
    importOverrides: [{ interface: CATALOG, source: driver, id: connection }],
  };
  return [
    {
      op: "AddModule",
      id: driver,
      entry: {
        source: {
          type: "package",
          package: "@antelopejs/postgres",
          version: "^0.2.1",
        },
        config: { mode: "external" },
        env: { url: `BUILDER_DB_${connection.toUpperCase()}_URL` },
      },
    },
    tables,
    { op: "ConfigureModule", id: "dms-builder", entry: catalog },
    { op: "ConfigureModule", id: "dms-ai", entry: catalog },
  ];
}

function tablesEntry(connection: string) {
  return {
    importOverrides: [
      { interface: DATABASE, source: `builder-db-${connection}` },
    ],
  };
}

function connect(connection: string, tables: ProjectConfigStep): void {
  expectOk(
    configureProjectWithVariable(connectSteps(connection, tables), {
      name: `BUILDER_DB_${connection.toUpperCase()}_URL`,
      value: URL,
    }),
    `connecting ${connection}`,
  );
}

/** A connection whose details are edited, then taken out of the project with its tables module. */
describe("a database connection after it was made", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    app = createFixture({ modules: ["dms-builder", "dms-ai"] });
    spawnSync("git", ["init", "-q"], { cwd: app.root });
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    connect("erp", {
      op: "CreateLocalModule",
      id: "erp-tables",
      path: "modules/erp-tables",
      entry: tablesEntry("erp"),
      connection: "erp",
    });
  });

  after(destroyFixture);

  it("answers what the connection wired, and its details without the password", () => {
    const wiring = connectionWiring("erp");
    expect(wiring).to.deep.equal({
      connection: "erp",
      driver: "builder-db-erp",
      modules: [{ id: "erp-tables", path: "modules/erp-tables" }],
      variable: "BUILDER_DB_ERP_URL",
    });
    const details = connectionDetails(wiring!);
    expect(expectOk(details, "connectionDetails")).to.deep.equal({
      scheme: "postgres",
      host: "db.example",
      port: "5432",
      database: "erp",
      user: "reader",
      hasPassword: true,
      options: { sslmode: "require" },
    });
    expect(JSON.stringify(details)).to.not.include(PASSWORD);
  });

  it("keeps the password when new details leave it out on the same server", () => {
    expectOk(
      setConnectionUrl(
        "erp",
        "postgres://reader@db.example:5432/erp?sslmode=verify-full",
      ),
      "setConnectionUrl",
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.equal(
      `postgres://reader:${PASSWORD}@db.example:5432/erp?sslmode=verify-full`,
    );
  });

  it("writes no configuration when it loads .env already, and the loading code when it does not", () => {
    const unchanged = setConnectionUrl("erp", URL);
    expect(expectOk(unchanged, "setConnectionUrl").variable).to.equal(
      "BUILDER_DB_ERP_URL",
    );
    expect(unchanged.ok && unchanged.changes).to.deep.equal([]);
    const config = projectFile(app.root, "antelope.config.ts");
    fs.writeFileSync(
      path.join(app.root, "antelope.config.ts"),
      config.replace(/const projectEnvFile[\s\S]*?\n}\n/, ""),
    );
    expectOk(setConnectionUrl("erp", URL), "setConnectionUrl");
    expect(projectFile(app.root, "antelope.config.ts")).to.include(
      "process.loadEnvFile(projectEnvFile);",
    );
  });

  it("does not send the kept password to another host", () => {
    const moved = setConnectionUrl(
      "erp",
      "postgres://reader@db2.example:5432/erp",
    );
    expect(moved.ok ? "" : JSON.stringify(moved.error)).to.match(
      /kept only for the same host, port and user/,
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.include(
      "@db.example:5432/",
    );
  });

  it("does not send the kept password to another port", () => {
    const moved = setConnectionUrl("erp", "postgres://reader@db.example/erp");
    expect(moved.ok ? "" : JSON.stringify(moved.error)).to.match(
      /kept only for the same host, port and user/,
    );
  });

  it("refuses a URL of another engine", () => {
    const other = setConnectionUrl(
      "erp",
      "mysql://reader:pw@db.example:5432/erp",
    );
    expect(other.ok ? "" : JSON.stringify(other.error)).to.match(
      /reads postgres URLs/,
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.match(/^postgres:/);
  });

  it("refuses while a module of the project's own reads through the driver, and deletes nothing", async () => {
    expectOk(
      await ConfigureProject([
        {
          op: "AddModule",
          id: "reports",
          entry: {
            source: { type: "local", path: "." },
            importOverrides: [
              { interface: DATABASE, source: "builder-db-erp" },
            ],
          },
        },
      ]),
      "AddModule reports",
    );
    expect(connectionWiring("erp")?.modules).to.deep.equal([
      { id: "erp-tables", path: "modules/erp-tables" },
    ]);
    const refused = removeDatabaseConnection("erp");
    expect(refused.ok ? "" : JSON.stringify(refused.error)).to.match(
      /still a source in the importOverrides of .*reports/,
    );
    expect(moduleFolderExists(app.root, "erp-tables")).to.equal(true);
    expectOk(
      await ConfigureProject([{ op: "RemoveModule", id: "reports" }]),
      "RemoveModule reports",
    );
  });

  it("refuses to remove a driver another module still reads through", async () => {
    const refused = await ConfigureProject([
      { op: "RemoveModule", id: "builder-db-erp" },
    ]);
    expect(refused.ok ? "" : JSON.stringify(refused.error)).to.match(
      /still a source in the importOverrides of .*erp-tables/,
    );
  });

  it("answers what a removal would change, without the URL, and changes nothing on a dry run", () => {
    const planned = removeDatabaseConnection("erp", { dryRun: true });
    const { files } = expectOk(planned, "removeDatabaseConnection dry run");
    expect(files.map((file) => path.basename(file))).to.include.members([
      "antelope.config.ts",
      ".env",
    ]);
    expect(JSON.stringify(planned)).to.not.include(PASSWORD);
    expect(connectionWiring("erp")?.driver).to.equal("builder-db-erp");
  });

  it("removes the connection with its tables module and folder", () => {
    expect(builderRecord(app.root, "erp-tables").database).to.deep.equal({
      connection: "erp",
    });
    expectOk(removeDatabaseConnection("erp"), "removeDatabaseConnection");
    expect(connectionWiring("erp")).to.equal(undefined);
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.equal(undefined);
    expect(moduleFolderExists(app.root, "erp-tables")).to.equal(false);
  });
});

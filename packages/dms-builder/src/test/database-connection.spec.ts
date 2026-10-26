import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import { ConfigureProject } from "../implementations/dms-builder";
import {
  adoptableModules,
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
import {
  builderRecord,
  moduleFolderExists,
  setBuilderRecord,
} from "./helpers/module-manifest";

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

/** A connection taken out of the project, its folder kept for another to adopt, and its details edited. */
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
    });
    setBuilderRecord(app.root, "erp-tables", {
      database: {
        connection: "erp",
        excludedTables: { "erp.schema_migrations": "a migration tool's table" },
      },
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

  it("refuses to delete a folder outside the project, instead of failing", async () => {
    expectOk(
      await ConfigureProject([
        {
          op: "AddModule",
          id: "root-tables",
          entry: {
            source: { type: "local", path: "." },
            importOverrides: [
              { interface: DATABASE, source: "builder-db-erp" },
            ],
          },
        },
      ]),
      "AddModule root-tables",
    );
    const refused = removeDatabaseConnection("erp", {
      deleteFolders: true,
      dryRun: true,
    });
    expect(refused.ok ? "" : JSON.stringify(refused.error)).to.match(
      /leaves the project/,
    );
    expectOk(
      await ConfigureProject([{ op: "RemoveModule", id: "root-tables" }]),
      "RemoveModule root-tables",
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

  it("removes the connection and keeps its folder, which a new connection under another name adopts", () => {
    expectOk(removeDatabaseConnection("erp"), "removeDatabaseConnection");
    expect(connectionWiring("erp")).to.equal(undefined);
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.equal(undefined);
    expect(adoptableModules()).to.deep.equal([
      { path: "modules/erp-tables", name: "erp-tables", connection: "erp" },
    ]);
    connect("crm", {
      op: "AdoptLocalModule",
      id: "crm-tables",
      path: "modules/erp-tables",
      entry: tablesEntry("crm"),
      connection: "crm",
    });
    expect(connectionWiring("crm")?.modules).to.deep.equal([
      { id: "crm-tables", path: "modules/erp-tables" },
    ]);
    expect(builderRecord(app.root, "erp-tables").database).to.deep.equal({
      connection: "crm",
      excludedTables: { "erp.schema_migrations": "a migration tool's table" },
    });
    expect(adoptableModules()).to.deep.equal([]);
  });

  it("deletes the folder too when asked", () => {
    expectOk(
      removeDatabaseConnection("crm", { deleteFolders: true }),
      "removeDatabaseConnection with its folders",
    );
    expect(connectionWiring("crm")).to.equal(undefined);
    expect(moduleFolderExists(app.root, "erp-tables")).to.equal(false);
  });
});

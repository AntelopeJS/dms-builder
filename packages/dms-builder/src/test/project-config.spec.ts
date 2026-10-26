import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import {
  AddModule,
  ConfigureModule,
  ConfigureProject,
  CreateLocalModule,
  CreateResource,
  ListResources,
} from "../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 120_000;
const DATABASE = "@antelopejs/interface-database";
const CATALOG = "@antelopejs/interface-database-catalog";

const PROJECT_CONFIG = `import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({
  name: "fixture",
  modules: {
    app: { source: { type: "local", path: "." } },
    dms: {
      source: { type: "package", package: "@antelopejs/dms", version: "0.8.0" },
    },
    "dms-ai": {
      source: { type: "package", package: "@antelopejs/dms-ai", version: "0.2.0" },
      config: { backendUrl: "\${@api.API_LOCAL_BASE_URL}" },
    },
    mongodb: {
      source: { type: "package", package: "@antelopejs/mongodb", version: "1.4.2" },
    },
  },
});
`;

/** The steps the external-database skill sends, in the order it sends them. */
const CONNECT_STEPS: ProjectConfigStep[] = [
  {
    op: "AddModule",
    id: "postgres-erp",
    entry: {
      source: {
        type: "package",
        package: "@antelopejs/postgres",
        version: "^0.1.4",
      },
      config: { mode: "external", statementTimeoutMs: 30000 },
      env: { url: "ERP_DATABASE_URL" },
    },
  },
  {
    op: "CreateLocalModule",
    id: "erp-tables",
    path: "modules/erp-tables",
    entry: {
      importOverrides: [{ interface: DATABASE, source: "postgres-erp" }],
    },
  },
  {
    op: "ConfigureModule",
    id: "mongodb",
    entry: { exportPriority: { [DATABASE]: 1 } },
  },
  {
    op: "ConfigureModule",
    id: "dms-ai",
    entry: {
      importOverrides: [
        { interface: CATALOG, source: "postgres-erp", id: "erp" },
      ],
    },
  },
];

const CONNECTED_CONFIG = `import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";

const projectEnvFile = join(__dirname, ".env");
if (existsSync(projectEnvFile)) {
  process.loadEnvFile(projectEnvFile);
}

export default defineConfig({
  name: "fixture",
  modules: {
    app: { source: { type: "local", path: "." } },
    dms: {
      source: { type: "package", package: "@antelopejs/dms", version: "0.8.0" },
    },
    "dms-ai": {
      source: { type: "package", package: "@antelopejs/dms-ai", version: "0.2.0" },
      config: { backendUrl: "\${@api.API_LOCAL_BASE_URL}" },
      importOverrides: [
        {
          interface: "@antelopejs/interface-database-catalog",
          source: "postgres-erp",
          id: "erp",
        },
      ],
    },
    mongodb: {
      source: { type: "package", package: "@antelopejs/mongodb", version: "1.4.2" },
      exportPriority: {
        "@antelopejs/interface-database": 1,
      },
    },
    "postgres-erp": {
      source: {
        type: "package",
        package: "@antelopejs/postgres",
        version: "^0.1.4",
      },
      config: {
        mode: "external",
        statementTimeoutMs: 30000,
      },
    },
    "erp-tables": {
      source: {
        type: "local",
        path: "modules/erp-tables",
        watchDir: ["src"],
        installCommand: ["pnpm install", "pnpm run build"],
        reloadCommand: ["pnpm exec tsc"],
      },
      importOverrides: {
        "@antelopejs/interface-database": "postgres-erp",
      },
    },
  },
  envOverrides: {
    ERP_DATABASE_URL: "modules.postgres-erp.config.url",
  },
});
`;

let app: Fixture;

function configPath(): string {
  return path.join(app.root, "antelope.config.ts");
}

function readConfig(): string {
  return fs.readFileSync(configPath(), "utf8");
}

/**
 * Wiring a project to another database touches several entries of `antelope.config.ts` at once,
 * and a wrong pin there binds a module to the wrong database. The builder writes them on a draft,
 * refuses what contradicts the configuration, and never writes a secret's value.
 */
describe("project-config operations", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createFixture();
    fs.writeFileSync(configPath(), PROJECT_CONFIG);
  });

  after(destroyFixture);

  it("writes the skill's connect batch as the configuration it expects", async () => {
    expectOk(await ConfigureProject(CONNECT_STEPS), "ConfigureProject");
    expect(readConfig()).to.equal(CONNECTED_CONFIG);
  });

  it("adds a module with its variable named in envOverrides, and no value", async () => {
    expectOk(await ConfigureProject([CONNECT_STEPS[0]]), "AddModule");
    const config = readConfig();
    expect(config).to.include(
      'ERP_DATABASE_URL: "modules.postgres-erp.config.url"',
    );
    expect(config).to.not.include("url:");
  });

  it("refuses a pin that contradicts the module's own, naming both providers", async () => {
    expectOk(
      await ConfigureModule("dms", {
        importOverrides: [{ interface: DATABASE, source: "mongodb" }],
      }),
      "pin dms",
    );
    const result = await ConfigureModule("dms", {
      importOverrides: [{ interface: DATABASE, source: "postgres-erp" }],
    });
    expect(result.ok).to.equal(false);
    expect(JSON.stringify(result))
      .to.include("mongodb")
      .and.to.include("postgres-erp");
  });

  it("scaffolds a local module the builder then writes into", async () => {
    expectOk(
      await CreateLocalModule("erp-tables", "modules/erp-tables"),
      "CreateLocalModule",
    );
    expect(
      fs.existsSync(path.join(app.root, "modules/erp-tables/src/index.ts")),
    ).to.equal(true);
    expectOk(
      await CreateResource({
        name: "ledger",
        module: "erp-tables",
        fields: [
          { name: "name", label: "Name", dataType: { $dataType: "string" } },
        ],
      }),
      "CreateResource in the new module",
    );
    const ledger = (await ListResources()).find(
      (resource) => resource.ref === "ledger",
    );
    expect(ledger?.sourceModule).to.equal("erp-tables");
  });

  it("writes nothing when one step of a batch is refused", async () => {
    const result = await ConfigureProject([
      CONNECT_STEPS[0],
      { op: "ConfigureModule", id: "nope", entry: { config: { a: 1 } } },
    ]);
    expect(result.ok).to.equal(false);
    expect(readConfig()).to.equal(PROJECT_CONFIG);
  });

  it("refuses a configuration that is not a literal, and leaves it unchanged", async () => {
    const computed =
      "const modules = {};\nexport default { modules: { ...modules } };\n";
    fs.writeFileSync(configPath(), computed);
    const result = await AddModule("x", {
      source: { type: "package", package: "x" },
    });
    expect(result.ok).to.equal(false);
    expect(readConfig()).to.equal(computed);
  });

  it("answers a dry run with the changes it would make, and writes nothing", async () => {
    const result = expectOk(
      await ConfigureProject(CONNECT_STEPS, { dryRun: true }),
      "dry run",
    );
    expect(result.files).to.include(configPath());
    expect(readConfig()).to.equal(PROJECT_CONFIG);
    expect(fs.existsSync(path.join(app.root, "modules/erp-tables"))).to.equal(
      false,
    );
  });

  it("writes in the configuration's own indentation, whatever the project's", async () => {
    fs.writeFileSync(
      configPath(),
      PROJECT_CONFIG.replace(/^( +)/gm, (spaces) => spaces.repeat(2)),
    );
    expectOk(await ConfigureProject([CONNECT_STEPS[0]]), "AddModule");
    expect(readConfig()).to.include(
      '\n        "postgres-erp": {\n            source: {\n',
    );
  });

  it("adds the variable to .env.example when the project has one", async () => {
    const example = path.join(app.root, ".env.example");
    fs.writeFileSync(example, "MONGODB_URL=\n");
    expectOk(await ConfigureProject([CONNECT_STEPS[0]]), "AddModule");
    expect(fs.readFileSync(example, "utf8")).to.equal(
      "MONGODB_URL=\nERP_DATABASE_URL=\n",
    );
  });

  it("loads .env beside a namespace import of node:path, which it leaves as it is", async () => {
    const namespace = 'import * as path from "node:path";\n';
    fs.writeFileSync(configPath(), namespace + PROJECT_CONFIG);
    expectOk(await ConfigureProject([CONNECT_STEPS[0]]), "AddModule");
    expect(readConfig())
      .to.include(namespace)
      .and.to.include('import { join } from "node:path";')
      .and.to.include('const projectEnvFile = join(__dirname, ".env");');
  });

  it("loads .env under another name when the configuration has a join of its own", async () => {
    const own = 'import { join } from "pathe";\n';
    fs.writeFileSync(configPath(), own + PROJECT_CONFIG);
    expectOk(await ConfigureProject([CONNECT_STEPS[0]]), "AddModule");
    expect(readConfig())
      .to.include(own)
      .and.to.include('import { join as joinEnvPath } from "node:path";')
      .and.to.include('const projectEnvFile = joinEnvPath(__dirname, ".env");');
  });

  it("loads .env when the configuration only mentions dotenv in a comment", async () => {
    fs.writeFileSync(configPath(), `// TODO: dotenv\n${PROJECT_CONFIG}`);
    expectOk(await ConfigureProject([CONNECT_STEPS[0]]), "AddModule");
    expect(readConfig()).to.include("process.loadEnvFile(projectEnvFile);");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setModuleConfig } from "../config";
import { ConfigureProject } from "../implementations/dms-builder";
import { configuredModuleIds } from "../implementations/dms-builder/engine/modules";
import { setProjectVariable } from "../implementations/dms-builder/engine/project-env";
import { BUILDER_CODE_INTERFACES } from "../implementations/dms-builder/engine/project-scaffold";
import { invalidateResourceIndex } from "../implementations/dms-builder/engine/resource-index";
import { invalidateSourceIndex } from "../implementations/dms-builder/engine/source-index";
import { resetWritableProject } from "../implementations/dms-builder/engine/writable";
import { expectOk } from "./harness";

const OP_TIMEOUT = 60_000;
const VARIABLE = "BUILDER_DB_ERP_URL";
const URL = "postgres://reader:secret@db.example:5432/erp";

const CONFIG = `import { defineConfig } from "@antelopejs/interface-core/config";

const port = process.env.PORT ?? "5010";

export default defineConfig({
  name: "config-only",
  modules: {
    api: {
      source: { type: "package", package: "@antelopejs/api", version: "^1.3.5" },
      config: { servers: [{ protocol: "http", port }] },
    },
    "dms-builder": {
      source: { type: "package", package: "@antelopejs/dms-builder", version: "*" },
    },
  },
});
`;

const CONNECT = [
  {
    op: "AddModule" as const,
    id: "builder-db-erp",
    entry: {
      source: {
        type: "package",
        package: "@antelopejs/postgres",
        version: "*",
      },
      config: { mode: "external" },
      env: { url: VARIABLE },
    },
  },
  {
    op: "CreateLocalModule" as const,
    id: "builder-db-erp-tables",
    path: "modules/builder-db-erp-tables",
  },
];

let root: string;
let ceiling: string | undefined;

function readJson(
  relativePath: string,
): Record<string, Record<string, unknown>> {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

/**
 * A project can be its configuration alone: no `tsconfig.json`, no sources of its own, no git
 * repository. The builder still wires a database into it, scaffolds a module that builds, and
 * writes the URL into `.env`.
 */
describe("a project that is its configuration alone", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-config-only-"));
    fs.writeFileSync(path.join(root, "antelope.config.ts"), CONFIG);
    fs.writeFileSync(
      path.join(root, "package.json"),
      '{ "name": "config-only" }\n',
    );
    ceiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(root);
    setModuleConfig({ projectRoot: root });
    resetWritableProject();
    invalidateSourceIndex();
    invalidateResourceIndex();
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (ceiling === undefined) {
      delete process.env.GIT_CEILING_DIRECTORIES;
    } else {
      process.env.GIT_CEILING_DIRECTORIES = ceiling;
    }
    resetWritableProject();
    setModuleConfig({});
  });

  it("wires a database without typechecking the configuration file", async () => {
    expectOk(await ConfigureProject(CONNECT), "ConfigureProject");
    expect(configuredModuleIds()).to.deep.equal([
      "api",
      "dms-builder",
      "builder-db-erp",
      "builder-db-erp-tables",
    ]);
  });

  it("scaffolds the module with the template's compiler options and its own build tooling", () => {
    const module = "modules/builder-db-erp-tables";
    const { compilerOptions } = readJson(`${module}/tsconfig.json`);
    expect(compilerOptions).to.include({
      module: "commonjs",
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      rootDir: "src",
    });
    expect(readJson(`${module}/package.json`).devDependencies).to.have.keys(
      "typescript",
      "rimraf",
      "@types/node",
    );
  });

  it("scaffolds the module with the interface packages the builder's code imports", () => {
    const manifest = readJson("modules/builder-db-erp-tables/package.json");
    expect(manifest.dependencies).to.deep.equal(BUILDER_CODE_INTERFACES);
  });

  it("asks for those packages at the ranges the builder itself depends on", () => {
    const own = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"),
    ) as Record<string, Record<string, string>>;
    const ranges = { ...own.devDependencies, ...own.dependencies };
    for (const [name, range] of Object.entries(BUILDER_CODE_INTERFACES)) {
      expect(ranges[name], name).to.equal(range);
    }
  });

  it("writes the variable into .env, which no repository can commit", () => {
    setProjectVariable(VARIABLE, URL);
    expect(fs.readFileSync(path.join(root, ".env"), "utf8")).to.equal(
      `${VARIABLE}="${URL}"\n`,
    );
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";

const CATALOG_INTERFACE = "@antelopejs/interface-database-catalog";
const INTERFACE_CORE = "@antelopejs/interface-core";
const BUILDER = "dms-builder";
const HTTP_MODULE = "api";
const ENGINE = path.join(
  __dirname,
  "..",
  "implementations",
  "dms-builder",
  "engine",
);
const CONNECTION_MODULE = path.join(ENGINE, "catalog-connection.js");
const RELOADED = [CONNECTION_MODULE, path.join(ENGINE, "own-connections.js")];

type Loader = (request: string, parent: unknown, isMain: boolean) => unknown;

/** Node's module loader, whose hook a spec replaces to answer a stub for one package. */
interface ModuleLoader {
  _load: Loader;
}

const loader = require("node:module") as ModuleLoader;

/** The async module context, as the runtime sets it: the builder while it loads, then the HTTP module. */
const context = { module: BUILDER };

/** interface-core as 0.2.5 answers: connections belong to the module of the current context. */
function interfaceCore(catalogPath: string): Record<string, unknown> {
  return {
    GetResponsibleModule: () => context.module,
    RunWithResponsibleModule: <T>(module: string, callback: () => T): T => {
      const previous = context.module;
      context.module = module;
      try {
        return callback();
      } finally {
        context.module = previous;
      }
    },
    GetInterfaceInstances: (interfaceId: string) =>
      context.module === BUILDER && interfaceId === CATALOG_INTERFACE
        ? [{ id: "erp", path: catalogPath, provider: "postgres-erp" }]
        : [],
  };
}

interface ConnectionModule {
  listCatalogConnections(): string[];
  catalogOf(id: string): { connection?: string } | undefined;
}

/** Loads the connection module afresh, in the builder's context, against the stubbed interface-core. */
function loadInBuilderContext(catalogPath: string): ConnectionModule {
  const original = loader._load;
  const core = interfaceCore(catalogPath);
  loader._load = (request, parent, isMain) =>
    request === INTERFACE_CORE ? core : original(request, parent, isMain);
  RELOADED.forEach((file) => delete require.cache[file]);
  try {
    context.module = BUILDER;
    return require(CONNECTION_MODULE) as ConnectionModule;
  } finally {
    loader._load = original;
    RELOADED.forEach((file) => delete require.cache[file]);
  }
}

/**
 * A route handler runs in the context of the module serving HTTP, so the builder's connections
 * are looked up in its own context, the one it was loaded in.
 */
describe("the builder's catalog connections", () => {
  let directory: string;
  let connections: ConnectionModule;

  before(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-connection-"));
    const catalogPath = path.join(directory, "catalog.js");
    fs.writeFileSync(catalogPath, 'exports.connection = "erp";\n');
    connections = loadInBuilderContext(catalogPath);
    context.module = HTTP_MODULE;
  });

  after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    context.module = BUILDER;
  });

  it("lists the builder's connections while a request runs in the HTTP module's context", () => {
    expect(connections.listCatalogConnections()).to.deep.equal(["erp"]);
    expect(context.module).to.equal(HTTP_MODULE);
  });

  it("reaches a connection's catalog from that context", () => {
    expect(connections.catalogOf("erp")?.connection).to.equal("erp");
    expect(connections.catalogOf("crm")).to.equal(undefined);
  });
});

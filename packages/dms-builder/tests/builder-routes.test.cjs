const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { loadModule } = require("./helpers/load-module.cjs");

/**
 * @typedef {(...args: unknown[]) => Promise<unknown>} Handler
 * @typedef {{ verb: string, path: string, key: string | symbol, handler: Handler | undefined }} Route
 * @typedef {{ key: string | symbol, index: number, source: unknown[] }} Param
 * @typedef {{ name: string | symbol, args: unknown[] }} EngineCall
 */

/**
 * @param {unknown} value
 * @returns {value is { BuilderController: Function & { prefix: string } }}
 */
function exposesController(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "BuilderController" in value &&
    typeof value.BuilderController === "function" &&
    "prefix" in value.BuilderController &&
    typeof value.BuilderController.prefix === "string"
  );
}

/**
 * The built controller with `@antelopejs/interface-api` answered by recorders:
 * each route decorator records the verb, path and method it binds, each
 * `@Parameter` where its value comes from, and every engine operation the
 * handlers call.
 */
function loadController() {
  /** @type {Route[]} */
  const routes = [];
  /** @type {Param[]} */
  const params = [];
  /** @type {EngineCall[]} */
  const calls = [];
  /** @param {string} verb */
  const route =
    (verb) =>
    /** @param {string} routePath */
    (routePath) =>
    /**
     * @param {object} _target
     * @param {string | symbol} key
     * @param {TypedPropertyDescriptor<Handler>} descriptor
     */
    (_target, key, descriptor) => {
      routes.push({ verb, path: routePath, key, handler: descriptor.value });
    };
  const ignored = () => () => undefined;
  const engine = new Proxy(
    {},
    {
      get: (_target, name) =>
        name === "__esModule"
          ? true
          : /** @param {unknown[]} args */
            async (...args) => {
              calls.push({ name, args });
              return { ok: true };
            },
    },
  );
  const exported = loadModule(
    path.resolve(__dirname, "../dist/routes/builder.js"),
    {
      "@antelopejs/interface-api": {
        Controller: (/** @type {string} */ prefix) =>
          class {
            static prefix = prefix;
          },
        Get: route("GET"),
        Post: route("POST"),
        Put: route("PUT"),
        Delete: route("DELETE"),
        Context: ignored,
        JSONBody: ignored,
        HTTPResult: class {},
        Parameter:
          (/** @type {unknown[]} */ ...source) =>
          (
            /** @type {object} */ _target,
            /** @type {string | symbol} */ key,
            /** @type {number} */ index,
          ) => {
            params.push({ key, index, source });
          },
      },
      "@antelopejs/interface-dms/guards": { AuthTenantOwner: ignored },
      "@antelopejs/interface-dms/request-tenant": {},
      "../implementations/dms-builder": engine,
      "../implementations/dms-builder/engine/project": {},
      "../implementations/dms-builder/engine/page-access": {},
      "../implementations/dms-builder/engine/permissions": {},
      "../implementations/dms-builder/engine/query-preview": {},
      "../implementations/dms-builder/engine/table-readers": {},
    },
    exposesController,
  );
  return { controller: exported.BuilderController, routes, params, calls };
}

void test("DELETE /api/builder/resource?ref=<table> deletes the table through DeleteResource", async () => {
  const { controller, routes, params, calls } = loadController();
  assert.equal(controller.prefix, "/api/builder");
  const served = routes.find(
    (entry) => entry.verb === "DELETE" && entry.path === "/resource",
  );
  assert.ok(served, "no DELETE handler is bound to /resource");
  assert.deepEqual(
    params
      .filter((param) => param.key === served.key)
      .map(({ index, source }) => ({ index, source })),
    [{ index: 1, source: ["ref", "query"] }],
  );
  assert.ok(served.handler, "the DELETE /resource route binds no method");
  const result = await served.handler({ _id: "owner" }, "invoice");
  assert.deepEqual(calls, [{ name: "DeleteResource", args: ["invoice"] }]);
  assert.deepEqual(result, { ok: true });
});

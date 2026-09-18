const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { test } = require("node:test");

/**
 * The builder rewrites the app's sources, so what gates it must be the core's
 * development flag -- true under `ajs project run`, false under
 * `ajs project start` -- and not `NODE_ENV`, which nothing sets on the way to a
 * production start.
 */
function loadConfig(dev) {
  const filename = path.resolve(__dirname, "../dist/config.js");
  const load = Module.createRequire(filename);
  const mocks = {
    "@antelopejs/interface-core/runtime": {
      GetRuntimeInfo: async () => ({
        dev,
        projectPath: "/app",
        env: "default",
      }),
    },
  };
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = (name) => mocks[name] ?? load(name);
  compiled._compile(readFileSync(filename, "utf8"), filename);
  return compiled.exports;
}

test("enables the builder when the project runs in development", async () => {
  const config = loadConfig(true);
  config.setModuleConfig({});
  assert.equal(await config.isBuilderEnabled(), true);
});

test("disables the builder when the project does not run in development", async () => {
  const config = loadConfig(false);
  config.setModuleConfig({});
  assert.equal(await config.isBuilderEnabled(), false);
});

test("ignores NODE_ENV entirely", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(await loadConfig(true).isBuilderEnabled(), true);
    assert.equal(await loadConfig(false).isBuilderEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("lets an explicit override turn the builder on outside development", async () => {
  const config = loadConfig(false);
  config.setModuleConfig({ api: { enabled: true } });
  assert.equal(await config.isBuilderEnabled(), true);
});

test("lets an explicit override turn the builder off in development", async () => {
  const config = loadConfig(true);
  config.setModuleConfig({ api: { enabled: false } });
  assert.equal(await config.isBuilderEnabled(), false);
});

test("re-decides when the module is reconfigured", async () => {
  const config = loadConfig(false);
  config.setModuleConfig({ api: { enabled: true } });
  assert.equal(await config.isBuilderEnabled(), true);
  config.setModuleConfig({});
  assert.equal(await config.isBuilderEnabled(), false);
});

function loadModule(relativePath, mocks) {
  const filename = path.resolve(__dirname, relativePath);
  const load = Module.createRequire(filename);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = (name) => mocks[name] ?? load(name);
  compiled._compile(readFileSync(filename, "utf8"), filename);
  return compiled.exports;
}

/**
 * The two surfaces together, over the real `config.js`: what a deployment sees
 * is that neither the controller nor the frontend module is ever loaded.
 */
function bootModule(dev) {
  const runtimeMock = {
    "@antelopejs/interface-core/runtime": {
      GetRuntimeInfo: async () => ({
        dev,
        projectPath: "/app",
        env: "default",
      }),
    },
  };
  const registrations = [];
  const loadedRoutes = [];
  const mocks = {
    ...runtimeMock,
    "@antelopejs/interface-core": { ImplementInterface: () => undefined },
    "@antelopejs/interface-dms/page": {
      AddFrontendModule: (registration) => registrations.push(registration),
    },
    "@antelopejs/interface-dms-builder": {},
    "./implementations/dms-builder": {},
    "./config": loadModule("../dist/config.js", runtimeMock),
  };
  // A getter, so the list records the import rather than the mock's creation.
  Object.defineProperty(mocks, "./routes", {
    enumerable: true,
    get: () => {
      loadedRoutes.push("./routes");
      return {};
    },
  });
  const index = loadModule("../dist/index.js", mocks);
  return { index, registrations, loadedRoutes };
}

test("mounts nothing at all when the project does not run in development", async () => {
  const booted = bootModule(false);
  await booted.index.construct();
  await booted.index.start();
  assert.deepEqual(booted.loadedRoutes, []);
  assert.deepEqual(booted.registrations, []);
});

test("mounts the routes and the frontend module in development", async () => {
  const booted = bootModule(true);
  await booted.index.construct();
  await booted.index.start();
  assert.deepEqual(booted.loadedRoutes, ["./routes"]);
  assert.equal(booted.registrations.length, 1);
  assert.deepEqual(booted.registrations[0].options, { enabled: true });
});

test("mounts both when an override enables the builder outside development", async () => {
  const booted = bootModule(false);
  await booted.index.construct({ api: { enabled: true } });
  await booted.index.start();
  assert.deepEqual(booted.loadedRoutes, ["./routes"]);
  assert.equal(booted.registrations.length, 1);
});

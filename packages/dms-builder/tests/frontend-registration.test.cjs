const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { test } = require("node:test");

test("registers the Vue frontend only when the builder API is enabled", async () => {
  const filename = path.resolve(__dirname, "../dist/index.js");
  const load = Module.createRequire(filename);
  const registrations = [];
  let enabled = false;
  const mocks = {
    "@antelopejs/interface-dms/page": {
      AddFrontendModule: (registration) => registrations.push(registration),
    },
    "./config": { isApiEnabled: () => enabled },
  };
  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  compiledModule.require = (name) => mocks[name] ?? load(name);
  compiledModule._compile(readFileSync(filename, "utf8"), filename);
  await compiledModule.exports.start();
  assert.equal(registrations.length, 0);
  enabled = true;
  await compiledModule.exports.start();
  assert.deepEqual(registrations, [
    {
      name: "@antelopejs/dms-builder-frontend-vue",
      sourcePath: path.resolve(__dirname, "../frontend-vue"),
      renderer: { name: "vue", version: "3" },
      configKey: "dmsBuilder",
      priority: 100,
    },
  ]);
});

test("registers builder state during SSR and hydration", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../frontend-vue/dms.frontend.ts"),
    "utf8",
  );
  assert.match(source, /sdk\.registerPlugin\(builderPlugin\)/);
  assert.doesNotMatch(source, /clientOnly/);
});

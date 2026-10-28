const { readFileSync } = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

/**
 * Compiles a built module afresh, answering the requires named in `mocks` with
 * the given exports and every other require as the module would resolve it.
 *
 * @param {string} filename Absolute path of the built file.
 * @param {Record<string, unknown>} mocks Exports by required specifier.
 */
function loadModule(filename, mocks) {
  const load = Module.createRequire(filename);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = (name) => mocks[name] ?? load(name);
  compiled._compile(readFileSync(filename, "utf8"), filename);
  return compiled.exports;
}

module.exports = { loadModule };

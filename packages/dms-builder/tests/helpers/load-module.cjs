const { readFileSync } = require("node:fs");
const Module = require("node:module");

/**
 * Compiles a built module afresh, answering the requires named in `mocks` with
 * the given exports and every other require as the module would resolve it.
 * The compiled exports are handed back only once `exposes` has checked that
 * they hold what the caller uses.
 *
 * @template Exports
 * @param {string} filename Absolute path of the built file.
 * @param {Record<string, unknown>} mocks Exports by required specifier.
 * @param {(compiledExports: unknown) => compiledExports is Exports} exposes
 * @returns {Exports}
 */
function loadModule(filename, mocks, exposes) {
  const load = Module.createRequire(filename);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = load.resolve.paths("x") ?? [];
  /**
   * @param {string} name
   * @returns {unknown}
   */
  const answer = (name) => mocks[name] ?? load(name);
  compiled.require = answer;
  compiled._compile(readFileSync(filename, "utf8"), filename);
  if (!exposes(compiled.exports)) {
    throw new Error(`${filename} does not export what the test uses`);
  }
  return compiled.exports;
}

module.exports = { loadModule };

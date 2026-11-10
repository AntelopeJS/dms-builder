/**
 * @param {unknown} value
 * @returns {value is Pick<typeof import("../../dist/config.js"), "isBuilderEnabled" | "setModuleConfig">}
 */
function exposesConfig(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "isBuilderEnabled" in value &&
    typeof value.isBuilderEnabled === "function" &&
    "setModuleConfig" in value &&
    typeof value.setModuleConfig === "function"
  );
}

/**
 * @param {unknown} value
 * @returns {value is Pick<typeof import("../../dist/index.js"), "construct" | "start">}
 */
function exposesEntry(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "construct" in value &&
    typeof value.construct === "function" &&
    "start" in value &&
    typeof value.start === "function"
  );
}

/**
 * @param {unknown} value
 * @returns {value is Pick<typeof import("../../src/implementations/dms-builder/index"), "ListQueryTemplates">}
 */
function exposesQueryTemplates(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "ListQueryTemplates" in value &&
    typeof value.ListQueryTemplates === "function"
  );
}

/**
 * @param {unknown} value
 * @returns {value is Pick<typeof import("../../src/implementations/dms-builder/engine/query-ops"), "compileQuery">}
 */
function exposesQueryOps(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "compileQuery" in value &&
    typeof value.compileQuery === "function"
  );
}

module.exports = {
  exposesConfig,
  exposesEntry,
  exposesQueryOps,
  exposesQueryTemplates,
};

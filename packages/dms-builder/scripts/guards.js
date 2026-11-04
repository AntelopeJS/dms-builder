/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
  return typeof value === "string";
}

/**
 * @param {unknown} value
 * @returns {value is { [key: string]: unknown }}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = { isRecord, isString };

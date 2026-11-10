const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Project } = require("ts-morph");
const {
  exposesQueryOps,
  exposesQueryTemplates,
} = require("./helpers/built-exports.js");

/**
 * The built-in templates are registered by the implementation entry as it
 * loads; loading it is what must fill the registry, or `ListQueryTemplates`
 * comes back empty and every `AddQuery` is rejected.
 */
/** @type {unknown} */
const builder = require("../dist/implementations/dms-builder/index.js");
/** @type {unknown} */
const queryOps = require("../dist/implementations/dms-builder/engine/query-ops.js");
assert.ok(exposesQueryTemplates(builder));
assert.ok(exposesQueryOps(queryOps));
const { compileQuery } = queryOps;

/** A resource record with no fields: enough for templates without params. */
function emptyResource() {
  const sourceFile = new Project({
    useInMemoryFileSystem: true,
  }).createSourceFile(
    "orders.ts",
    "class OrdersApi { model: unknown; }\nclass Orders {}\n",
  );
  return {
    dataApiFile: sourceFile.getFilePath(),
    apiClass: sourceFile.getClassOrThrow("OrdersApi"),
    tableClass: sourceFile.getClassOrThrow("Orders"),
  };
}

void test("lists the count, aggregate and series templates", async () => {
  const ids = (await builder.ListQueryTemplates()).map(
    (template) => template.id,
  );
  assert.ok(ids.includes("count"));
  assert.ok(ids.includes("aggregate"));
  assert.ok(ids.includes("series"));
});

void test("filters the templates by resource type", async () => {
  const ids = (await builder.ListQueryTemplates("database-table")).map(
    (template) => template.id,
  );
  assert.deepEqual(ids.sort(), ["aggregate", "count", "series"]);
});

void test("resolves a registered template when compiling a query", () => {
  const compiled = compileQuery(
    { name: "orderCount", resource: "orders", template: "count" },
    emptyResource(),
  );
  assert.equal(compiled.ok, undefined, JSON.stringify(compiled));
  assert.equal(compiled.template, "count");
  assert.equal(compiled.chain.body, "{\n  return this.table.count();\n}");
});

void test("still rejects an unknown template", () => {
  const compiled = compileQuery(
    { name: "orderCount", resource: "orders", template: "nope" },
    emptyResource(),
  );
  assert.equal(compiled.ok, false);
  assert.ok("error" in compiled);
  assert.ok(compiled.error.code === "invalid_config");
  assert.match(
    compiled.error.issues[0].message,
    /unknown query template "nope"/,
  );
});

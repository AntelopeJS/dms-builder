const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { Project } = require("ts-morph");

/**
 * The count and aggregate templates register themselves from a side-effect
 * module; loading the implementation entry is what must pull it in, or
 * `ListQueryTemplates` comes back empty and every `AddQuery` is rejected.
 */
const builder = require(
  path.resolve(__dirname, "../dist/implementations/dms-builder/index.js"),
);
const { compileQuery } = require(
  path.resolve(
    __dirname,
    "../dist/implementations/dms-builder/engine/query-ops.js",
  ),
);

/** A resource record with no fields: enough for templates without params. */
function emptyResource() {
  const sourceFile = new Project({
    useInMemoryFileSystem: true,
  }).createSourceFile(
    "orders.ts",
    "class OrdersApi { model: unknown; }\nclass Orders {}\n",
  );
  return {
    apiClass: sourceFile.getClassOrThrow("OrdersApi"),
    tableClass: sourceFile.getClassOrThrow("Orders"),
  };
}

test("lists the count and aggregate templates", async () => {
  const ids = (await builder.ListQueryTemplates()).map(
    (template) => template.id,
  );
  assert.ok(ids.includes("count"));
  assert.ok(ids.includes("aggregate"));
});

test("filters the templates by resource type", async () => {
  const ids = (await builder.ListQueryTemplates("database-table")).map(
    (template) => template.id,
  );
  assert.deepEqual(ids.sort(), ["aggregate", "count"]);
});

test("resolves a registered template when compiling a query", () => {
  const compiled = compileQuery(
    { name: "orderCount", resource: "orders", template: "count" },
    emptyResource(),
  );
  assert.equal(compiled.ok, undefined, JSON.stringify(compiled));
  assert.equal(compiled.template, "count");
  assert.equal(compiled.chain.body, "{\n\treturn this.table.count();\n}");
});

test("still rejects an unknown template", () => {
  const compiled = compileQuery(
    { name: "orderCount", resource: "orders", template: "nope" },
    emptyResource(),
  );
  assert.equal(compiled.ok, false);
  assert.match(
    compiled.error.issues[0].message,
    /unknown query template "nope"/,
  );
});

import { guarded } from "../guard.mjs";
import { check, failsWith, list, operation, pick, readProject, text } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

const PAGE = "src/lab.ts";
const ORDERS = 18;
const PAID = 12;
const PAID_SUM = 2620;
const ALL_SUM = 3055;

/**
 * @param {Ctx} ctx The journey
 * @param {string} name The query name
 * @param {string} template The template id
 * @param {Record<string, unknown>} [params] Its parameters
 * @returns {Promise<import("../builder.mjs").OpAnswer>} The preview
 */
function preview(ctx, name, template, params) {
  return operation(ctx, `preview ${name}`, "PreviewQuery", { query: { name, resource: "order", template, params } });
}

export const journeys = guarded([
  {
    id: "preview-query-answers-exact-figures-from-the-seeded-orders",
    title: "PreviewQuery runs count, aggregate and series templates on the 18 seeded orders and answers the documented bodies, and refuses unknown resources, templates and unbound arguments",
    entryPoint: "PreviewQuery, ListQueryTemplates",
    async run(/** @type {Ctx} */ ctx) {
      const templates = await operation(ctx, "list", "ListQueryTemplates", "database-table");
      const byId = new Map(list(templates.raw).map((row) => [text(row, "id"), row]));
      await ctx.verify("the registered templates", [
        check("count, aggregate and series exist", ["count", "aggregate", "series"].every((id) => byId.has(id)), [...byId.keys()]),
        check("scalar for count and aggregate, series for series", text(byId.get("count"), "output") === "scalar" && text(byId.get("aggregate"), "output") === "scalar" && text(byId.get("series"), "output") === "series", [...byId.values()]),
      ]);
      const total = await preview(ctx, "total", "count");
      const paid = await preview(ctx, "paid", "count", { where: [{ field: "status", op: "eq", value: "paid" }] });
      const notPaid = await preview(ctx, "notPaid", "count", { where: [{ field: "status", op: "ne", value: "paid" }] });
      const big = await preview(ctx, "big", "count", { where: [{ field: "amount", op: "gt", value: 200 }] });
      const bigOrEqual = await preview(ctx, "bigOrEqual", "count", { where: [{ field: "amount", op: "ge", value: 210 }] });
      const small = await preview(ctx, "small", "count", { where: [{ field: "amount", op: "lt", value: 60 }] });
      const smallOrEqual = await preview(ctx, "smallOrEqual", "count", { where: [{ field: "amount", op: "le", value: 60 }] });
      const both = await preview(ctx, "both", "count", { where: [{ field: "status", op: "eq", value: "paid" }, { field: "amount", op: "gt", value: 200 }] });
      const bodyValue = (/** @type {import("../builder.mjs").OpAnswer} */ answer) => pick(answer.data, "body", "value");
      await ctx.verify("count and the six filter operators, combined with AND", [
        check("all rows", bodyValue(total) === ORDERS, total.raw),
        check("status eq paid", bodyValue(paid) === PAID, paid.raw),
        check("status ne paid", bodyValue(notPaid) === ORDERS - PAID, notPaid.raw),
        check("amount gt 200 (210, 310, 260, 420, 230, 380)", bodyValue(big) === 6, big.raw),
        check("amount ge 210 includes 210", bodyValue(bigOrEqual) === 6, bigOrEqual.raw),
        check("amount lt 60 (45, 55)", bodyValue(small) === 2, small.raw),
        check("amount le 60 includes 60", bodyValue(smallOrEqual) === 3, smallOrEqual.raw),
        check("filters combine with AND", bodyValue(both) === 6, both.raw),
        check("a scalar is a value", pick(total.data, "output") === "scalar" && pick(total.data, "truncated") === false, total.data),
      ]);
      const sum = await preview(ctx, "sum", "aggregate", { op: "sum", field: "amount" });
      const paidSum = await preview(ctx, "paidSum", "aggregate", { op: "sum", field: "amount", where: [{ field: "status", op: "eq", value: "paid" }] });
      const max = await preview(ctx, "max", "aggregate", { op: "max", field: "amount" });
      const min = await preview(ctx, "min", "aggregate", { op: "min", field: "amount" });
      const avg = await preview(ctx, "avg", "aggregate", { op: "avg", field: "amount", where: [{ field: "status", op: "eq", value: "pending" }] });
      await ctx.verify("aggregate", [
        check("sum", bodyValue(sum) === ALL_SUM, sum.raw),
        check("sum of the paid orders", bodyValue(paidSum) === PAID_SUM, paidSum.raw),
        check("max", bodyValue(max) === 420, max.raw),
        check("min", bodyValue(min) === 45, min.raw),
        check("avg of the pending orders (60, 90, 110)", Math.abs(Number(bodyValue(avg)) - 86.6667) < 0.01, avg.raw),
      ]);
      const byStatus = await preview(ctx, "byStatus", "series", { groupBy: "status" });
      const ranked = await preview(ctx, "ranked", "series", { op: "sum", field: "amount", groupBy: "status", orderBy: "measure", direction: "desc", limit: 2 });
      const points = (/** @type {import("../builder.mjs").OpAnswer} */ answer) => list(answer.data, "body", "series").map((point) => `${String(point.x)}=${String(point.y)}`).join(",");
      await ctx.verify("series: grouping, ordering, top N", [
        check("count per status, by group ascending", points(byStatus) === "paid=12,pending=3,refunded=3", points(byStatus)),
        check("a series is output series", pick(byStatus.data, "output") === "series", byStatus.data),
        check("top 2 by measure descending", points(ranked) === "paid=2620,pending=260", points(ranked)),
      ]);
      const monthly = await preview(ctx, "monthly", "series", { op: "count", groupBy: "createdAt", bucket: "year" });
      const bucketOnText = await preview(ctx, "bucketOnText", "series", { groupBy: "status", bucket: "month" });
      const noField = await preview(ctx, "noField", "aggregate", { op: "sum" });
      const unknownField = await preview(ctx, "unknownField", "count", { where: [{ field: "nope", op: "eq", value: 1 }] });
      const stringOrdering = await preview(ctx, "stringOrdering", "count", { where: [{ field: "amount", op: "eq", value: "ten" }] });
      const unknownTemplate = await preview(ctx, "unknownTemplate", "median");
      const unknownResource = await operation(ctx, "unknown resource", "PreviewQuery", { query: { name: "x", resource: "nope", template: "count" } });
      const unbound = await operation(ctx, "unbound", "PreviewQuery", { query: { name: "x", resource: "order", template: "count", params: { where: [{ field: "amount", op: "lt", value: { $param: { name: "max" } } }] } } });
      const bound = await operation(ctx, "bound", "PreviewQuery", { query: { name: "x", resource: "order", template: "count", params: { where: [{ field: "amount", op: "lt", value: { $param: { name: "max" } } }] } }, args: { max: 100 } });
      await ctx.verify("refusals and bound values", [
        check("a bucketed series by year is one point holding all rows", list(monthly.data, "body", "series").reduce((sum, point) => sum + Number(point.y), 0) === ORDERS && list(monthly.data, "body", "series").every((point) => Number(point.x) >= 2026 - 1 && Number(point.x) <= 2027), points(monthly)),
        failsWith("a bucket on a text field is invalid_config", bucketOnText, "invalid_config"),
        failsWith("an aggregate without a field is invalid_config", noField, "invalid_config"),
        failsWith("an unknown field is invalid_config", unknownField, "invalid_config"),
        failsWith("a text value on a number field is invalid_config", stringOrdering, "invalid_config"),
        failsWith("an unknown template is invalid_config", unknownTemplate, "invalid_config"),
        failsWith("an unknown resource is not_found", unknownResource, "not_found"),
        failsWith("a bound value without an argument is unsupported", unbound, "unsupported"),
        check("a bound value takes its argument (amount < 100: 80, 45, 95, 75, 90, 60, 55)", bodyValue(bound) === 7, bound.raw),
      ]);
    },
  },
  {
    id: "preview-validates-parameters-as-add-query-does",
    title: "PreviewQuery refuses a parameter the template does not declare with invalid_config, as AddQuery does (known finding: the preview runs the query)",
    entryPoint: "PreviewQuery, AddQuery",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "page", "CreatePage", { name: "lab", displayName: "Lab", category: "pages.shop" });
      const added = await operation(ctx, "AddQuery with an undeclared parameter", "AddQuery", "/shop/lab", { name: "bogusQuery", resource: "order", template: "count", params: { bogus: 1 } });
      const previewed = await preview(ctx, "bogusQuery", "count", { bogus: 1 });
      await ctx.verify("the same refusal", [
        failsWith("AddQuery refuses it", added, "invalid_config"),
        failsWith("PreviewQuery refuses it", previewed, "invalid_config"),
      ]);
    },
  },
  {
    id: "add-configure-and-remove-a-query-write-a-route-and-a-model-method",
    title: "AddQuery writes a page route and a model method and answers query and route, GetPageStructure reads it back, ConfigureQuery recompiles it, RemoveQuery deletes both; the naming and endpoint rules are enforced",
    entryPoint: "AddQuery, ConfigureQuery, RemoveQuery, GetPageStructure",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "page", "CreatePage", { name: "lab", displayName: "Lab", category: "pages.shop" });
      const added = await operation(ctx, "paid count", "AddQuery", "/shop/lab", { name: "paidCount", resource: "order", template: "count", params: { where: [{ field: "status", op: "eq", value: "paid" }] } });
      await ctx.verify("AddQuery answers the query and its route", [
        check("ok", added.ok, added.raw),
        check("query is page@name", text(added.data, "query") === "/shop/lab@paidCount", added.data),
        check("route is under /dms/pages with the kebab name", text(added.data, "route") === "/dms/pages/shop/lab/stats/paid-count", added.data),
      ], { critical: true });
      const source = readProject(ctx, "page", PAGE).text;
      await ctx.verify("the route and the model method are written", [
        check("a GET route at /stats/paid-count", /@Get\("\/stats\/paid-count"\)/.test(source), source),
        check("the route carries the page permission", /@AuthUserWithPermission\(/.test(source), source),
        check("the model method paidCount is written", /paidCount\(/.test(readProject(ctx, "the model", "src/order/database.ts").text), "database.ts"),
      ]);
      const structure = await operation(ctx, "read", "GetPageStructure", "/shop/lab");
      const query = list(structure.data, "queries").find((row) => text(row, "name") === "paidCount");
      await ctx.verify("the structure reads the query back", [
        check("template, resource, endpoint, output", text(query, "template") === "count" && text(query, "resource") === "order" && text(query, "endpoint") === "/stats/paid-count" && text(query, "output") === "scalar" && query?.opaque !== true, query),
        check("params", JSON.stringify(pick(query, "params")) === '{"where":[{"field":"status","op":"eq","value":"paid"}]}', pick(query, "params")),
      ]);
      const configured = await operation(ctx, "configure", "ConfigureQuery", "/shop/lab@paidCount", { params: { where: [{ field: "status", op: "eq", value: "pending" }] } });
      const after = list((await operation(ctx, "read", "GetPageStructure", "/shop/lab")).data, "queries").find((row) => text(row, "name") === "paidCount");
      await ctx.verify("ConfigureQuery recompiles it", [check("the filter is now pending", configured.ok && JSON.stringify(pick(after, "params", "where")) === '[{"field":"status","op":"eq","value":"pending"}]', after)]);
      const duplicate = await operation(ctx, "same name", "AddQuery", "/shop/lab", { name: "paidCount", resource: "order", template: "count" });
      const badName = await operation(ctx, "not camelCase", "AddQuery", "/shop/lab", { name: "Paid-Count", resource: "order", template: "count" });
      const badEndpoint = await operation(ctx, "no slash", "AddQuery", "/shop/lab", { name: "other", resource: "order", template: "count", endpoint: "stats/other" });
      const sameEndpoint = await operation(ctx, "endpoint in use", "AddQuery", "/shop/lab", { name: "other", resource: "order", template: "count", endpoint: "/stats/paid-count" });
      const unknownResource = await operation(ctx, "unknown resource", "AddQuery", "/shop/lab", { name: "other", resource: "nope", template: "count" });
      const unknownTemplate = await operation(ctx, "unknown template", "AddQuery", "/shop/lab", { name: "other", resource: "order", template: "median" });
      const expr = await operation(ctx, "an expression value", "AddQuery", "/shop/lab", { name: "other", resource: "order", template: "count", params: { where: [{ field: "status", op: "eq", value: { $expr: "'paid'" } }] } });
      const pathParam = await operation(ctx, "path parameter without a segment", "AddQuery", "/shop/lab", { name: "other", resource: "order", template: "count", params: { where: [{ field: "amount", op: "lt", value: { $param: { name: "max", in: "param" } } }] } });
      await ctx.verify("the naming and endpoint rules", [
        failsWith("a taken name is duplicate_name", duplicate, "duplicate_name"),
        check("in the query scope", text(duplicate.error, "scope") === "query", duplicate.error),
        failsWith("a name that is not camelCase is invalid_config", badName, "invalid_config"),
        failsWith("an endpoint without a slash is invalid_config", badEndpoint, "invalid_config"),
        failsWith("an endpoint already used is duplicate_name", sameEndpoint, "duplicate_name"),
        failsWith("an unknown resource is not_found", unknownResource, "not_found"),
        failsWith("an unknown template is invalid_config", unknownTemplate, "invalid_config"),
        failsWith("a raw expression is invalid_config", expr, "invalid_config"),
        failsWith("in param without a matching :segment is invalid_config", pathParam, "invalid_config"),
      ]);
      const bound = await operation(ctx, "a request-time value", "AddQuery", "/shop/lab", { name: "cheaperThan", resource: "order", template: "count", params: { where: [{ field: "amount", op: "lt", value: { $param: { name: "maxPrice" } } }] } });
      const boundSource = readProject(ctx, "page", PAGE).text;
      await ctx.verify("a bound value is a declared route parameter", [check("the Parameter decorator reads maxPrice from the query and the route converts it with Number", bound.ok && /@Parameter\("maxPrice", "query"\)/.test(boundSource) && /Number\(/.test(boundSource), boundSource)]);
      const removed = await operation(ctx, "remove", "RemoveQuery", "/shop/lab@paidCount");
      const missing = await operation(ctx, "remove again", "RemoveQuery", "/shop/lab@paidCount");
      const left = readProject(ctx, "page", PAGE).text;
      await ctx.verify("RemoveQuery deletes the route and the model method", [
        check("ok", removed.ok, removed.raw),
        check("no route left", !left.includes("/stats/paid-count"), left),
        check("no model method left", !/paidCount\(/.test(readProject(ctx, "the model", "src/order/database.ts").text), "database.ts"),
        failsWith("removing again is not_found", missing, "not_found"),
      ]);
    },
  },
]);

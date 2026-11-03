import { guarded } from "../guard.mjs";
import { check, failsWith, list, operation, pick, readProject, text, warningCodes } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

const BOARD_FILE = "src/board/page.ts";

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<Record<string, unknown>[]>} The Board page's top-level blocks as preserved drafts
 */
async function preserved(ctx) {
  const structure = await operation(ctx, "read the board", "GetPageStructure", "/shop/board");
  return list(structure.data, "blocks").map((block) => ({ name: text(block, "name"), preserve: true }));
}

export const journeys = guarded([
  {
    id: "set-page-blocks-writes-blocks-and-queries-in-one-transaction",
    title: "SetPageBlocks writes a whole block tree with its queries, removes the blocks the draft leaves out, keeps preserved blocks as they are, and returns the new version",
    entryPoint: "SetPageBlocks",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "page", "CreatePage", { name: "lab", displayName: "Lab", category: "pages.shop" });
      const version = text((await operation(ctx, "read", "GetPageStructure", "/shop/lab")).data, "version");
      const draft = {
        page: { displayName: "Laboratory" },
        blocks: [
          {
            name: "tabs",
            type: "Tab",
            config: { items: [{ label: "One", slot: "one" }] },
            children: [{ name: "inner", type: "KpiCard", config: { title: "Inner" }, slot: "one", meta: { colSpan: 2 } }],
          },
          { name: "revenue", type: "ChartCard", config: { title: "Revenue", fetchUrl: "/dms/pages/shop/lab/stats/revenue", chart: { $block: { type: "ChartArea", config: { xaxisType: "category" } } } } },
        ],
        queries: [{ name: "revenue", resource: "order", template: "series", params: { op: "sum", field: "amount", groupBy: "status" }, response: "card" }],
      };
      const written = await operation(ctx, "write the draft", "SetPageBlocks", "/shop/lab", draft, { expectedVersion: version });
      const after = await operation(ctx, "read", "GetPageStructure", "/shop/lab");
      const source = readProject(ctx, "page", "src/lab.ts").text;
      await ctx.verify("the tree, the metadata and the query land together", [
        check("ok with a new version", written.ok && text(written.data, "version") !== "" && text(written.data, "version") === text(after.data, "version") && text(written.data, "version") !== version, written.raw),
        check("the metadata was patched", text(after.data, "page", "displayName") === "Laboratory", after.data),
        check("the top-level blocks are tabs then revenue", list(after.data, "blocks").map((block) => text(block, "name")).join() === "tabs,revenue", list(after.data, "blocks")),
        check("the nested child keeps its slot and meta", /slot: "one"/.test(source) && /colSpan: 2/.test(source), source),
        check("the chart is a nested block value", /ChartArea\(/.test(source), source),
        check("the query is written and read back", list(after.data, "queries").some((query) => text(query, "name") === "revenue" && text(query, "template") === "series"), after.data),
      ], { critical: true });
      const dropped = await operation(ctx, "drop the chart and keep the tabs", "SetPageBlocks", "/shop/lab", {
        blocks: [{ name: "tabs", preserve: true }],
      });
      const left = list((await operation(ctx, "read", "GetPageStructure", "/shop/lab")).data, "blocks").map((block) => text(block, "name"));
      await ctx.verify("a draft removes what it leaves out", [
        check("ok", dropped.ok, dropped.raw),
        check("only tabs is left, with its child", left.join() === "tabs" && /colSpan: 2/.test(readProject(ctx, "page", "src/lab.ts").text), left),
        check("an omitted queries array leaves the query alone", list((await operation(ctx, "read", "GetPageStructure", "/shop/lab")).data, "queries").length === 1, "queries"),
      ]);
      const cleared = await operation(ctx, "an empty queries array", "SetPageBlocks", "/shop/lab", { blocks: [{ name: "tabs", preserve: true }], queries: [] });
      await ctx.verify("an empty queries array removes the generated queries", [
        check("no query is left", cleared.ok && list((await operation(ctx, "read", "GetPageStructure", "/shop/lab")).data, "queries").length === 0, cleared.raw),
      ]);
    },
  },
  {
    id: "set-page-blocks-reports-every-problem-at-once",
    title: "SetPageBlocks validates the whole draft before it writes and reports each problem as an invalid_config issue with a JSON pointer, and refuses stale versions and unknown pages",
    entryPoint: "SetPageBlocks",
    async run(/** @type {Ctx} */ ctx) {
      const before = readProject(ctx, "the board", BOARD_FILE).text;
      const bad = await operation(ctx, "an invalid draft", "SetPageBlocks", "/shop/board", {
        blocks: [
          { name: "ok", type: "KpiCard", config: { title: "ok" } },
          { name: "1 bad name", type: "KpiCard", config: {} },
          { name: "ok", type: "KpiCard", config: {} },
          { name: "weird", type: "NoSuchBlock", config: {} },
          { name: "leaf", type: "KpiCard", config: {}, children: [{ name: "c", type: "KpiCard", config: {} }] },
          { name: "table", type: "TableView", config: {} },
          { name: "expr", type: "KpiCard", config: { title: { $expr: "1 + 1" } } },
          { name: "ghost", preserve: true },
        ],
      });
      const issues = Array.isArray(bad.error?.issues) ? bad.error.issues : [];
      const pointers = issues.map((issue) => text(issue, "pointer"));
      await ctx.verify("every problem is reported, with its pointer", [
        failsWith("invalid_config", bad, "invalid_config"),
        check("an invalid name", pointers.includes("/blocks/1/name"), pointers),
        check("a duplicate name", pointers.includes("/blocks/2/name"), pointers),
        check("an unknown type", pointers.includes("/blocks/3/type"), pointers),
        check("children on a leaf type", pointers.includes("/blocks/4/children"), pointers),
        check("a controller-leading type without a controller", pointers.includes("/blocks/5/controller"), pointers),
        check("an $expr in a config value", pointers.some((pointer) => pointer.startsWith("/blocks/6/config")), pointers),
        check("a preserved block with no match on disk", pointers.includes("/blocks/7"), pointers),
        check("nothing was written", readProject(ctx, "the board", BOARD_FILE).text === before, "board"),
      ]);
      const version = text((await operation(ctx, "read", "GetPageStructure", "/shop/board")).data, "version");
      await operation(ctx, "another editor", "ConfigurePage", "/shop/board", { order: 3 });
      const stale = await operation(ctx, "stale write", "SetPageBlocks", "/shop/board", { blocks: await preserved(ctx) }, { expectedVersion: version });
      const unknown = await operation(ctx, "unknown page", "SetPageBlocks", "/nope", { blocks: [] });
      await ctx.verify("stale and unknown", [failsWith("stale", stale, "stale"), check("stale carries the current version", text(stale.error, "currentVersion") !== "" && text(stale.error, "currentVersion") !== version, stale.error), failsWith("an unknown page is not_found", unknown, "not_found")]);
    },
  },
  {
    id: "preserving-every-block-changes-only-the-page-metadata",
    title: "A draft that preserves every top-level block and patches the page title leaves the other source untouched, and a preserved block that lists a changed child is refused",
    entryPoint: "SetPageBlocks with preserve",
    async run(/** @type {Ctx} */ ctx) {
      const before = readProject(ctx, "the board", BOARD_FILE).text;
      const renamed = await operation(ctx, "retitle", "SetPageBlocks", "/shop/board", { page: { displayName: "Sales board" }, blocks: await preserved(ctx) });
      const after = readProject(ctx, "the board", BOARD_FILE).text;
      const removeHeader = (/** @type {string} */ source) => source.replace(/displayName: "[^"]*"/, "displayName: X");
      await ctx.verify("only the display name changed", [
        check("ok", renamed.ok, renamed.raw),
        check("the new name is in the source", after.includes('displayName: "Sales board"'), after),
        check("everything else is identical", removeHeader(before) === removeHeader(after), "diff"),
      ]);
      const retyped = await operation(ctx, "a preserved block with another type", "SetPageBlocks", "/shop/board", { blocks: [{ name: "revenueChart", preserve: true, type: "KpiCard" }] });
      const configured = await operation(ctx, "a preserved block with a config", "SetPageBlocks", "/shop/board", { blocks: [{ name: "revenueChart", preserve: true, config: { title: "x" } }] });
      await ctx.verify("a preserved block cannot change", [failsWith("a different type is invalid_config", retyped, "invalid_config"), failsWith("a config on a preserved block is invalid_config", configured, "invalid_config")]);
    },
  },
  {
    id: "preview-layout-serializes-a-draft-without-writing",
    title: "PreviewLayout serializes a draft into components keyed by block name, lists the blocks it could not build in degraded, and writes nothing",
    entryPoint: "PreviewLayout",
    async run(/** @type {Ctx} */ ctx) {
      const before = readProject(ctx, "the board", BOARD_FILE).text;
      const draft = { blocks: [{ name: "total", type: "KpiCard", config: { title: "Total revenue" } }, { name: "weird", type: "NoSuchBlock", config: {} }, { name: "orders", type: "TableView", config: {} }] };
      const preview = await operation(ctx, "preview", "PreviewLayout", "/shop/board", draft);
      const total = pick(preview.data, "components", "total");
      const degraded = Array.isArray(pick(preview.data, "degraded")) ? pick(preview.data, "degraded") : [];
      await ctx.verify("the serialized tree", [
        check("ok", preview.ok, preview.raw),
        check("total is a serialized KPI card carrying its title", JSON.stringify(total).includes("Total revenue"), total),
        check("an unknown type and a controller-less table are degraded", degraded.length === 2 && degraded.some((path) => String(path).endsWith("weird")) && degraded.some((path) => String(path).endsWith("orders")), degraded),
        check("a degraded block is a placeholder in components", pick(preview.data, "components", "weird") !== undefined, preview.data),
        check("nothing was written", readProject(ctx, "the board", BOARD_FILE).text === before, "board"),
      ]);
      const unknown = await operation(ctx, "unknown page", "PreviewLayout", "/nope", { blocks: [] });
      await ctx.verify("an unknown page", [failsWith("not_found", unknown, "not_found")]);
    },
  },
]);

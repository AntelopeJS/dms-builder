import { guarded } from "../guard.mjs";
import { UNSET, check, failsWith, list, operation, pick, readProject, text, warningCodes, writeProject } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

const PAGE = "src/lab.ts";

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<void>}
 */
async function newPage(ctx) {
  await operation(ctx, "create the lab page", "CreatePage", { name: "lab", displayName: "Lab", category: "pages.shop" });
}

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<import("../builder.mjs").Row[]>} The top-level blocks of the lab page
 */
async function blocksOf(ctx) {
  return list((await operation(ctx, "read the lab page", "GetPageStructure", "/shop/lab")).data, "blocks");
}

export const journeys = guarded([
  {
    id: "add-block-writes-a-factory-call-and-refuses-what-it-cannot-write",
    title: "AddBlock writes a static member or a .child() call, honours parent, slot, index and meta, clamps an index with index_clamped, and refuses duplicates, unknown types, opaque and missing parents and controller mismatches",
    entryPoint: "AddBlock",
    async run(/** @type {Ctx} */ ctx) {
      await newPage(ctx);
      const total = await operation(ctx, "a KpiCard", "AddBlock", { page: "/shop/lab", name: "total", type: "KpiCard", config: { title: "Total revenue", icon: "i-ph-currency-eur" } });
      await ctx.verify("a top-level block", [
        check("ok, path is page#name", total.ok && text(total.data, "path") === "/shop/lab#total", total.raw),
        check("the file holds a static member", /static total = KpiCard\(\{[^}]*title: "Total revenue"[^}]*icon: "i-ph-currency-eur"/s.test(readProject(ctx, "page", PAGE).text), "page"),
      ], { critical: true });
      const tabs = await operation(ctx, "a Tab container", "AddBlock", { page: "/shop/lab", name: "tabs", type: "Tab", config: { items: [{ label: "One", slot: "one" }, { label: "Two", slot: "two" }] } });
      const child = await operation(ctx, "a nested card", "AddBlock", { page: "/shop/lab", name: "inner", type: "KpiCard", config: { title: "Inner" }, parent: "/shop/lab#tabs", slot: "two", meta: { colSpan: 2 } });
      const first = await operation(ctx, "a first sibling", "AddBlock", { page: "/shop/lab", name: "first", type: "KpiCard", config: { title: "First" }, parent: "/shop/lab#tabs", slot: "one", index: 0 });
      const clamped = await operation(ctx, "an index past the end", "AddBlock", { page: "/shop/lab", name: "last", type: "KpiCard", config: { title: "Last" }, parent: "/shop/lab#tabs", slot: "one", index: 99 });
      const source = readProject(ctx, "page", PAGE).text;
      const tabsBlock = (await blocksOf(ctx)).find((block) => text(block, "name") === "tabs");
      const kids = list(tabsBlock, "children");
      await ctx.verify("nested blocks", [
        check("the nested path adds /childId", child.ok && text(child.data, "path") === "/shop/lab#tabs/inner", child.raw),
        check("the child call carries slot and meta", /\.child\("inner", KpiCard\(\{ title: "Inner" \}\), \{[^}]*slot: "two"[^}]*colSpan: 2/s.test(source) || /"inner"[\s\S]{0,200}slot: "two"[\s\S]{0,60}colSpan: 2/.test(source), source),
        check("index 0 puts the block first", first.ok && text(kids[0], "name") === "first", kids.map((kid) => text(kid, "name"))),
        check("an index past the end appends and warns index_clamped", clamped.ok && text(kids.at(-1), "name") === "last" && warningCodes(clamped).includes("index_clamped"), clamped.warnings),
        check("the tab container was written", tabs.ok, tabs.raw),
      ]);
      const duplicate = await operation(ctx, "duplicate", "AddBlock", { page: "/shop/lab", name: "total", type: "KpiCard", config: { title: "x" } });
      const duplicateChild = await operation(ctx, "duplicate sibling", "AddBlock", { page: "/shop/lab", name: "inner", type: "KpiCard", config: { title: "x" }, parent: "/shop/lab#tabs" });
      const unknownType = await operation(ctx, "unknown type", "AddBlock", { page: "/shop/lab", name: "weird", type: "NoSuchBlock", config: {} });
      const missingParent = await operation(ctx, "missing parent", "AddBlock", { page: "/shop/lab", name: "x", type: "KpiCard", config: {}, parent: "/shop/lab#nope" });
      const needsController = await operation(ctx, "TableView without a controller", "AddBlock", { page: "/shop/lab", name: "t", type: "TableView", config: {} });
      const refusesController = await operation(ctx, "KpiCard with a controller", "AddBlock", { page: "/shop/lab", name: "k", type: "KpiCard", config: {}, controller: "order" });
      const unknownPage = await operation(ctx, "unknown page", "AddBlock", { page: "/nope", name: "x", type: "KpiCard", config: {} });
      await ctx.verify("refusals", [
        failsWith("a duplicate top-level name is duplicate_name", duplicate, "duplicate_name"),
        check("its scope is page", text(duplicate.error, "scope") === "page", duplicate.error),
        failsWith("a duplicate sibling is duplicate_name", duplicateChild, "duplicate_name"),
        check("its scope is siblings", text(duplicateChild.error, "scope") === "siblings", duplicateChild.error),
        failsWith("an unknown type is unsupported", unknownType, "unsupported"),
        failsWith("a parent that does not resolve is not_found", missingParent, "not_found"),
        failsWith("a controller-leading type without a controller is invalid_config", needsController, "invalid_config"),
        failsWith("a type that takes no controller refuses one with invalid_config", refusesController, "invalid_config"),
        failsWith("an unknown page is not_found", unknownPage, "not_found"),
      ]);
      const table = await operation(ctx, "TableView with the order resource", "AddBlock", { page: "/shop/lab", name: "orders", type: "TableView", controller: "order", config: { caption: "Orders" } });
      await ctx.verify("a controller-leading block emits the imported DataAPI class", [
        check("ok", table.ok, table.raw),
        check("TableView(orderDataAPI, ...)", /TableView\(orderDataAPI/.test(readProject(ctx, "page", PAGE).text), "page"),
      ]);
    },
  },
  {
    id: "configure-move-and-remove-rewrite-one-block",
    title: "ConfigureBlock merges, removes undefined keys, replaces on request and rewrites child meta; MoveBlock reorders and reparents; RemoveBlock drops static and nested blocks; each refuses its documented cases",
    entryPoint: "ConfigureBlock, MoveBlock, RemoveBlock",
    async run(/** @type {Ctx} */ ctx) {
      await newPage(ctx);
      await operation(ctx, "tabs", "AddBlock", { page: "/shop/lab", name: "tabs", type: "Tab", config: { items: [{ label: "One", slot: "one" }] } });
      await operation(ctx, "a", "AddBlock", { page: "/shop/lab", name: "a", type: "KpiCard", config: { title: "A", description: "keep" }, parent: "/shop/lab#tabs", slot: "one" });
      await operation(ctx, "b", "AddBlock", { page: "/shop/lab", name: "b", type: "KpiCard", config: { title: "B" }, parent: "/shop/lab#tabs", slot: "one" });
      await operation(ctx, "top", "AddBlock", { page: "/shop/lab", name: "top", type: "KpiCard", config: { title: "Top", description: "old" } });
      const merged = await operation(ctx, "merge", "ConfigureBlock", "/shop/lab#top", { title: "Top 2", icon: "i-ph-x" });
      const removedKey = await operation(ctx, "undefined key", "ConfigureBlock", "/shop/lab#top", { description: UNSET });
      const afterMerge = (await blocksOf(ctx)).find((block) => text(block, "name") === "top");
      await ctx.verify("merge keeps other keys, a removed key goes", [
        check("ok", merged.ok && removedKey.ok, [merged.raw, removedKey.raw]),
        check("title replaced, icon added", text(afterMerge, "config", "title") === "Top 2" && text(afterMerge, "config", "icon") === "i-ph-x", afterMerge),
        check("description removed", pick(afterMerge, "config", "description") === undefined, afterMerge),
      ]);
      const replaced = await operation(ctx, "replace", "ConfigureBlock", "/shop/lab#top", { title: "Only" }, { replace: true });
      const afterReplace = (await blocksOf(ctx)).find((block) => text(block, "name") === "top");
      await ctx.verify("replace drops every other key", [check("only the title is left", replaced.ok && JSON.stringify(pick(afterReplace, "config")) === '{"title":"Only"}', afterReplace)]);
      const meta = await operation(ctx, "child meta", "ConfigureBlock", "/shop/lab#tabs/a", { title: "A2" }, { meta: { colSpan: 3 } });
      const topMeta = await operation(ctx, "meta on a top-level block", "ConfigureBlock", "/shop/lab#top", { title: "x" }, { meta: { colSpan: 1 } });
      const unknown = await operation(ctx, "unknown block", "ConfigureBlock", "/shop/lab#nope", { title: "x" });
      await ctx.verify("child meta and refusals", [
        check("colSpan written next to the child", meta.ok && /colSpan: 3/.test(readProject(ctx, "page", PAGE).text), meta.raw),
        failsWith("meta on a top-level block is unsupported", topMeta, "unsupported"),
        failsWith("an unknown block is not_found", unknown, "not_found"),
      ]);
      const moved = await operation(ctx, "move a below b", "MoveBlock", "/shop/lab#tabs/a", { parent: "/shop/lab#tabs", index: 1 });
      const order = list((await blocksOf(ctx)).find((block) => text(block, "name") === "tabs"), "children").map((kid) => text(kid, "name"));
      const topLevel = await operation(ctx, "move a top-level block", "MoveBlock", "/shop/lab#top", { parent: "/shop/lab#tabs", index: 0 });
      const noParent = await operation(ctx, "no destination parent", "MoveBlock", "/shop/lab#tabs/a", { index: 0 });
      const clampedMove = await operation(ctx, "clamped", "MoveBlock", "/shop/lab#tabs/b", { parent: "/shop/lab#tabs", index: 50 });
      const missingDest = await operation(ctx, "missing destination", "MoveBlock", "/shop/lab#tabs/b", { parent: "/shop/lab#gone", index: 0 });
      await ctx.verify("MoveBlock", [
        check("a moves after b", moved.ok && order.join() === "b,a", order),
        failsWith("a top-level block is unsupported", topLevel, "unsupported"),
        failsWith("a missing destination parent is unsupported", noParent, "unsupported"),
        check("an index out of range is clamped with a warning", clampedMove.ok && warningCodes(clampedMove).includes("index_clamped"), clampedMove.raw),
        failsWith("a destination that does not exist is not_found", missingDest, "not_found"),
      ]);
      const removeNested = await operation(ctx, "remove a nested block", "RemoveBlock", "/shop/lab#tabs/a");
      const removeTop = await operation(ctx, "remove a top-level block", "RemoveBlock", "/shop/lab#top");
      const removeMissing = await operation(ctx, "remove an unknown block", "RemoveBlock", "/shop/lab#top");
      const names = (await blocksOf(ctx)).map((block) => text(block, "name"));
      await ctx.verify("RemoveBlock", [
        check("both removals are ok", removeNested.ok && removeTop.ok, [removeNested.raw, removeTop.raw]),
        check("only tabs is left, with b", names.join() === "tabs" && !/static top\b/.test(readProject(ctx, "page", PAGE).text) && !readProject(ctx, "page", PAGE).text.includes('"a"'), names),
        failsWith("removing again is not_found", removeMissing, "not_found"),
      ]);
    },
  },
  {
    id: "a-write-that-would-not-compile-is-rolled-back",
    title: "A write whose result fails the project typecheck answers typecheck_failed with file, line and message, and writes nothing",
    entryPoint: "AddBlock with a type error elsewhere in the project",
    async run(/** @type {Ctx} */ ctx) {
      await newPage(ctx);
      const schema = readProject(ctx, "the schema module", "src/schema.ts").text;
      writeProject(ctx, "src/schema.ts", `${schema}\nexport const broken: number = "not a number";\n`);
      const before = readProject(ctx, "page", PAGE).text;
      const refused = await operation(ctx, "add a block while the project does not compile", "AddBlock", { page: "/shop/lab", name: "x", type: "KpiCard", config: { title: "x" } });
      const diagnostics = Array.isArray(refused.error?.diagnostics) ? refused.error.diagnostics : [];
      await ctx.verify("typecheck_failed", [
        failsWith("typecheck_failed", refused, "typecheck_failed"),
        check("a diagnostic names the broken file and its line", diagnostics.some((diagnostic) => text(diagnostic, "file").endsWith("src/schema.ts") && Number.isInteger(pick(diagnostic, "line")) && text(diagnostic, "message") !== ""), diagnostics),
        check("nothing was written", readProject(ctx, "page", PAGE).text === before, "page"),
      ]);
    },
  },
]);

import { guarded } from "../guard.mjs";
import { check, failsWith, list, operation, pick, projectHas, readProject, text, warningCodes } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

export const journeys = guarded([
  {
    id: "create-page-writes-the-file-and-wires-the-barrel",
    title: "CreatePage writes <category-folder>/<name>/page.ts with the default layout, exports it from the barrel, honours dir, and refuses bad names, duplicates, unknown categories and a dir outside src",
    entryPoint: "CreatePage, ListPages, GetPageStructure",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "a category with a barrel beside it", "CreateCategory", { name: "reports", displayName: "Reports", parent: "pages" });
      const made = await operation(ctx, "create revenue", "CreatePage", { name: "revenue", displayName: "Revenue", category: "pages.reports", icon: "i-ph-chart-line", description: "Monthly revenue overview", order: 4 });
      await ctx.verify("the page is created", [
        check("ok", made.ok, made.raw),
        check("the ref joins the category slug and the name", text(made.data, "ref") === "/reports/revenue", made.data),
        check("the file path ends with revenue/page.ts", text(made.data, "filepath").endsWith("/src/revenue/page.ts"), made.data),
      ], { critical: true });
      const file = readProject(ctx, "revenue/page.ts", "src/revenue/page.ts");
      const barrel = readProject(ctx, "the barrel", "src/index.ts");
      await ctx.verify("the file and the barrel", [
        check("the class registers a page with its id and options", /@RegisterPage\(\)/.test(file.text) && /PageController\(\s*"revenue"/.test(file.text) && /displayName: "Revenue"/.test(file.text) && /icon: "i-ph-chart-line"/.test(file.text) && /description: "Monthly revenue overview"/.test(file.text) && /order: 4/.test(file.text), file.text),
        check("the layout is DefaultLayout({ fullWidth: true })", file.text.includes("DefaultLayout({ fullWidth: true })"), file.text),
        check("the barrel exports the page", barrel.text.includes('export * from "./revenue/page"'), barrel.text),
      ]);
      const structure = await operation(ctx, "read it", "GetPageStructure", "/reports/revenue");
      const listed = await operation(ctx, "list", "ListPages");
      const entry = list(listed.raw).find((row) => text(row, "ref") === "/reports/revenue");
      await ctx.verify("the page reads back", [
        check("structure: no blocks, a version", Array.isArray(pickBlocks(structure)) && pickBlocks(structure).length === 0 && text(structure.data, "version") !== "", structure.data),
        check("structure: no changes for a read", structure.changes.length === 0, structure.changes),
        check("structure: meta", text(structure.data, "page", "displayName") === "Revenue" && text(structure.data, "page", "category") === "pages.reports" && text(structure.data, "page", "description") === "Monthly revenue overview", structure.data),
        check("ListPages summary", text(entry, "displayName") === "Revenue" && text(entry, "category") === "pages.reports" && entry?.order === 4 && text(entry, "icon") === "i-ph-chart-line", entry),
      ]);
      const beside = await operation(ctx, "a category declared in a page file", "CreatePage", { name: "side", displayName: "Side", category: "pages.shop" });
      await ctx.verify("without a barrel beside the category the page goes to src/<name>.ts", [check("src/side.ts", beside.ok && text(beside.data, "filepath").endsWith("/src/side.ts") && projectHas(ctx, "src/side.ts"), beside.raw)]);
      const placed = await operation(ctx, "with a dir", "CreatePage", { name: "monthly", displayName: "Monthly", category: "pages", dir: "reporting" });
      await ctx.verify("dir replaces the placement", [check("src/reporting/monthly/page.ts exists", placed.ok && projectHas(ctx, "src/reporting/monthly/page.ts"), placed.raw)]);
      const outside = await operation(ctx, "dir outside src", "CreatePage", { name: "escape", displayName: "E", category: "pages", dir: "../elsewhere" });
      const twice = await operation(ctx, "duplicate", "CreatePage", { name: "revenue", displayName: "Again", category: "pages.reports" });
      const upper = await operation(ctx, "uppercase", "CreatePage", { name: "Revenue2", displayName: "x", category: "pages.shop" });
      const underscore = await operation(ctx, "underscore", "CreatePage", { name: "a_b", displayName: "x", category: "pages.shop" });
      const doubled = await operation(ctx, "double dash", "CreatePage", { name: "a--b", displayName: "x", category: "pages.shop" });
      const unknown = await operation(ctx, "unknown category", "CreatePage", { name: "lost", displayName: "x", category: "pages.nope" });
      const digits = await operation(ctx, "digits and single dashes", "CreatePage", { name: "q1-2026", displayName: "Q1", category: "pages.shop" });
      await ctx.verify("refusals and the accepted shape", [
        failsWith("a dir outside src is unsupported", outside, "unsupported"),
        failsWith("a duplicate is duplicate_name", twice, "duplicate_name"),
        failsWith("uppercase is invalid_config", upper, "invalid_config"),
        failsWith("an underscore is invalid_config", underscore, "invalid_config"),
        failsWith("a double dash is invalid_config", doubled, "invalid_config"),
        failsWith("an unknown category is not_found", unknown, "not_found"),
        check("lowercase letters, digits and single dashes are accepted", digits.ok, digits.raw),
        check("no file for a refused page", !projectHas(ctx, "src/lost/page.ts") && !projectHas(ctx, "src/elsewhere/escape/page.ts"), "files"),
      ]);
    },
  },
  {
    id: "configure-a-page-patches-and-moves-it",
    title: "ConfigurePage patches metadata in place, null removes an option, a category patch moves the file and the route with a route_changed warning, and the refusals are not_found, duplicate_name and stale",
    entryPoint: "ConfigurePage",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "category", "CreateCategory", { name: "reports", displayName: "Reports", parent: "pages" });
      await operation(ctx, "page", "CreatePage", { name: "revenue", displayName: "Revenue", category: "pages.shop", order: 4, icon: "i-ph-chart-line" });
      const patched = await operation(ctx, "patch", "ConfigurePage", "/shop/revenue", { displayName: "Monthly revenue", order: 10, hidden: true, icon: null });
      const file = readProject(ctx, "page.ts", "src/revenue.ts");
      await ctx.verify("the patch is rewritten in place", [
        check("ok, same ref, no route warning", patched.ok && text(patched.data, "ref") === "/shop/revenue" && !warningCodes(patched).includes("route_changed"), patched.raw),
        check("displayName, order and hidden", /displayName: "Monthly revenue"/.test(file.text) && /order: 10/.test(file.text) && /hidden: true/.test(file.text), file.text),
        check("a null removes the icon", !file.text.includes("icon:"), file.text),
      ]);
      const structure = await operation(ctx, "read", "GetPageStructure", "/shop/revenue");
      await ctx.verify("the structure reads the patch back", [check("hidden, order, no icon", text(structure.data, "page", "displayName") === "Monthly revenue" && pick(structure.data, "page", "hidden") === true && pick(structure.data, "page", "order") === 10 && pick(structure.data, "page", "icon") === undefined, structure.data)]);
      const moved = await operation(ctx, "move", "ConfigurePage", "/shop/revenue", { category: "pages.reports" });
      await ctx.verify("a category patch moves the page", [
        check("the new ref", moved.ok && text(moved.data, "ref") === "/reports/revenue", moved.raw),
        check("a route_changed warning", warningCodes(moved).includes("route_changed"), moved.warnings),
        check("the category option is the new one", readProject(ctx, "page.ts", "src/revenue/page.ts").text.includes("reportsCategory") && !projectHas(ctx, "src/revenue.ts"), "page.ts"),
      ]);
      const unknownCategory = await operation(ctx, "unknown category", "ConfigurePage", "/reports/revenue", { category: "pages.nope" });
      const unknownPage = await operation(ctx, "unknown page", "ConfigurePage", "/nope", { order: 1 });
      const version = text((await operation(ctx, "read", "GetPageStructure", "/reports/revenue")).data, "version");
      await operation(ctx, "hand edit through another write", "ConfigurePage", "/reports/revenue", { order: 11 });
      const stale = await operation(ctx, "stale write", "ConfigurePage", "/reports/revenue", { order: 12 }, { expectedVersion: version });
      const fresh = text((await operation(ctx, "read", "GetPageStructure", "/reports/revenue")).data, "version");
      const accepted = await operation(ctx, "current version", "ConfigurePage", "/reports/revenue", { order: 13 }, { expectedVersion: fresh });
      await ctx.verify("refusals", [
        failsWith("an unknown category is not_found", unknownCategory, "not_found"),
        failsWith("an unknown page is not_found", unknownPage, "not_found"),
        failsWith("a stale expectedVersion is stale", stale, "stale"),
        check("the stale write changed nothing", /order: 11/.test(readProject(ctx, "page.ts", "src/revenue/page.ts").text), "page.ts"),
        check("the current version is accepted", accepted.ok, accepted.raw),
      ]);
    },
  },
  {
    id: "delete-a-page-removes-its-file-and-import",
    title: "DeletePage removes the page class, its file and its barrel export, refuses an unknown page and a stale version",
    entryPoint: "DeletePage",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "page", "CreatePage", { name: "scrap", displayName: "Scrap", category: "pages.shop" });
      const version = text((await operation(ctx, "read", "GetPageStructure", "/shop/scrap")).data, "version");
      await operation(ctx, "touch", "ConfigurePage", "/shop/scrap", { order: 2 });
      const stale = await operation(ctx, "stale delete", "DeletePage", "/shop/scrap", { expectedVersion: version });
      await ctx.verify("a stale delete is refused", [failsWith("stale", stale, "stale"), check("the file is still there", projectHas(ctx, "src/scrap.ts"), "file")]);
      const gone = await operation(ctx, "delete", "DeletePage", "/shop/scrap");
      await ctx.verify("the page is gone", [
        check("ok", gone.ok, gone.raw),
        check("the file is deleted", !projectHas(ctx, "src/scrap.ts"), "file"),
        check("the barrel no longer exports it", !readProject(ctx, "the barrel", "src/index.ts").text.includes("scrap"), "barrel"),
        check("ListPages no longer lists it", !list((await operation(ctx, "list", "ListPages")).raw).some((row) => text(row, "ref") === "/shop/scrap"), "list"),
      ]);
      const again = await operation(ctx, "delete again", "DeletePage", "/shop/scrap");
      await ctx.verify("an unknown page is not_found", [failsWith("not_found", again, "not_found")]);
    },
  },
]);

/**
 * @param {import("../builder.mjs").OpAnswer} answer A structure answer
 * @returns {unknown[]} Its blocks
 */
function pickBlocks(answer) {
  const blocks = pick(answer.data, "blocks");
  return Array.isArray(blocks) ? blocks : [];
}

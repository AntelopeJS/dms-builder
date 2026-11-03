import { guarded } from "../guard.mjs";
import { check, failsWith, list, operation, projectHas, readProject, text } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

export const journeys = guarded([
  {
    id: "a-category-is-written-beside-the-root-barrel",
    title: "CreateCategory writes <name>.category.ts and imports it from the barrel, the listing and the ref follow, a duplicate and a bad name are refused",
    entryPoint: "CreateCategory, ListCategories",
    async run(/** @type {Ctx} */ ctx) {
      const made = await operation(ctx, "create reports", "CreateCategory", { name: "reports", displayName: "Reports", parent: "pages", icon: "i-ph-folder", order: 3 });
      await ctx.verify("the category is created under pages", [
        check("ok", made.ok, made.raw),
        check("ref is pages.reports", text(made.data, "ref") === "pages.reports", made.data),
        check("the changes name reports.category.ts and the barrel", made.changes.some((change) => text(change, "path").endsWith("/src/reports.category.ts") && text(change, "kind") === "create") && made.changes.some((change) => text(change, "path").endsWith("/src/index.ts") && text(change, "kind") === "modify"), made.changes.map((change) => text(change, "path"))),
      ], { critical: true });
      const file = readProject(ctx, "reports.category.ts", "src/reports.category.ts");
      const barrel = readProject(ctx, "the barrel", "src/index.ts");
      await ctx.verify("the files hold the declaration", [
        check("Category(\"reports\") with its name, icon and order", /Category\("reports", \{[^}]*displayName: "Reports"[^}]*icon: "i-ph-folder"[^}]*order: 3/s.test(file.text), file.text),
        check("the barrel imports it", barrel.text.includes('import "./reports.category"'), barrel.text),
      ]);
      const listed = await operation(ctx, "list", "ListCategories", {});
      const entry = list(listed.raw).find((row) => text(row, "ref") === "pages.reports");
      await ctx.verify("ListCategories reads it back", [
        check("displayName, parent, icon and order", text(entry, "displayName") === "Reports" && text(entry, "parent") === "pages" && text(entry, "icon") === "i-ph-folder" && entry?.order === 3, entry),
      ]);
      const twice = await operation(ctx, "again", "CreateCategory", { name: "reports", displayName: "Reports 2" });
      const bad = await operation(ctx, "uppercase name", "CreateCategory", { name: "Reports_X", displayName: "x" });
      const dash = await operation(ctx, "double dash", "CreateCategory", { name: "a--b", displayName: "x" });
      const orphan = await operation(ctx, "unknown parent", "CreateCategory", { name: "kids", displayName: "Kids", parent: "pages.nope" });
      await ctx.verify("refusals", [
        failsWith("a duplicate name is duplicate_name", twice, "duplicate_name"),
        failsWith("an uppercase name is invalid_config", bad, "invalid_config"),
        failsWith("a double dash is invalid_config", dash, "invalid_config"),
        failsWith("an unknown parent is not_found", orphan, "not_found"),
        check("nothing was written for the refusals", !projectHas(ctx, "src/Reports_X.category.ts") && !projectHas(ctx, "src/kids.category.ts"), "files"),
      ]);
      const nested = await operation(ctx, "nested", "CreateCategory", { name: "yearly", displayName: "Yearly", parent: "pages.reports" });
      await ctx.verify("a nested category joins parent and id with a dot", [check("pages.reports.yearly", text(nested.data, "ref") === "pages.reports.yearly", nested.raw)]);
    },
  },
  {
    id: "configure-and-delete-follow-the-documented-refusals",
    title: "ConfigureCategory patches in place and refuses parent, built-in and unknown categories; DeleteCategory removes the file, and refuses a category that holds pages or children with blockedBy",
    entryPoint: "ConfigureCategory, DeleteCategory",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "create", "CreateCategory", { name: "reports", displayName: "Reports", parent: "pages", order: 1 });
      const configured = await operation(ctx, "patch", "ConfigureCategory", "pages.reports", { displayName: "Reporting", order: 2 });
      const file = readProject(ctx, "reports.category.ts", "src/reports.category.ts");
      await ctx.verify("the patch rewrote the options", [
        check("displayName and order changed", /displayName: "Reporting"/.test(file.text) && /order: 2/.test(file.text) && !file.text.includes('"Reports"'), file.text),
        check("the call is ok", configured.ok, configured.raw),
      ]);
      const parent = await operation(ctx, "parent", "ConfigureCategory", "pages.reports", { parent: "pages.shop" });
      const builtIn = await operation(ctx, "built-in", "ConfigureCategory", "pages", { displayName: "x" });
      const unknown = await operation(ctx, "unknown", "ConfigureCategory", "pages.nope", { displayName: "x" });
      await ctx.verify("refusals", [
        failsWith("a parent patch is unsupported", parent, "unsupported"),
        failsWith("a built-in category is unsupported", builtIn, "unsupported"),
        failsWith("an unknown category is not_found", unknown, "not_found"),
      ]);
      await operation(ctx, "page", "CreatePage", { name: "q1", displayName: "Q1", category: "pages.reports" });
      await operation(ctx, "child", "CreateCategory", { name: "yearly", displayName: "Yearly", parent: "pages.reports" });
      const blocked = await operation(ctx, "delete a used category", "DeleteCategory", "pages.reports");
      const blockedBy = Array.isArray(pickBlocked(blocked)) ? pickBlocked(blocked) : [];
      await ctx.verify("a category with pages or children cannot be deleted", [
        failsWith("referential_integrity", blocked, "referential_integrity"),
        check("blockedBy lists the page and the child category", blockedBy.includes("/reports/q1") && blockedBy.includes("pages.reports.yearly"), blockedBy),
        check("the file is still there", projectHas(ctx, "src/reports.category.ts"), "file"),
      ]);
      const builtInDelete = await operation(ctx, "delete built-in", "DeleteCategory", "pages");
      await ctx.verify("the built-in root category is not deleted", [check("refused (the root also holds pages, so referential_integrity answers first)", !builtInDelete.ok && ["unsupported", "referential_integrity"].includes(text(builtInDelete.error, "code")) && builtInDelete.changes.length === 0, builtInDelete.raw)]);
      await operation(ctx, "drop the page", "DeletePage", "/reports/q1");
      await operation(ctx, "drop the child", "DeleteCategory", "pages.reports.yearly");
      const gone = await operation(ctx, "delete the empty category", "DeleteCategory", "pages.reports");
      await ctx.verify("an empty category is deleted with its file and its import", [
        check("ok", gone.ok, gone.raw),
        check("the file is deleted", !projectHas(ctx, "src/reports.category.ts"), "file"),
        check("the barrel no longer imports it", !readProject(ctx, "the barrel", "src/index.ts").text.includes("reports.category"), "barrel"),
      ]);
    },
  },
]);

/**
 * @param {import("../builder.mjs").OpAnswer} answer A failed answer
 * @returns {unknown} Its blockedBy
 */
function pickBlocked(answer) {
  return answer.error?.blockedBy;
}

import { guarded } from "../guard.mjs";
import { check, list, operation, pick, projectFiles, text } from "../builder.mjs";
import { openBuilder } from "../editor.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

export const journeys = guarded([
  {
    id: "a-table-is-created-and-deleted-from-the-tables-workspace",
    title: "+ Table asks for a name and writes database.ts, data-api.ts and index.ts at once with one Title field; the table lists its fields and pages; Delete the table and its rows stays disabled until the key is typed and then deletes the files",
    entryPoint: "builder Tables workspace",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await tab.page.getByRole("radio", { name: "Tables" }).check();
      await tab.page.getByRole("button", { name: "New table" }).click();
      await tab.page.getByRole("textbox", { name: "Name" }).fill("invoice");
      await tab.page.getByRole("button", { name: "Create table" }).click();
      await tab.page.waitForTimeout(3500);
      const files = projectFiles(ctx, "src/invoice");
      const structure = await operation(ctx, "read", "GetResourceStructure", "invoice");
      await ctx.verify("the table is written at once", [
        check("three files named after the table", ["data-api.ts", "database.ts", "index.ts"].every((name) => files.some((file) => file.endsWith(name))), files),
        check("one field, Title", list(structure.data, "fields").length === 1, list(structure.data, "fields")),
      ], { critical: true });
      await tab.page.getByRole("button", { name: /^invoice/ }).click();
      await tab.page.getByRole("tab", { name: "Settings" }).click();
      const confirm = tab.page.getByRole("textbox", { name: /to confirm/ });
      const remove = tab.page.getByRole("button", { name: "Delete the table and its rows" });
      await ctx.verify("the deletion is gated by the key", [
        check("disabled while the field is empty", await remove.isDisabled(), "button"),
      ]);
      await confirm.fill("wrong");
      const wrong = await remove.isDisabled();
      await confirm.fill("invoice");
      await ctx.verify("the key enables it", [check("a wrong text keeps it disabled", wrong, "wrong"), check("the key enables it", !(await remove.isDisabled()), "key")]);
    },
  },
  {
    id: "delete-the-table-removes-it-and-its-files-at-once",
    title: "Delete the table and its rows, enabled by the typed key, deletes the table's files and rows at once (known finding: the UI calls DELETE /api/builder/resource, which the backend does not serve)",
    entryPoint: "builder Tables workspace, Settings tab, DELETE /api/builder/resource",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "a table", "CreateResource", { name: "invoice", fields: [{ name: "title", dataType: { $dataType: "string" } }] });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await tab.page.getByRole("radio", { name: "Tables" }).check();
      await tab.page.getByRole("button", { name: /^invoice/ }).click();
      await tab.page.getByRole("tab", { name: "Settings" }).click();
      await tab.page.getByRole("textbox", { name: /to confirm/ }).fill("invoice");
      const remove = tab.page.getByRole("button", { name: "Delete the table and its rows" });
      await remove.click();
      await tab.page.waitForTimeout(3500);
      const left = await operation(ctx, "list", "ListResources");
      await ctx.verify("the table is deleted at once", [
        check("ListResources no longer lists it", !list(left.raw).some((row) => text(row, "ref") === "invoice"), left.raw),
        check("no file is left", projectFiles(ctx, "src/invoice").length === 0, projectFiles(ctx, "src/invoice")),
      ]);
    },
  },
  {
    id: "an-open-table-shows-its-rows-route-readers-and-tabs",
    title: "The Tables list shows each table's field count and readers, and an open table shows its row count at the tenant, the route its API is served at and the pages that read it, with Fields, API and Settings tabs",
    entryPoint: "builder Tables workspace",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await tab.page.getByRole("radio", { name: "Tables" }).check();
      await ctx.verify("the list line", [tab.visible({ role: "button", name: "order 3 fields · 1 page" }, { timeoutMs: 30_000 }), tab.shows(/1 table/)]);
      await tab.page.getByRole("button", { name: /^order/ }).click();
      await ctx.verify("the open table", [
        tab.shows(/18 rows · served at \/api\/order · read by Board/),
        tab.visible({ role: "tab", name: "Fields 3" }),
        tab.visible({ role: "tab", name: "API 8/8" }),
        tab.visible({ role: "tab", name: "Settings", exact: true }),
      ]);
      await tab.page.getByRole("tab", { name: "Settings" }).click();
      await ctx.verify("Settings shows the key, the database table, the API route and the readers", [tab.shows(/order/), tab.shows(/\/api\/order/), tab.shows(/Board/), tab.visible({ role: "button", name: "Delete the table and its rows" })]);
    },
  },
  {
    id: "the-last-served-route-cannot-be-switched-off",
    title: "The API tab lists the Read and Write routes, each on or off; switching routes off rewrites the controller, and the last served route cannot be switched off",
    entryPoint: "builder Tables workspace, API tab",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "a singleton", "CreateResource", { name: "settings-box", fields: [{ name: "title", dataType: { $dataType: "string" } }], routes: ["get", "edit"] });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await tab.page.getByRole("radio", { name: "Tables" }).check();
      await tab.page.getByRole("button", { name: /^settings-box/ }).click();
      await tab.page.getByRole("tab", { name: "API" }).click();
      const read = tab.page.getByRole("switch", { name: "Read", exact: true });
      const update = tab.page.getByRole("switch", { name: "Update", exact: true });
      await ctx.verify("the routes and which are on", [
        check("Read and Update are on", (await read.first().isChecked()) && (await update.first().isChecked()), "switches"),
        check("List is off", !(await tab.page.getByRole("switch", { name: "List", exact: true }).first().isChecked()), "list"),
      ]);
      await update.first().click();
      await tab.page.waitForTimeout(3000);
      const afterOne = await operation(ctx, "read", "GetResourceStructure", "settings-box");
      await ctx.verify("switching Update off keeps the others", [check("routes are get only", JSON.stringify(pick(afterOne.data, "routes")) === '["get"]', afterOne.data)]);
      await read.first().click();
      await tab.page.waitForTimeout(2500);
      const afterTwo = await operation(ctx, "read", "GetResourceStructure", "settings-box");
      await ctx.verify("the last served route stays on", [check("routes are still get", JSON.stringify(pick(afterTwo.data, "routes")) === '["get"]', afterTwo.data)]);
    },
  },
]);

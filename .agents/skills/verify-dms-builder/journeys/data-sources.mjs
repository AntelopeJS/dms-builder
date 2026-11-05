import { guarded } from "../guard.mjs";
import { check } from "../builder.mjs";
import { inspector, openBuilder, saveStatus } from "../editor.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

export const journeys = guarded([
  {
    id: "the-data-workspace-lists-the-sources-of-the-page-and-adds-one",
    title: "The Data workspace opens on the page's sources, + Source adds one without a block, and its panel offers the table it measures",
    entryPoint: "builder Data workspace",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await tab.page.getByRole("radio", { name: "Data", exact: true }).check();
      await tab.visible({ role: "button", name: "New data source" }, { timeoutMs: 30_000 });
      const before = await tab.page.locator("body").innerText();
      await ctx.verify("the Data workspace reads the page's sources", [
        check("two sources on this page", /2 on this page/i.test(before), before.slice(0, 500)),
        check("the sentence says what the open one measures", /Count of order rows, by Status/i.test(before), before.slice(0, 500)),
        check("it says where the route answers", /GET \/dms\/pages\/shop\/board\/stats\/chart-card/i.test(before), before.slice(0, 500)),
        check("it lists the block that reads it", /Used by · 1/i.test(before) && /Orders by status/i.test(before), before.slice(0, 500)),
        tab.visible({ role: "button", name: "Remove the source" }),
        check("Remove the source stays disabled while a block reads it", await tab.page.getByRole("button", { name: "Remove the source" }).isDisabled(), "button"),
      ]);
      await tab.page.getByRole("button", { name: "Select" }).first().click();
      await ctx.verify("Select selects the block that reads the source on the page", [
        check("the Page workspace opens", await tab.page.getByRole("radio", { name: "Page", exact: true }).isChecked(), "workspace"),
        check("the inspector names the block", (await inspector(tab).innerText()).includes("Orders by status"), await inspector(tab).innerText()),
      ]);
      await tab.page.getByRole("radio", { name: "Data", exact: true }).check();
      await tab.page.getByRole("button", { name: "New data source" }).click();
      await tab.visible({ role: "button", name: "Add the source" }, { timeoutMs: 20_000 });
      const form = await tab.page.locator("body").innerText();
      await ctx.verify("New data source asks for a name, a table and a measure", [
        check("the name is a route name", /Names its route: letters and digits, starting with a letter\./.test(form), form.slice(0, 600)),
        check("it picks a table and a measure that starts on Count", /From\s+Pick a table…/.test(form) && /Measure\s+Count/.test(form), form.slice(0, 600)),
        check("Add the source is disabled until it is filled", await tab.page.getByRole("button", { name: "Add the source" }).isDisabled(), "button"),
      ]);
      await tab.page.getByRole("button", { name: "Cancel" }).click();
      await ctx.verify("Cancel adds nothing", [tab.shows(/2 on this page/i)]);
      await tab.page.getByRole("button", { name: "New data source" }).click();
      await tab.page.getByRole("textbox", { name: "Name" }).fill("paidOrders");
      await tab.page.getByRole("combobox").first().click().catch(() => tab.page.getByText("Pick a table…").first().click());
      await tab.page.getByRole("option", { name: /order/ }).first().click();
      await tab.page.getByRole("button", { name: "Add the source" }).click();
      await ctx.verify("the new source is a draft: it carries the unsaved dot and the bar counts a change", [
        check("three sources", await tab.shows(/3 on this page/i).then((result) => result.pass), "count"),
        check("a Not saved yet marker", (await tab.page.locator('[title="Not saved yet"]').count()) >= 1, "dot"),
        check("the bar counts a change", /unsaved change/.test(await saveStatus(tab)), await saveStatus(tab)),
      ]);
    },
  },
  {
    id: "read-it-now-shows-one-row-per-group-known-finding",
    title: "Read it now runs the page's chart-card source and shows one row per status, with no undefined or NaN row (known finding dms-builder#152)",
    entryPoint: "builder Data workspace, Read it now",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await tab.page.getByRole("radio", { name: "Data", exact: true }).check();
      await tab.visible({ role: "button", name: "Read it now" }, { timeoutMs: 30_000 });
      await tab.page.getByRole("button", { name: "Read it now" }).click();
      await tab.shows(/paid\s+12/, { timeoutMs: 30_000 });
      const rows = await tab.page.locator("body").innerText();
      await ctx.verify("Read it now shows the rows of the source", [
        check("no row reads undefined or NaN", !/undefined|NaN/.test(rows), rows.slice(0, 900)),
        check("paid 12, pending 3, refunded 3", /paid\s+12/.test(rows) && /pending\s+3/.test(rows) && /refunded\s+3/.test(rows), rows.slice(0, 900)),
      ]);
    },
  },
]);

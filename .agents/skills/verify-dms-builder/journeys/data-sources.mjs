import { guarded } from "../guard.mjs";
import { check } from "../builder.mjs";
import { openBuilder } from "../editor.mjs";

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
      await tab.page.getByRole("button", { name: "New data source" }).click();
      await tab.visible({ role: "button", name: "Add the source" }, { timeoutMs: 20_000 });
      const form = await tab.page.locator("body").innerText();
      await ctx.verify("New data source asks for a name, a table and a measure", [
        check("the name is a route name", /Names its route: letters and digits, starting with a letter\./.test(form), form.slice(0, 600)),
        check("it picks a table and a measure that starts on Count", /From\s+Pick a table…/.test(form) && /Measure\s+Count/.test(form), form.slice(0, 600)),
        check("Add the source is disabled until it is filled", await tab.page.getByRole("button", { name: "Add the source" }).isDisabled(), "button"),
        check("the sources are written with the next save", /its route is written with the next save/i.test(form), form.slice(0, 900)),
      ]);
      await tab.page.getByRole("button", { name: "Cancel" }).click();
      await ctx.verify("Cancel adds nothing", [tab.shows(/2 on this page/i), check("the bar still says all changes saved", /All changes saved/.test(await tab.page.locator("body").innerText()), "bar")]);
    },
  },
]);

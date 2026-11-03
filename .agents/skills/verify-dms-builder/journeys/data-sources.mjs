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
        check("two sources on this page", /2 on this page/.test(before), before.slice(0, 500)),
        check("the sentence says what the open one measures", /Count of order rows, by Status/.test(before), before.slice(0, 500)),
        check("it says where the route answers", /GET \/dms\/pages\/shop\/board\/stats\/chart-card/.test(before), before.slice(0, 500)),
        check("it lists the block that reads it", /Used by · 1/.test(before) && /Orders by status/.test(before), before.slice(0, 500)),
        tab.visible({ role: "button", name: "Remove the source" }),
        check("Remove the source stays disabled while a block reads it", await tab.page.getByRole("button", { name: "Remove the source" }).isDisabled(), "button"),
      ]);
      await tab.page.getByRole("button", { name: "New data source" }).click();
      await tab.page.waitForTimeout(1200);
      const after = await tab.page.locator("body").innerText();
      await ctx.verify("a source was added", [
        check("it carries the unsaved badge", /unsaved/i.test(after), after.slice(0, 600)),
        check("it shows where it answers", /Answers at/.test(after), after.slice(0, 600)),
        check("it lists no block as reading it", /Used by/.test(after), after.slice(0, 600)),
      ]);
    },
  },
]);

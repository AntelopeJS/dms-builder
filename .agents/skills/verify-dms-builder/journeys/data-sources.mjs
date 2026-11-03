import { guarded } from "../guard.mjs";
import { BOARD, check, list, operation, text } from "../builder.mjs";
import { openBuilder } from "../editor.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

export const journeys = guarded([
  {
    id: "the-data-workspace-lists-the-sources-of-the-page-and-adds-one",
    title: "The Data workspace opens on the page's sources, + Source adds one without a block, and its panel offers the table it measures",
    entryPoint: "builder Data workspace",
    async run(/** @type {Ctx} */ ctx) {
      const structure = await operation(ctx, "read the board", "GetPageStructure", BOARD);
      const written = await operation(ctx, "a source nothing reads", "SetPageBlocks", BOARD, {
        blocks: list(structure.data, "blocks").map((block) => ({ name: text(block, "name"), preserve: true })),
        queries: [{ name: "ordersByStatus", resource: "order", template: "series", params: { groupBy: "status" } }],
      });
      await ctx.verify("the page has one source", [check("the write is ok", written.ok, written.raw)], { critical: true });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await tab.page.getByRole("radio", { name: "Data" }).check();
      const before = await tab.page.locator("body").innerText();
      await ctx.verify("the Data workspace reads the source as a sentence", [
        check("it counts one source on this page", /1 on this page/.test(before), before.slice(0, 500)),
        check("the sentence says what it measures", /Count of order rows/.test(before), before.slice(0, 500)),
      ]);
      await tab.page.getByRole("button", { name: /Source/ }).first().click();
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

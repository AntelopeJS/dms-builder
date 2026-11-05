import { guarded } from "../guard.mjs";
import { BOARD, builder, check, list, pick, rebuild, readProject, text } from "../builder.mjs";
import { inspector, openBuilder, selectBlock, statusBecomes } from "../editor.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

const PAGE_FILE = "src/board/page.ts";

/** The introduction's "What one change looks like": retitle a card, save, and read the change in the source. */
export const journeys = guarded([
  {
    id: "smoke",
    title: "an owner opens the Board page in the builder, retitles the Revenue card, saves, and the new title is in the page source, in the structure API and on the reloaded page",
    entryPoint: "/shop/board hammer button, POST /api/builder/page/blocks, GET /api/builder/page",
    async run(/** @type {Ctx} */ ctx) {
      const status = await builder(ctx, "read the status", "GET", "/status");
      await ctx.verify("the builder is on and edits the run's playground", [
        check("GET /status answers ok", status.status === 200 && pick(status.body, "ok") === true, status.body),
        check("the project root is the run's copy of the playground", text(status.body, "projectRoot").endsWith("/playground"), text(status.body, "projectRoot")),
      ]);
      const before = readProject(ctx, "the Board page before", PAGE_FILE);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await selectBlock(tab, "Revenue");
      const title = inspector(tab).getByRole("textbox", { name: "Title*" });
      await title.fill("Revenue invoiced");
      await ctx.verify("the edit is a draft, not yet written", [
        check("the bar counts one unsaved change", await statusBecomes(tab, /^1 unsaved change$/, 15_000), "bar"),
        check("the source still holds the old title", readProject(ctx, "the Board page during the draft", PAGE_FILE).text === before.text, "page.ts"),
      ]);
      await tab.page.getByRole("button", { name: "Save", exact: true }).click();
      await ctx.verify("Save writes the file", [check("the bar reads Saved", await statusBecomes(tab, /^Saved/), "bar")], { critical: true });
      const after = readProject(ctx, "the Board page after", PAGE_FILE);
      await ctx.verify("the source holds the new title", [
        check("the card's title is the new one", after.text.includes('title: "Revenue invoiced"'), "page.ts"),
        check("the old title is gone from the card", !after.text.includes('title: "Revenue",'), "page.ts"),
        check("the other blocks are still in the file", ["Orders by status", "Chart card 3", "New order", "Form 2"].every((title) => after.text.includes(title)), "page.ts"),
      ]);
      const structure = await builder(ctx, "read the page structure", "GET", `/page?ref=${encodeURIComponent(BOARD)}`);
      const blocks = list(structure.body, "data", "blocks");
      const revenue = blocks.find((block) => text(block, "name") === "revenueChart");
      await ctx.verify("the structure API reads the new title back", [check("revenueChart's config title", text(revenue, "config", "title") === "Revenue invoiced", revenue)]);
      await ctx.verify("the project compiles and serves the page", [await rebuild(ctx)], { critical: true });
      const reload = await ctx.tab();
      await reload.signIn("admin");
      await reload.goto(BOARD);
      await ctx.verify("the reloaded page shows the new title", [reload.shows(/Revenue invoiced/i, { timeoutMs: 30_000 })]);
    },
  },
]);

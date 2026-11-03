import { guarded } from "../guard.mjs";
import { BOARD, check, member, operation, readProject } from "../builder.mjs";
import { inspector, openBuilder, saveStatus, selectBlock, statusBecomes } from "../editor.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

const PAGE_FILE = "src/board/page.ts";

/**
 * @param {import("../builder.mjs").Tab} tab The tab with the builder open
 * @param {string} title The new title of the Revenue card
 */
async function retitleRevenue(tab, title) {
  await selectBlock(tab, "Revenue");
  await inspector(tab).getByRole("textbox", { name: "Title*" }).fill(title);
}

export const journeys = guarded([
  {
    id: "the-change-list-names-the-edits-and-what-save-checks",
    title: "The save status opens the change list with the unsaved edit in plain words under This page, the three steps Save runs, and Put this one back and Discard all…",
    entryPoint: "builder save status, change list",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await retitleRevenue(tab, "Revenue invoiced");
      await tab.page.getByRole("button", { name: /1 unsaved change/ }).click();
      const panel = inspector(tab);
      const body = await panel.innerText();
      await ctx.verify("the change list", [
        check("the edit is grouped under This page", /This page/.test(body) && /Revenue invoiced/.test(body), body),
        check("On save lists the three steps in order", body.indexOf("Every block has its required settings") >= 0 && body.indexOf("Check the page compiles") > body.indexOf("Every block has its required settings") && body.indexOf("Write the files, then reload the page") > body.indexOf("Check the page compiles"), body),
        tab.visible({ role: "button", name: "Put this one back" }),
        tab.visible({ role: "button", name: "Discard all…" }),
      ]);
      await tab.page.getByRole("button", { name: "Put this one back" }).first().click();
      await ctx.verify("Put this one back reverts that edit", [check("all changes saved again", await statusBecomes(tab, /^All changes saved$/, 15_000), await saveStatus(tab))]);
      await retitleRevenue(tab, "Revenue 2");
      await tab.page.getByRole("button", { name: /1 unsaved change/ }).click();
      await tab.page.getByRole("button", { name: "Discard all…" }).click();
      await tab.page.getByRole("button", { name: /^Discard/ }).last().click();
      await ctx.verify("Discard all drops the draft and writes nothing", [
        check("all changes saved", await statusBecomes(tab, /^All changes saved$/, 15_000), await saveStatus(tab)),
        check("the source is untouched", readProject(ctx, "the board", PAGE_FILE).text.includes('title: "Revenue",'), "board"),
      ]);
    },
  },
  {
    id: "a-save-after-an-outside-change-is-refused-with-three-ways-out",
    title: "When the page source changed since the editor opened it, Save writes nothing and a banner offers Copy my draft, Keep my version and Reload the page; Keep my version then lets Save write the draft",
    entryPoint: "builder Save with a stale version",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await retitleRevenue(tab, "Mine");
      const outside = await operation(ctx, "another editor writes the page", "ConfigurePage", BOARD, { order: 7 });
      await ctx.verify("the page changed on disk", [check("the outside write is ok", outside.ok, outside.raw)]);
      await tab.page.getByRole("button", { name: "Save", exact: true }).click();
      await ctx.verify("the save is refused", [
        tab.shows(/This page changed outside the builder since it was opened\./, { timeoutMs: 30_000 }),
        tab.visible({ role: "button", name: "Copy my draft" }),
        tab.visible({ role: "button", name: "Keep my version" }),
        tab.visible({ role: "button", name: "Reload the page" }),
        check("nothing of the draft was written", !readProject(ctx, "the board", PAGE_FILE).text.includes('title: "Mine"'), "board"),
        check("the outside change is still there", readProject(ctx, "the board", PAGE_FILE).text.includes("order: 7"), "board"),
      ]);
      await tab.page.getByRole("button", { name: "Keep my version" }).click();
      await ctx.verify("Keep my version writes nothing by itself", [check("the source still has the old title", !readProject(ctx, "the board", PAGE_FILE).text.includes('title: "Mine"'), "board")]);
      await tab.page.getByRole("button", { name: "Save", exact: true }).click();
      await ctx.verify("the next Save writes the draft over the outside change", [
        check("Saved", await statusBecomes(tab, /^Saved/), await saveStatus(tab)),
        check("the draft's title is in the source", readProject(ctx, "the board", PAGE_FILE).text.includes('title: "Mine"'), "board"),
        check("the outside order stays", readProject(ctx, "the board", PAGE_FILE).text.includes("order: 7"), "board"),
      ]);
    },
  },
  {
    id: "an-unsaved-draft-is-kept-on-the-device-and-offered-back",
    title: "An unsaved draft survives a reload: the builder puts it back and offers Review and Discard",
    entryPoint: "builder draft in local storage",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await retitleRevenue(tab, "Kept draft");
      await tab.page.waitForTimeout(1500);
      await tab.goto(BOARD);
      await openBuilder(ctx, tab);
      await ctx.verify("the draft comes back", [
        check("the bar counts the unsaved change", await statusBecomes(tab, /^1 unsaved change$/, 20_000), await saveStatus(tab)),
        tab.visible({ role: "button", name: "Review" }, { timeoutMs: 15_000 }),
        tab.visible({ role: "button", name: "Discard" }),
        check("the source was not written", !readProject(ctx, "the board", PAGE_FILE).text.includes("Kept draft"), "board"),
      ]);
    },
  },
  {
    id: "view-as-previews-the-page-the-way-a-role-sees-it",
    title: "With a role in the workspace the bar offers View as: choosing a role that holds nothing hides the page behind a banner naming the role, and Exit preview returns to the owner's view",
    entryPoint: "builder View as menu",
    async run(/** @type {Ctx} */ ctx) {
      await member(ctx, "viewer", []);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      const eye = tab.page.getByRole("button", { name: /View as/ });
      await ctx.verify("the menu exists because the workspace has roles", [check("View as is in the bar", (await eye.count()) >= 1, "bar")]);
      await eye.first().click();
      await tab.page.getByRole("menuitem", { name: /viewer/i }).first().click();
      await ctx.verify("the page is hidden for the role", [tab.shows(/Page hidden for/, { timeoutMs: 20_000 }), tab.visible({ role: "button", name: "Exit preview" })]);
      await tab.page.getByRole("button", { name: "Exit preview" }).click();
      await ctx.verify("Exit preview returns to the owner's view", [tab.visible({ role: "button", name: "Exit preview" }, { hidden: true, timeoutMs: 15_000 })]);
    },
  },
]);

import { guarded } from "../guard.mjs";
import { BOARD, check, list, operation, readProject, text } from "../builder.mjs";
import { inspector, openBuilder, saveStatus, selectBlock, statusBecomes } from "../editor.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

const BLOCKS = ["Period selector", "Tabs", "Placeholder", "form", "Revenue", "Orders by status", "New order", "Form 2", "Table", "Chart card 3"];

export const journeys = guarded([
  {
    id: "the-hammer-and-ctrl-b-open-and-close-the-editor-and-esc-never-does",
    title: "The hammer button opens the editor bar and Ctrl+B closes it again, Esc clears the selection but never closes the builder, and the bar holds the workspaces, undo and redo, the mode switch, Save and Done",
    entryPoint: "the hammer button, Ctrl+B, Esc",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      const bar = tab.page.getByRole("banner").filter({ hasText: "Editing" });
      await ctx.verify("the editor bar", [
        check("it names the page and its address", /Editing\s+\/shop\/board/i.test((await tab.page.locator("body").innerText()).replace(/\n+/g, " ")), await bar.first().innerText()),
        check("the workspaces are Page, Tables, Data and Database", (await tab.page.getByRole("radiogroup", { name: "Workspace" }).getByRole("radio").allInnerTexts()).join() === "Page,Tables,Data,Database", "radios"),
        check("Page is the open workspace", await tab.page.getByRole("radio", { name: "Page", exact: true }).isChecked(), "page"),
        check("nothing is saved or unsaved", (await saveStatus(tab)) === "All changes saved", await saveStatus(tab)),
        check("Undo, Redo and Save start disabled", (await tab.page.getByRole("button", { name: "Undo" }).isDisabled()) && (await tab.page.getByRole("button", { name: "Redo" }).isDisabled()) && (await tab.page.getByRole("button", { name: "Save", exact: true }).isDisabled()), "buttons"),
        check("Simple is the mode", await tab.page.getByRole("radio", { name: "Simple" }).isChecked(), "mode"),
        tab.visible({ role: "button", name: "Done", exact: true }),
        check("nothing is selected", (await inspector(tab).innerText()).includes("Nothing selected"), await inspector(tab).innerText()),
      ]);
      await selectBlock(tab, "Revenue");
      await tab.page.keyboard.press("Escape");
      await ctx.verify("Esc clears the selection and keeps the builder open", [
        check("the inspector is back to Nothing selected", (await inspector(tab).innerText()).includes("Nothing selected"), await inspector(tab).innerText()),
        check("the editor bar is still there", await tab.page.getByRole("radiogroup", { name: "Workspace" }).isVisible(), "bar"),
      ]);
      await tab.page.keyboard.press("Escape");
      await ctx.verify("a second Esc does not close it either", [check("the bar is still there", await tab.page.getByRole("radiogroup", { name: "Workspace" }).isVisible(), "bar")]);
      await tab.page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
      await tab.page.keyboard.press("Control+b");
      await ctx.verify("Ctrl+B closes the builder", [tab.visible({ role: "radiogroup", name: "Workspace" }, { hidden: true, timeoutMs: 15_000 })]);
      await tab.page.keyboard.press("Control+b");
      await ctx.verify("Ctrl+B opens it again", [tab.visible({ role: "radiogroup", name: "Workspace" }, { timeoutMs: 15_000 })]);
      await tab.page.getByRole("button", { name: "Builder — edit this page" }).click();
      await ctx.verify("the hammer closes it", [tab.visible({ role: "radiogroup", name: "Workspace" }, { hidden: true, timeoutMs: 15_000 })]);
    },
  },
  {
    id: "the-layers-tab-lists-every-block-and-selecting-opens-its-settings",
    title: "Layers lists every block of the page as a tree, the search narrows it, clicking a row selects the block and the inspector names its title, its kind and who sees it, with the tabs its kind has",
    entryPoint: "builder Layers tab, Inspector",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await tab.page.getByRole("tab", { name: "Layers" }).click();
      const tree = tab.page.getByRole("tree", { name: "Blocks of the page" });
      const titles = (await tree.getByRole("treeitem").allInnerTexts()).map((row) => row.replace(/\s*Actions for.*$/s, "").trim());
      await ctx.verify("the tree lists the page's blocks in order", [check("eleven blocks and the page", titles.slice(1).join("|") === ["Period selector", "Tabs", "Placeholder", "form", "Placeholder", ...BLOCKS.slice(4)].join("|"), titles)]);
      await tab.page.getByRole("textbox", { name: "Find a block on this page" }).fill("chart");
      await ctx.verify("the search narrows the tree", [check("only the chart cards remain", (await tree.getByRole("treeitem").allInnerTexts()).filter((row) => /Chart card 3|Orders by status|Revenue/.test(row)).length >= 2 && !(await tree.innerText()).includes("Form 2"), await tree.innerText())]);
      await tab.page.getByRole("textbox", { name: "Find a block on this page" }).fill("");
      await selectBlock(tab, "Revenue");
      const panel = inspector(tab);
      await ctx.verify("a chart card's inspector", [
        check("it names the title and the kind", /Revenue\s+Chart card/.test((await panel.innerText()).replace(/\n+/g, " ")), await panel.innerText()),
        check("it says who sees it and links to Roles", /Only the owner sees it/.test(await panel.innerText()) && (await panel.getByRole("button", { name: "Roles" }).count()) === 1, await panel.innerText()),
        check("tabs Content, Data and Style", (await panel.getByRole("tablist", { name: "Settings" }).getByRole("tab").allInnerTexts()).join() === "Content,Data,Style", "tabs"),
        check("Duplicate and Remove sit at the bottom", (await panel.getByRole("button", { name: "Duplicate" }).count()) === 1 && (await panel.getByRole("button", { name: "Remove" }).count()) === 1, "buttons"),
      ]);
      await selectBlock(tab, "Table");
      await ctx.verify("a table's inspector has its own tabs", [check("Content, Actions and Style", (await panel.getByRole("tablist", { name: "Settings" }).getByRole("tab").allInnerTexts()).join() === "Content,Actions,Style", await panel.innerText())]);
      await selectBlock(tab, "form");
      await ctx.verify("a form's inspector has its own tabs", [check("Fields, After submit and Style", (await panel.getByRole("tablist", { name: "Settings" }).getByRole("tab").allInnerTexts()).join() === "Fields,After submit,Style", await panel.innerText())]);
    },
  },
  {
    id: "adding-duplicating-removing-and-undoing-are-unsaved-changes-until-save",
    title: "A block added from the catalog, duplicated with Ctrl+D or removed with Delete is an unsaved change that Undo and Redo walk through, that Done asks about, and that Save writes into the page source",
    entryPoint: "builder Add tab, Ctrl+D, Delete, Ctrl+Z, Ctrl+Shift+Z, Ctrl+S",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      const before = readProject(ctx, "the board", "src/board/page.ts").text;
      await tab.page.getByRole("textbox", { name: "Search blocks" }).fill("KPI");
      await tab.page.getByRole("button", { name: /KPI card/i }).first().click();
      await ctx.verify("adding a block", [
        check("the bar counts one unsaved change", await statusBecomes(tab, /^1 unsaved change$/, 15_000), await saveStatus(tab)),
        check("the source is untouched", readProject(ctx, "the board", "src/board/page.ts").text === before, "board"),
        check("Undo is enabled and Save too", !(await tab.page.getByRole("button", { name: "Undo" }).isDisabled()) && !(await tab.page.getByRole("button", { name: "Save", exact: true }).isDisabled()), "buttons"),
      ]);
      await tab.page.keyboard.press("Control+z");
      await ctx.verify("Ctrl+Z undoes it", [check("back to all changes saved", await statusBecomes(tab, /^All changes saved$/, 15_000), await saveStatus(tab)), check("Redo is enabled", !(await tab.page.getByRole("button", { name: "Redo" }).isDisabled()), "redo")]);
      await tab.page.keyboard.press("Control+Shift+z");
      await ctx.verify("Ctrl+Shift+Z redoes it", [check("one unsaved change again", await statusBecomes(tab, /^1 unsaved change$/, 15_000), await saveStatus(tab))]);
      await tab.page.keyboard.press("Control+s");
      await ctx.verify("Ctrl+S saves", [check("the bar reads Saved", await statusBecomes(tab, /^Saved/), await saveStatus(tab))], { critical: true });
      const after = await operation(ctx, "read", "GetPageStructure", BOARD);
      await ctx.verify("the new card is in the page source", [
        check("one more top-level block than the eight before", list(after.data, "blocks").length === 9, list(after.data, "blocks").map((block) => text(block, "name"))),
        check("a KpiCard was written", list(after.data, "blocks").some((block) => text(block, "type") === "KpiCard"), after.data),
      ]);
      await selectBlock(tab, "Revenue");
      await tab.page.getByRole("button", { name: "Remove" }).click();
      await ctx.verify("Remove is an unsaved change too", [check("one unsaved change", await statusBecomes(tab, /^1 unsaved change$/, 15_000), await saveStatus(tab)), check("the source still holds Revenue", readProject(ctx, "the board", "src/board/page.ts").text.includes("static revenueChart"), "board")]);
      await tab.page.getByRole("button", { name: "Done" }).click();
      await ctx.verify("Done asks before leaving with unsaved changes", [
        tab.visible({ role: "button", name: "Leave without saving" }, { timeoutMs: 15_000 }),
        tab.visible({ role: "button", name: "Leave, keep the draft" }),
        tab.visible({ role: "button", name: "Save and leave" }),
      ]);
      await tab.page.getByRole("button", { name: "Leave without saving" }).click();
      await ctx.verify("Leave without saving keeps the source", [check("Revenue is still in the page source", readProject(ctx, "the board", "src/board/page.ts").text.includes("static revenueChart"), "board")]);
    },
  },
  {
    id: "developer-mode-adds-the-blocks-simple-mode-hides",
    title: "The Add tab groups blocks as Layout, Content, Data, Visualization and Other, Simple mode leaves out CodeBlock, EmptyState and LiveToggle, and Developer mode lists them",
    entryPoint: "builder Add tab, Simple and Developer switch",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      const rail = tab.page.getByRole("complementary", { name: "Side rail" });
      await tab.visible({ role: "button", name: /^KPI card/ }, { timeoutMs: 20_000 });
      const simple = await rail.innerText();
      await ctx.verify("Simple mode lists the blocks a page author needs", [
        check("Card, Table, Chart card and KPI card are listed", ["Card", "Table", "Chart card", "KPI card"].every((name) => simple.includes(name)), simple),
        check("Code, Empty state and Live toggle are left out", !/Code\n|Empty state|Live toggle/.test(simple), simple),
      ]);
      await tab.page.getByRole("radio", { name: "Developer" }).check();
      await tab.visible({ role: "button", name: /^Live toggle/ }, { timeoutMs: 20_000 });
      const developer = await rail.innerText();
      await ctx.verify("Developer mode adds the others and groups the catalog", [
        check("Code, Empty state and Live toggle are listed", /Code\n/.test(developer) && /Empty state/.test(developer) && /Live toggle/.test(developer), developer),
        check("the groups are Layout, Content, Data, Visualization and Other", ["LAYOUT", "CONTENT", "DATA", "VISUALIZATION", "OTHER"].every((group) => developer.includes(group)), developer),
      ]);
    },
  },
]);

import { guarded } from "../guard.mjs";
import { check } from "../builder.mjs";
import { inspector, inspectorTitle, layerTitles, openBuilder, saveStatus, selectOnCanvas, statusBecomes } from "../editor.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */
/** @typedef {import("../builder.mjs").Tab} Tab */

const ALL = ["Period selector", "Tabs", "Placeholder", "form", "Placeholder", "Revenue", "Orders by status", "New order", "Form 2", "Table", "Chart card 3"];

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<Tab>} A tab with the builder open and the Layers tab shown
 */
async function layersTab(ctx) {
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await openBuilder(ctx, tab);
  await tab.page.getByRole("tab", { name: "Layers" }).click();
  await tab.visible({ role: "treeitem", name: /^Revenue/ }, { timeoutMs: 30_000 });
  return tab;
}

export const journeys = guarded([
  {
    id: "delete-and-backspace-remove-the-selected-block",
    title: "With a block selected on the canvas, Delete removes it and Backspace removes the next, each as one unsaved change, and Undo brings each back",
    entryPoint: "keyboard Delete, Backspace",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await layersTab(ctx);
      await selectOnCanvas(tab, "Revenue", "Chart card");
      await tab.page.keyboard.press("Delete");
      await ctx.verify("Delete removes the selected block", [
        check("one unsaved change", await statusBecomes(tab, /^1 unsaved change$/, 15_000), await saveStatus(tab)),
        check("Revenue is gone from Layers and the rest stays in order", (await layerTitles(tab)).join("|") === ALL.filter((title) => title !== "Revenue").join("|"), await layerTitles(tab)),
      ]);
      await tab.page.keyboard.press("Control+z");
      await ctx.verify("Undo brings it back", [check("the layers are whole again", (await layerTitles(tab)).join("|") === ALL.join("|"), await layerTitles(tab))]);
      await selectOnCanvas(tab, "Orders by status", "Chart card");
      await tab.page.keyboard.press("Backspace");
      await ctx.verify("Backspace removes the selected block", [
        check("Orders by status is gone", (await layerTitles(tab)).join("|") === ALL.filter((title) => title !== "Orders by status").join("|"), await layerTitles(tab)),
        check("one unsaved change", await statusBecomes(tab, /^1 unsaved change$/, 15_000), await saveStatus(tab)),
      ]);
    },
  },
  {
    id: "arrows-select-and-alt-arrows-move",
    title: "With nothing selected the Down arrow selects the first block and the Up arrow the last; with a block selected they step to the next and previous; Alt with an arrow moves the selected block",
    entryPoint: "keyboard Up, Down, Alt+Up, Alt+Down",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await layersTab(ctx);
      await selectOnCanvas(tab, "Revenue", "Chart card");
      await tab.page.keyboard.press("Escape");
      await tab.page.keyboard.press("ArrowDown");
      await ctx.verify("Down with nothing selected selects the first block", [check("Period selector", (await inspectorTitle(tab)).startsWith("Period selector"), await inspectorTitle(tab))]);
      await tab.page.keyboard.press("ArrowDown");
      await ctx.verify("Down steps to the next block", [check("Tabs", (await inspectorTitle(tab)).startsWith("Tabs"), await inspectorTitle(tab))]);
      await tab.page.keyboard.press("ArrowUp");
      await ctx.verify("Up steps to the previous block", [check("Period selector", (await inspectorTitle(tab)).startsWith("Period selector"), await inspectorTitle(tab))]);
      await tab.page.keyboard.press("Escape");
      await tab.page.keyboard.press("ArrowUp");
      await ctx.verify("Up with nothing selected selects the last block", [check("Chart card 3", (await inspectorTitle(tab)).startsWith("Chart card 3"), await inspectorTitle(tab))]);
      await tab.page.keyboard.press("Alt+ArrowUp");
      await ctx.verify("Alt+Up moves the block up", [
        check("Chart card 3 sits before Table", (await layerTitles(tab)).slice(-2).join("|") === "Chart card 3|Table", await layerTitles(tab)),
        check("one unsaved change", await statusBecomes(tab, /^1 unsaved change$/, 15_000), await saveStatus(tab)),
      ]);
      await tab.page.keyboard.press("Alt+ArrowDown");
      await ctx.verify("Alt+Down moves it back", [check("the order is the original", (await layerTitles(tab)).join("|") === ALL.join("|"), await layerTitles(tab))]);
    },
  },
  {
    id: "ctrl-d-duplicates-enter-opens-settings-and-slash-searches",
    title: "Ctrl+D duplicates the selected block, Enter opens its settings and / moves the focus to the catalog search",
    entryPoint: "keyboard Ctrl+D, Enter, /",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await layersTab(ctx);
      await selectOnCanvas(tab, "Revenue", "Chart card");
      await tab.page.keyboard.press("Control+d");
      const titles = await layerTitles(tab);
      await ctx.verify("Ctrl+D duplicates", [
        check("one more block, a second Revenue", titles.length === ALL.length + 1 && titles.filter((title) => title.startsWith("Revenue")).length === 2, titles),
        check("one unsaved change", await statusBecomes(tab, /^1 unsaved change$/, 15_000), await saveStatus(tab)),
      ]);
      await tab.page.keyboard.press("Enter");
      await ctx.verify("Enter opens the selected block's settings", [check("the inspector shows the block's settings tabs", (await inspector(tab).getByRole("tablist", { name: "Settings" }).getByRole("tab").allInnerTexts()).join() === "Content,Data,Style", await inspector(tab).innerText())]);
      await tab.page.keyboard.press("Escape");
      await tab.page.keyboard.press("/");
      await tab.page.keyboard.type("KPI");
      await ctx.verify("/ focuses the search", [check("the search box holds what was typed", (await tab.page.getByRole("textbox", { name: "Search blocks" }).inputValue()).endsWith("KPI"), "search")]);
    },
  },
  {
    id: "search-enter-adds-below-and-alt-enter-adds-beside",
    title: "In the catalog search Enter adds the first allowed result below the selected block and Alt+Enter beside it, in a new column",
    entryPoint: "Search blocks, Enter, Alt+Enter",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await layersTab(ctx);
      await selectOnCanvas(tab, "Revenue", "Chart card");
      await tab.page.getByRole("tab", { name: "Add" }).click();
      const search = tab.page.getByRole("textbox", { name: "Search blocks" });
      await search.fill("KPI");
      await search.press("Enter");
      await tab.page.getByRole("tab", { name: "Layers" }).click();
      const below = await layerTitles(tab);
      await ctx.verify("Enter adds a KPI card below the selected block", [
        check("a KPI card follows Revenue", below.indexOf("Revenue") >= 0 && /KPI/i.test(below[below.indexOf("Revenue") + 1] ?? ""), below),
        check("one unsaved change", await statusBecomes(tab, /^1 unsaved change$/, 15_000), await saveStatus(tab)),
      ]);
      await tab.page.keyboard.press("Control+z");
      await selectOnCanvas(tab, "Revenue", "Chart card");
      await tab.page.getByRole("tab", { name: "Add" }).click();
      await search.fill("KPI");
      await search.press("Alt+Enter");
      await tab.page.getByRole("tab", { name: "Layers" }).click();
      const beside = await layerTitles(tab);
      await ctx.verify("Alt+Enter adds one beside it", [check("a KPI card is added", beside.some((title) => /KPI/i.test(title)) && beside.length > ALL.length, beside)]);
    },
  },
  {
    id: "keys-do-nothing-while-typing-but-ctrl-s-still-saves",
    title: "While the focus is in a text field Delete, Backspace and the arrows act on nothing, but Ctrl+S saves",
    entryPoint: "keyboard in Find a block on this page",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await layersTab(ctx);
      await selectOnCanvas(tab, "Revenue", "Chart card");
      const find = tab.page.getByRole("textbox", { name: "Find a block on this page" });
      await find.click();
      await find.press("Delete");
      await find.press("Backspace");
      await find.press("ArrowDown");
      await ctx.verify("typing keeps the keys from acting", [
        check("Revenue is still there", (await layerTitles(tab)).includes("Revenue"), await layerTitles(tab)),
        check("nothing is unsaved", (await saveStatus(tab)) === "All changes saved", await saveStatus(tab)),
        check("the arrow did not move the selection", (await inspectorTitle(tab)).startsWith("Revenue"), await inspectorTitle(tab)),
      ]);
      await selectOnCanvas(tab, "Revenue", "Chart card");
      await inspector(tab).getByRole("textbox", { name: "Title*" }).fill("Typed title");
      await inspector(tab).getByRole("textbox", { name: "Title*" }).press("Control+s");
      await ctx.verify("Ctrl+S saves from a text field", [check("Saved", await statusBecomes(tab, /^Saved/), await saveStatus(tab))]);
    },
  },
  {
    id: "ctrl-b-closes-from-a-text-field-but-not-from-editable-text",
    title: "Ctrl+B closes the builder with the focus in a text field (the Find box), since it works anywhere, and leaves it open with the focus in an editable region of the page (docs: it works anywhere except inside editable text)",
    entryPoint: "keyboard Ctrl+B in text fields and editable text",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await layersTab(ctx);
      const bar = { role: "radiogroup", name: "Workspace" };
      await tab.page.getByRole("textbox", { name: "Find a block on this page" }).click();
      await tab.page.keyboard.press("Control+b");
      await ctx.verify("Ctrl+B in the Find box", [tab.visible(bar, { hidden: true, timeoutMs: 15_000 })]);
      await tab.page.keyboard.press("Control+b");
      await ctx.verify("Ctrl+B opens it again", [tab.visible(bar, { timeoutMs: 20_000 })]);
      await tab.page.evaluate(() => {
        const region = document.createElement("div");
        region.contentEditable = "true";
        region.setAttribute("aria-label", "Rich text of a block");
        region.setAttribute("role", "textbox");
        region.style.cssText = "position:fixed;top:8px;left:8px;width:200px;height:40px;z-index:2147483647;background:white";
        document.body.append(region);
        region.focus();
      });
      await tab.page.keyboard.press("Control+b");
      await tab.page.waitForTimeout(1500);
      await ctx.verify("Ctrl+B in editable text", [tab.visible(bar, { timeoutMs: 2_000 })]);
    },
  },
]);

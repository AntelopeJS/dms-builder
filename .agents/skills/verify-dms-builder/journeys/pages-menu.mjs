import { guarded } from "../guard.mjs";
import { check, list, operation, projectHas, rebuild, text } from "../builder.mjs";
import { inspector, openBuilder, selectBlock } from "../editor.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */
/** @typedef {import("../builder.mjs").Tab} Tab */

/**
 * @param {Ctx} ctx The journey
 * @returns {Promise<Tab>} A tab with the builder open on the Pages tab
 */
async function pagesTab(ctx) {
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await openBuilder(ctx, tab);
  await tab.page.getByRole("tab", { name: "Pages" }).click();
  return tab;
}

export const journeys = guarded([
  {
    id: "new-page-writes-the-page-at-once-from-a-layout",
    title: "New page asks for a title, follows it with the address, refuses an address another page answers at, and Create page writes the page file at once for the chosen starting layout",
    entryPoint: "builder Pages tab, New page",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await pagesTab(ctx);
      await tab.page.getByRole("button", { name: "New page", exact: true }).click();
      const dialog = tab.page.getByRole("dialog", { name: "New page" });
      const create = dialog.getByRole("button", { name: "Create page" });
      await ctx.verify("the form starts empty and disabled", [
        check("Create page is disabled without a title", await create.isDisabled(), "button"),
        check("the layouts are Blank, Dashboard, List and Form, Blank first", (await dialog.getByRole("radio").allInnerTexts()).join() === "Blank,Dashboard,List,Form" && (await dialog.getByRole("radio", { name: "Blank" }).isChecked()), "radios"),
      ]);
      await dialog.getByRole("textbox", { name: "Title" }).fill("Weekly sales");
      await ctx.verify("the address follows the title", [check("/shop/weekly-sales", (await dialog.innerText()).includes("/shop/weekly-sales"), await dialog.innerText())]);
      await dialog.getByRole("textbox", { name: "Title" }).fill("Board");
      await ctx.verify("an address another page answers at is refused", [
        check("the form says so", /already|taken|exists/i.test(await dialog.innerText()), await dialog.innerText()),
        check("Create page stays disabled", await create.isDisabled(), "button"),
      ]);
      await dialog.getByRole("textbox", { name: "Title" }).fill("Weekly sales");
      await dialog.getByRole("radio", { name: "Dashboard" }).check();
      await create.click();
      await tab.page.waitForTimeout(3000);
      const listed = await operation(ctx, "list", "ListPages");
      const entry = list(listed.raw).find((row) => text(row, "ref") === "/shop/weekly-sales");
      await ctx.verify("the page is written at once, without Save", [
        check("ListPages holds it with its title", text(entry, "displayName") === "Weekly sales", entry),
        check("its file exists in the project", projectHas(ctx, "src/weekly-sales.ts") || text(entry, "filepath") !== "", entry),
      ]);
      const structure = await operation(ctx, "read", "GetPageStructure", "/shop/weekly-sales");
      await ctx.verify("the starting layout is not written to the file", [
        check("the file has no blocks yet", list(structure.data, "blocks").length === 0, list(structure.data, "blocks").map((block) => text(block, "type"))),
      ]);
    },
  },
  {
    id: "the-delete-confirmation-names-what-goes-with-the-page",
    title: "Deleting a page that has blocks, a data source, a page linking to it and an unsaved change on it asks with the exact counts, the names of the linking pages and the unsaved change",
    entryPoint: "builder Pages tab, Delete <page>",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "the target page", "CreatePage", { name: "target", displayName: "Target", category: "pages.shop" });
      const filled = await operation(ctx, "two blocks and a query", "SetPageBlocks", "/shop/target", {
        blocks: [{ name: "k1", type: "KpiCard", config: { title: "K1" } }, { name: "k2", type: "KpiCard", config: { title: "K2" } }],
        queries: [{ name: "cnt", resource: "order", template: "count" }],
      });
      await operation(ctx, "the linking page", "CreatePage", { name: "linker", displayName: "Linker", category: "pages.shop" });
      const linked = await operation(ctx, "a card that links to the target", "AddBlock", { page: "/shop/linker", name: "go", type: "NavCardGrid", config: { title: "Go", items: [{ title: "To target", to: "/shop/target", icon: "i-ph-x" }] } });
      await ctx.verify("the seed", [check("blocks, query and link are written", filled.ok && linked.ok, [filled.raw, linked.raw])], { critical: true });
      await ctx.verify("the project is compiled so the running app knows the pages", [await rebuild(ctx)], { critical: true });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab, "/shop/target");
      await tab.page.getByRole("tab", { name: "Layers" }).click();
      await selectBlock(tab, "K1");
      await inspector(tab).getByRole("textbox", { name: "Title*" }).fill("K1 edited");
      await tab.page.getByRole("tab", { name: "Pages" }).click();
      await tab.page.getByRole("button", { name: "Delete Target" }).click();
      await tab.visible({ role: "button", name: "Delete the page", exact: true }, { timeoutMs: 30_000 });
      const dialog = (await tab.page.getByRole("dialog", { name: "Delete Target?" }).innerText()).replace(/\s+/g, " ");
      await ctx.verify("the confirmation says exactly what leaves", [
        check("its 2 blocks and 1 data source go with it", dialog.includes("Its 2 blocks and 1 data source go with it."), dialog),
        check("Linker still links to it", dialog.includes("Linker still links to it: those links will lead nowhere."), dialog),
        check("its unsaved changes go with it", dialog.includes("Its unsaved changes go with it."), dialog),
        check("the builder cannot undo this", dialog.includes("The builder cannot undo this."), dialog),
      ]);
      await tab.page.getByRole("button", { name: "Keep it", exact: true }).click();
    },
  },
  {
    id: "rename-and-the-arrows-change-the-menu-at-once",
    title: "Rename changes a category's title at once, the up and down arrows reorder categories at once, an empty category reads empty, and a category shows how many pages it holds",
    entryPoint: "builder Pages tab, Rename, Move up the menu, Move down the menu",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "first", "CreateCategory", { name: "alpha", displayName: "Alpha", parent: "pages", order: 1 });
      await operation(ctx, "second", "CreateCategory", { name: "beta", displayName: "Beta", parent: "pages", order: 2 });
      await ctx.verify("the project is compiled so the running app knows the categories", [await rebuild(ctx)], { critical: true });
      const tab = await pagesTab(ctx);
      const tree = (await tab.page.getByRole("tree", { name: "Pages" }).innerText()).replace(/\s+/g, " ");
      await ctx.verify("the labels of the tree", [
        check("an empty category reads empty", /Alpha empty/.test(tree) && /Beta empty/.test(tree), tree),
        check("a category with pages shows their count", /Shop 1/.test(tree), tree),
      ]);
      await tab.page.getByRole("button", { name: "Rename Alpha", exact: true }).click();
      const field = tab.page.getByRole("textbox", { name: "Category name" });
      await field.fill("Alpha two");
      await field.press("Enter");
      await tab.page.waitForTimeout(2500);
      const renamed = await operation(ctx, "list", "ListCategories");
      await ctx.verify("Rename is written at once", [check("Alpha two", list(renamed.raw).some((row) => text(row, "ref") === "pages.alpha" && text(row, "displayName") === "Alpha two"), renamed.raw)]);
      const orders = async () => {
        const rows = list((await operation(ctx, "list", "ListCategories")).raw);
        const at = (/** @type {string} */ ref) => Number(rows.find((row) => text(row, "ref") === ref)?.order);
        return { alpha: at("pages.alpha"), beta: at("pages.beta"), rows };
      };
      const settle = async (/** @type {(order: { alpha: number, beta: number }) => boolean} */ done) => {
        let last = await orders();
        for (let poll = 0; poll < 10 && !done(last); poll += 1) {
          await tab.page.waitForTimeout(500);
          last = await orders();
        }
        return last;
      };
      const treeReads = async (/** @type {RegExp} */ order) => {
        for (let poll = 0; poll < 10; poll += 1) {
          if (order.test(await tab.page.getByRole("tree", { name: "Pages" }).innerText())) return true;
          await tab.page.waitForTimeout(500);
        }
        return false;
      };
      await tab.page.getByRole("button", { name: "Move Beta up the menu", exact: true }).click();
      const up = await settle((order) => order.beta < order.alpha);
      await ctx.verify("the up arrow puts Beta before Alpha two, written at once", [check("Beta sorts before Alpha two", up.beta < up.alpha, up.rows), check("the tree lists Beta first", await treeReads(/Beta[\s\S]*Alpha two/), "tree")]);
      await tab.enabled({ role: "button", name: "Move Beta down the menu", exact: true }, { timeoutMs: 15_000 });
      await tab.page.getByRole("button", { name: "Move Beta down the menu", exact: true }).click();
      const down = await settle((order) => order.beta > order.alpha);
      await ctx.verify("the down arrow puts Beta after Alpha two again", [check("Beta sorts after Alpha two", down.beta > down.alpha, down.rows)]);
    },
  },
  {
    id: "categories-and-pages-are-managed-from-the-menu",
    title: "New category writes a category at once, Rename changes its title, Delete the empty category appears only on an empty category, and deleting a page asks first, counts what goes with it and writes at once",
    entryPoint: "builder Pages tab",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "an empty category", "CreateCategory", { name: "empty", displayName: "Empty", parent: "pages" });
      await operation(ctx, "a page to delete", "CreatePage", { name: "scrap", displayName: "Scrap", category: "pages.shop" });
      await ctx.verify("the project is compiled so the running app knows the new category and page", [await rebuild(ctx)], { critical: true });
      const tab = await pagesTab(ctx);
      await tab.page.getByRole("button", { name: "New category", exact: true }).click();
      const dialog = tab.page.getByRole("dialog").first();
      await dialog.getByRole("textbox", { name: "Title" }).fill("Reports");
      await dialog.getByRole("button", { name: "Create category" }).click();
      await tab.page.waitForTimeout(2500);
      const categories = await operation(ctx, "list", "ListCategories");
      await ctx.verify("the category is written at once", [check("Reports exists under pages", list(categories.raw).some((row) => text(row, "displayName") === "Reports" && text(row, "parent") === "pages"), categories.raw)]);
      await ctx.verify("only an empty category offers its deletion", [
        tab.visible({ role: "button", name: "Delete Empty", exact: true }, { timeoutMs: 20_000 }),
        check("and Delete Shop does not show for the category that holds pages", await tab.page.getByRole("button", { name: "Delete Shop", exact: true }).count() === 0, "shop"),
      ]);
      await tab.page.getByRole("button", { name: "Delete Scrap" }).click();
      await tab.shows(/cannot undo this/i, { timeoutMs: 20_000 });
      const body = await tab.page.locator("body").innerText();
      await ctx.verify("the confirmation says what leaves with the page", [
        tab.visible({ role: "button", name: "Delete the page", exact: true }),
        tab.visible({ role: "button", name: "Keep it", exact: true }),
        check("it names the page and counts its blocks", /Delete Scrap\?/i.test(body) && /Its 0 blocks go with it/i.test(body), body.slice(0, 200)),
        check("it says the builder cannot undo it", /cannot undo this/i.test(body), body.slice(0, 200)),
      ]);
      await tab.page.getByRole("button", { name: "Keep it", exact: true }).click();
      const kept = await operation(ctx, "list", "ListPages");
      await ctx.verify("Keep it deletes nothing", [check("Scrap is still listed", list(kept.raw).some((row) => text(row, "ref") === "/shop/scrap"), kept.raw)]);
      await tab.page.getByRole("button", { name: "Delete Scrap" }).click();
      await tab.page.getByRole("button", { name: "Delete the page", exact: true }).click();
      await tab.page.waitForTimeout(3000);
      const gone = await operation(ctx, "list", "ListPages");
      await ctx.verify("Delete the page writes at once", [check("Scrap is gone and its file with it", !list(gone.raw).some((row) => text(row, "ref") === "/shop/scrap") && !projectHas(ctx, "src/scrap.ts"), gone.raw)]);
    },
  },
]);

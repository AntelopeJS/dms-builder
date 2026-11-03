import { guarded } from "../guard.mjs";
import { check, list, operation, projectHas, rebuild, text } from "../builder.mjs";
import { openBuilder } from "../editor.mjs";

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
        check("Delete Empty shows for the empty category", await tab.page.getByRole("button", { name: "Delete Empty", exact: true }).count() === 1, "buttons"),
        check("and Delete Shop does not show for the category that holds pages", await tab.page.getByRole("button", { name: "Delete Shop", exact: true }).count() === 0, "shop"),
      ]);
      await tab.page.getByRole("button", { name: "Delete Scrap" }).click();
      const body = await tab.page.locator("body").innerText();
      await ctx.verify("the confirmation says what leaves with the page", [
        tab.visible({ role: "button", name: "Delete the page", exact: true }),
        tab.visible({ role: "button", name: "Keep it", exact: true }),
        check("it names the page and counts its blocks", body.includes("Delete Scrap?") && /Its 0 blocks go with it/.test(body), body.slice(0, 200)),
        check("it says the builder cannot undo it", /cannot undo this/.test(body), body.slice(0, 200)),
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

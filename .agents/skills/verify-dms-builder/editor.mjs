import { BOARD, check } from "./builder.mjs";

/** @typedef {import("./builder.mjs").Ctx} Ctx */
/** @typedef {import("./builder.mjs").Tab} Tab */

const OPEN_BUTTON = { name: "Builder — edit this page" };
const SAVE_STATUS = /unsaved change|All changes saved|^Saved|Checking & saving|to fix|Save failed/;

/**
 * Clicks a control until what it opens shows: every dashboard page renders on the server and hydrates after `load`,
 * and a click that lands first does nothing.
 *
 * @param {Tab} tab The tab
 * @param {import("playwright-core").Locator} button What to click
 * @param {() => Promise<boolean>} opened Whether the click had its effect
 * @returns {Promise<boolean>} Whether it opened
 */
export async function clickUntil(tab, button, opened) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await button.click({ timeout: 10_000 }).catch(() => undefined);
    for (let poll = 0; poll < 6; poll += 1) {
      if (await opened()) return true;
      await tab.page.waitForTimeout(500);
    }
  }
  return false;
}

/**
 * Opens a page and turns it into the builder's canvas with the hammer button.
 *
 * @param {Ctx} ctx The journey
 * @param {Tab} tab The signed-in tab
 * @param {string} [path] The page's address
 * @returns {Promise<boolean>} Whether the editor bar showed
 */
export async function openBuilder(ctx, tab, path = BOARD) {
  await tab.goto(path);
  const workspace = tab.page.getByRole("radiogroup", { name: "Workspace" });
  const opened = await clickUntil(tab, tab.page.getByRole("button", OPEN_BUTTON), () => workspace.isVisible());
  await ctx.verify(`the builder opens on ${path}`, [check("the editor bar shows its workspaces", opened, tab.page.url())], { critical: true });
  return opened;
}

/**
 * The text of the save status in the editor bar.
 *
 * @param {Tab} tab The tab
 * @returns {Promise<string>} For example `1 unsaved change` or `Saved · 15:43`
 */
export async function saveStatus(tab) {
  return (await tab.page.getByRole("button", { name: SAVE_STATUS }).first().innerText({ timeout: 10_000 }).catch(() => "")).trim();
}

/**
 * Waits until the save status matches.
 *
 * @param {Tab} tab The tab
 * @param {RegExp} pattern What it should read
 * @param {number} [timeoutMs] How long to wait
 * @returns {Promise<boolean>} Whether it did
 */
export async function statusBecomes(tab, pattern, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(await saveStatus(tab))) return true;
    await tab.page.waitForTimeout(400);
  }
  return false;
}

/**
 * Selects a block by its title in the Layers tab.
 *
 * @param {Tab} tab The tab with the builder open
 * @param {string} title The block's title as Layers shows it
 */
export async function selectBlock(tab, title) {
  await tab.page.getByRole("tab", { name: "Layers" }).click();
  await tab.page.getByRole("tree", { name: "Blocks of the page" }).getByRole("button", { name: title, exact: true }).click();
}

/**
 * The inspector of the selected block.
 *
 * @param {Tab} tab The tab
 * @returns {import("playwright-core").Locator} The inspector
 */
export function inspector(tab) {
  return tab.page.getByRole("complementary", { name: "Inspector" });
}

/**
 * Selects a block by clicking it on the canvas, which leaves the focus on the page rather than on a Layers row, so
 * the keys that act on the selected block reach it.
 *
 * @param {Tab} tab The tab with the builder open
 * @param {string} title The block's title
 * @param {string} kind The block's kind as the canvas names it, for example `Chart card`
 */
export async function selectOnCanvas(tab, title, kind) {
  await tab.page.getByRole("group", { name: `${title} · ${kind}` }).first().click();
}

/**
 * The titles of the blocks the Layers tab lists, in order.
 *
 * @param {Tab} tab The tab with the builder open and the Layers tab shown
 * @returns {Promise<string[]>} The titles
 */
export async function layerTitles(tab) {
  const rows = await tab.page.getByRole("tree", { name: "Blocks of the page" }).getByRole("treeitem").allInnerTexts();
  return rows.map((row) => row.replace(/\s*Actions for[\s\S]*$/, "").trim()).slice(1);
}

/**
 * The title the inspector names, or the empty text when nothing is selected.
 *
 * @param {Tab} tab The tab
 * @returns {Promise<string>} The first line of the inspector
 */
export async function inspectorTitle(tab) {
  const text = await inspector(tab).innerText();
  return text.includes("Nothing selected") ? "" : (text.split("\n")[0] ?? "").trim();
}

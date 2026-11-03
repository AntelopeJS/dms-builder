import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guarded } from "../guard.mjs";
import { check, isRow, isText } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

const LOCALES = "packages/dms-builder/frontend-vue/i18n/locales";

/**
 * @param {Ctx} ctx The journey
 * @param {string} file The locale file
 * @returns {Record<string, unknown>} Its parsed catalog
 */
function catalog(ctx, file) {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(join(ctx.state.repo ?? ctx.state.moduleRoot, LOCALES, file), "utf8"));
  return isRow(parsed) ? parsed : {};
}

/**
 * @param {unknown} value A catalog node
 * @param {string} [prefix] The path so far
 * @returns {string[]} The dotted keys of its leaves
 */
function keysOf(value, prefix = "") {
  if (!isRow(value)) return [prefix];
  return Object.entries(value).flatMap(([key, item]) => keysOf(item, prefix === "" ? key : `${prefix}.${key}`));
}

export const journeys = guarded([
  {
    id: "english-and-french-catalogs-carry-the-same-keys-under-dms-builder",
    title: "builder-en-GB.json and builder-fr-FR.json both sit under the dms_builder namespace with the same keys, the header button label is one of them, and a message reads the same placeholders in both",
    entryPoint: "frontend-vue/i18n/locales",
    async run(/** @type {Ctx} */ ctx) {
      const en = catalog(ctx, "builder-en-GB.json");
      const fr = catalog(ctx, "builder-fr-FR.json");
      const enKeys = keysOf(en.dms_builder).sort();
      const frKeys = keysOf(fr.dms_builder).sort();
      await ctx.verify("the catalogs", [
        check("both hold only the dms_builder namespace", Object.keys(en).join() === "dms_builder" && Object.keys(fr).join() === "dms_builder", [Object.keys(en), Object.keys(fr)]),
        check("the same keys in both languages", enKeys.join("|") === frKeys.join("|"), { onlyEn: enKeys.filter((key) => !frKeys.includes(key)).slice(0, 5), onlyFr: frKeys.filter((key) => !enKeys.includes(key)).slice(0, 5) }),
        check("the header button label key exists in both", enKeys.includes("action.edit_page") && frKeys.includes("action.edit_page"), enKeys.filter((key) => key.startsWith("action")).slice(0, 5)),
        check("no message holds an @", enKeys.every((key) => !String(key).includes("@")), enKeys.length),
      ]);
      const placeholders = (/** @type {Record<string, unknown>} */ catalogue, /** @type {string} */ key) => {
        let node = /** @type {unknown} */ (catalogue.dms_builder);
        for (const part of key.split(".")) node = isRow(node) ? node[part] : undefined;
        return isText(node) ? (node.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).filter((item, index, all) => all.indexOf(item) === index).sort().join() : "";
      };
      const mismatched = enKeys.filter((key) => placeholders(en, key) !== placeholders(fr, key));
      await ctx.verify("placeholders", [check("each key has the same placeholders in English and French", mismatched.length === 0, mismatched.slice(0, 5))]);
    },
  },
]);

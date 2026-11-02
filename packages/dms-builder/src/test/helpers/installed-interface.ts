import { readFileSync } from "node:fs";

/** Whether the installed `@antelopejs/interface-dms` declares `PriceType`'s `currency` option. */
export function installedPriceTypeHasCurrency(): boolean {
  const options = require
    .resolve("@antelopejs/interface-dms/base/data-types/default/options")
    .replace(/\.js$/, ".d.ts");
  return readFileSync(options, "utf8").includes("currency");
}

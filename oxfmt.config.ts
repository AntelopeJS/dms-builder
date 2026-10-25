import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

/**
 * The Vue front end is out of scope until it migrates. The playground's
 * `page.ts` files are written back by the source editor as a single call chain,
 * so formatting them would fail after every editing session. Markdown was never
 * formatted by a tool.
 */
export default antelopeFmtPreset({
  ignorePatterns: [
    "packages/dms-builder/frontend-vue/**",
    "packages/dms-builder/playground/src/**/page.ts",
    "**/*.md",
  ],
});

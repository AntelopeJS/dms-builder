import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

export default antelopeFmtPreset({
  ignorePatterns: [
    "packages/dms-builder/frontend-vue/**",
    // What the builder writes back into the playground is not what anyone
    // types: a whole-tree save re-emits a page's layout as a single call
    // chain, and the theme editor writes the layer's app config and applier
    // in its own format, so every session driven against the playground would
    // leave the format check red. The rest of the playground is hand-written
    // and stays in scope.
    "packages/dms-builder/playground/src/**/page.ts",
    "packages/dms-builder/playground/frontend-vue/app/**",
    "**/*.md",
    ".github/ISSUE_TEMPLATE/feature-request.yml",
  ],
});

import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

export default antelopeFmtPreset({
  ignorePatterns: [
    "packages/dms-builder/frontend-vue/**",
    // The playground's pages are what the source editor writes back, not what
    // anyone types: a whole-tree save re-emits the layout as a single call
    // chain, so every session driven against the playground would leave the
    // format check red. The rest of the playground is hand-written and stays
    // in scope.
    "packages/dms-builder/playground/src/**/page.ts",
    "**/*.md",
    ".github/ISSUE_TEMPLATE/feature-request.yml",
  ],
});

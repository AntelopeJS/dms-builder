import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

export default antelopeFmtPreset({
  ignorePatterns: [
    "packages/dms-builder/frontend-vue/**",
    "**/*.md",
    ".github/ISSUE_TEMPLATE/feature-request.yml",
  ],
});

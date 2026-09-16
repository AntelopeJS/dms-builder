import { defineConfig } from "oxlint";
import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";

export default defineConfig({
  extends: [
    antelopePreset({
      // Turned on repository-wide with the import-sorting pass, so the
      // reordering lands as one reviewable change everywhere at once.
      importSorting: false,
    }),
  ],
  // Front-end sources, which oxlint cannot lint yet: they move with the
  // front-end migration.
  ignorePatterns: [
    ...ANTELOPE_IGNORE_PATTERNS,
    "packages/dms-builder/frontend-vue/**",
  ],
  overrides: [
    {
      files: ["packages/*/src/test/**/*.ts"],
      rules: {
        // A suite's body is a list of cases, not a function to be factored:
        // splitting one to satisfy a length ceiling buys nothing and costs the
        // shared fixture. The ceiling still applies to everything it tests.
        "max-lines-per-function": "off",
      },
    },
  ],
  options: {
    typeAware: true,
    // Ceiling on what oxlint still reports. Most of the drop came from the
    // preset -- 0.0.4 leaves eight anti-slop rules off -- not from repair, so
    // this is a "nothing new" gate rather than a measure of remaining debt. It
    // never goes up. Here rather than in the lint script so a direct oxlint run
    // is held to it too; `lint:fix` opts out with its own `--max-warnings`,
    // since a fix pass is not a gate.
    maxWarnings: 0,
  },
});

import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";
import { defineConfig } from "oxlint";

/** The Vue front end keeps its own ESLint setup until it migrates to oxlint. */
const FRONTEND_IGNORE = "packages/dms-builder/frontend-vue/**";

/**
 * A suite's body is a list of cases, so the function-length ceiling does not
 * apply to it. A stand-in for a database stream has to be thenable, because the
 * stream it replaces is awaited.
 */
const TEST_OVERRIDE = {
  files: ["packages/*/src/test/**/*.ts"],
  rules: {
    "max-lines-per-function": "off",
    "unicorn/no-thenable": "off",
  },
} as const;

export default defineConfig({
  extends: [antelopePreset()],
  ignorePatterns: [...ANTELOPE_IGNORE_PATTERNS, FRONTEND_IGNORE],
  overrides: [TEST_OVERRIDE],
  options: { typeAware: true },
});

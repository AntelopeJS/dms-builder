# dms-builder

## Layout

A pnpm workspace with two published packages. Each package keeps its own lockfile (`shared-workspace-lockfile=false`); one root `pnpm install` installs them all.

| Path                                | What it is                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/interface-dms-builder`    | `@antelopejs/interface-dms-builder`, the contract other modules import                   |
| `packages/dms-builder`              | `@antelopejs/dms-builder`, the module: AST engine, routes, skills, docs                  |
| `packages/dms-builder/frontend-vue` | The builder UI layer. ESLint owns it, not oxlint and oxfmt                               |
| `packages/dms-builder/playground`   | A demo project outside the workspace: `pnpm install --ignore-workspace` in its directory |

The module compiles against the interface's `dist`, so its `build` builds the interface first; `DMS_PREBUILT=1` skips that when the interface is already built. The root `typecheck` is that build: it emits both `dist` folders, which the root `test` reads. Run `pnpm build` before a standalone `pnpm test`.

The playground's `page.ts` files are written back by the builder, so oxfmt ignores them.

## Versioning

`release.yml` publishes the module and refuses to run until the version in `packages/interface-dms-builder/package.json` is on npm. Release the interface first, with `release-interface.yml`.

## Tests that `checks` does not run

`pnpm run checks` runs the node suites (`tests/*.test.cjs`) and the Vue unit and component suites. Run these when your change touches what they cover:

- `pnpm --filter @antelopejs/dms-builder test:unit`: the engine specs (mocha over `dist/test`). They write ts-morph fixtures to disk and take minutes. CI runs them on pushes to `main` only. Build first.
- `pnpm --dir packages/dms-builder/frontend-vue typecheck`: `ajs dms verify-source`, the production build of the DMS core layer with this one, then vue-tsc. CI runs it in its own job.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Formatting                                                                     | oxfmt                                     |
| Lint findings are errors; no rule warns                                        | oxlint preset                             |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                  |
| Every test asserts                                                             | `antelopejs/require-assertion`            |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`          |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`  |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test` |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`       |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)      |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                      |
| Types check                                                                    | `tsc` (pre-push)                          |
| No dead files, exports, or dependencies                                        | knip                                      |
| Managed files match the pack                                                   | `antelopejs-sync --check`                 |
| A test names the wrong implementation it catches                               | review; no tool                           |

<!-- antelopejs-guardrails:end -->

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

`pnpm run checks` runs the node suites (`tests/*.test.cjs`) and the Vue unit and component suites. Its lint step also runs `packages/dms-builder/scripts/package-contract-check.cjs` (`check:package-contract`), the manifest, dependency-range and lockfile invariants of both packages; `release` runs it too. It then runs `packages/dms-builder/scripts/frontend-source-check.cjs` (`check:frontend-source`), the frontend layer's catalog and source-text invariants: catalog namespace and parity, placeholders, no `@` in messages, every key the code reads present, no literal toast, no literal text in `Bar.vue` and `Banners.vue`, page titles drawn through `displayText`. Run these when your change touches what they cover:

- `pnpm --filter @antelopejs/dms-builder test:unit`: the engine specs (mocha over `dist/test`). They write ts-morph fixtures to disk and take minutes. CI runs them on pushes to `main` only. Build first.
- `pnpm --dir packages/dms-builder/frontend-vue typecheck`: `ajs dms verify-source`, the production build of the DMS core layer with this one, then vue-tsc. CI runs it in its own job.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

CI runs `pnpm run checks` in full on every pull request and reports what failed. The commit hook formats and lints the staged files. Locally, run only the fast check for what you touched:

- `pnpm run typecheck` after you change types or signatures.
- `pnpm exec oxlint <files>` and `pnpm exec oxfmt <files>` on the files you changed.
- One test file, not the suite. In a module that tests with `ajs module test`: `pnpm run build`, then `pnpm exec ajs module test . -f dist/<path>.test.js`.

Prove a change works with the verification skill in [`.agents/skills/verify-dms-builder/SKILL.md`](.agents/skills/verify-dms-builder/SKILL.md) before you call it done.

### Comments

Say it in code: a constraint in a type, a lint rule or a test, a public item's contract in TSDoc. Other comments are lint directives naming their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, and license or tool directives. A reason states what the code does now.

### Tests

Each test names the wrong implementation it fails on, or is deleted. Drive behaviour through the public interface. An invariant over many files is a lint rule.

### Review

No tool checks these:

- A type guard checks the nested elements and values it claims.
- A no-upward import rule rejects same-tier peers; probe it with an import.
- A finding only an evasion or a patched internal can trigger goes under Attention and never blocks.

### Suppressions

`guardrails.suppressions.json` caps lint directives, `@ts-expect-error`, `SAFETY:` comments and rules a lint config turns off. Over a cap, fix the code or remove another suppression of that kind; only the operator raises a number. After removing suppressions, run `pnpm run suppressions:update` and commit the file.

<!-- antelopejs-guardrails:end -->

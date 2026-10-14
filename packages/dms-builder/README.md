# @antelopejs/dms-builder

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

Visual and programmatic editing of an AntelopeJS DMS project's source tree. **Edit this page**
(`Ctrl` `B`) turns any DMS page into an editor; the module parses the app's own TypeScript, applies
each edit as an AST rewrite, typechecks the result in memory, and writes only if it compiles.

**Documentation:** [dms.antelopejs.com/docs/modules/builder](https://dms.antelopejs.com/docs/modules/builder)
(source in [`docs/`](./docs)). The
[`@antelopejs/interface-dms-builder` documentation](https://github.com/AntelopeJS/dms-builder/tree/main/packages/interface-dms-builder/docs)
covers the operations other modules call.

## Installation

```bash
ajs project modules add @antelopejs/dms-builder
```

The builder runs only in development (`ajs project run`) unless `api.enabled` forces it; every
route under `/api/builder` requires a tenant owner. See the
[configuration](https://dms.antelopejs.com/docs/modules/builder/configuration) and the
[HTTP API](https://dms.antelopejs.com/docs/modules/builder/extending#the-http-api).

The package ships a Claude Code skill, `skills/dms-builder`, declared in `antelopeJs.skills`.

## Frontend module

`frontend-vue/dms.frontend.ts` registers the `DmsBuilder` components and the client plugin at
priority 100, only when the backend's manifest entry carries `dmsBuilder.enabled === true`. The
published DMS frontend loader verifies the source module in a generated Inertia workspace:

```bash
pnpm --dir frontend-vue install
pnpm --dir frontend-vue typecheck
pnpm --dir frontend-vue lint
```

## Development

This package lives in the `AntelopeJS/dms-builder` pnpm workspace, next to
[`packages/interface-dms-builder`](https://github.com/AntelopeJS/dms-builder/tree/main/packages/interface-dms-builder).

```bash
pnpm build          # compile, interface first
pnpm typecheck
pnpm test
pnpm -w lint        # oxlint and oxfmt, configured at the workspace root
```

The runtime implements the interface, so it depends on it through
`>=<interface version> <0.<minor + 1>.0` (a cap below the next minor): a
breaking interface minor never reaches a runtime that does not implement it.
Inside the workspace pnpm resolves that range to the sibling package
(`link-workspace-packages`), and the published manifest keeps it. Release the
interface package first (`release-interface.yml`), then release
`@antelopejs/dms-builder` (`release.yml`) — the runtime's release workflow
refuses to run until the interface version it resolves to is on npmjs.

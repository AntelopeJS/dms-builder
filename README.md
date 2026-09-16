# dms-builder

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

Programmatic editing of an AntelopeJS DMS project's source tree, and the public
interface contract that describes it.

| Package | Directory | Description |
| --- | --- | --- |
| [`@antelopejs/dms-builder`](./packages/dms-builder) | `packages/dms-builder` | The module: the AST engine, the HTTP API and the Vue builder UI. |
| [`@antelopejs/interface-dms-builder`](./packages/interface-dms-builder) | `packages/interface-dms-builder` | The interface another module in the same process calls. |

The repository root carries tooling only: the pnpm workspace, the shared
oxlint and oxfmt configuration, and the workflows.

## Development

```bash
pnpm install
pnpm build          # the interface, then the module
pnpm typecheck
pnpm test
pnpm lint           # oxlint and oxfmt across the workspace
```

The builder UI is a nested project with its own install:

```bash
pnpm --dir packages/dms-builder/frontend-vue install
pnpm --dir packages/dms-builder/frontend-vue typecheck
pnpm --dir packages/dms-builder/frontend-vue lint
```

## Releasing

Each package releases on its own; releasing one never releases the other.

1. `release-interface.yml` publishes `@antelopejs/interface-dms-builder`.
2. `release.yml` publishes `@antelopejs/dms-builder`. It refuses to run until
   the interface version the module's `workspace:*` resolves to is on npmjs,
   since pnpm rewrites that protocol into a published range when it packs.

## Contributing

Read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) and report vulnerabilities as
described in [SECURITY.md](./SECURITY.md).

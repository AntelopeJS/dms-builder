<div align="center">

# @antelopejs/dms-builder

<a href="https://www.npmjs.com/package/@antelopejs/dms-builder"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/dms-builder?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/dms-builder?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/g4pFt6eXqu"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs/modules/builder"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

Visual and programmatic editing of an AntelopeJS DMS project's own source code.

</div>

![The builder open on a page, with the block catalog, the canvas and a chart card's settings](https://raw.githubusercontent.com/AntelopeJS/dms-builder/main/packages/dms-builder/docs/images/editor-selected.png)

## What it does

- Turns any DMS page into an editor (**Edit this page**, `Ctrl` `B`): add blocks from a catalog, arrange them, configure them and bind them to data.
- Writes each edit into the project's TypeScript as an AST rewrite, typechecks it in memory, and writes only if it compiles.
- Creates pages from a layout, arranges the menu, and generates tables with their fields and API.
- Gives a chart or a KPI its numbers from a query, without hand-writing a route.
- Exposes the same operations to other modules through [`@antelopejs/interface-dms-builder`](https://github.com/AntelopeJS/dms-builder/tree/main/packages/interface-dms-builder) and to agents through an HTTP API under `/api/builder`.

The builder runs in development only (`ajs project run`), and every route requires a tenant owner.

## Install

Run the AntelopeJS CLI from the root of a project that already loads `@antelopejs/dms`:

```bash
ajs project modules add @antelopejs/dms-builder
```

## Quick start

The builder edits the project it runs in. When the backend's working directory is not the app's source root, set `projectRoot`:

```ts
// antelope.config.ts
"dms-builder": {
  source: { type: "package", package: "@antelopejs/dms-builder", version: ">=0.4.0 <1.0.0" },
  config: {
    projectRoot: __dirname,
  },
},
```

Start the backend with `ajs project run -w`, then the frontend with `ajs dms dev`. Open any page and click **Edit this page**, or press `Ctrl` `B` (`⌘` `B` on macOS).

## Compatibility

<!-- antelopejs-docs-compat:start -->

| Package                                  | Supported         | Tested with |
| ---------------------------------------- | ----------------- | ----------- |
| `@antelopejs/interface-api`              | `>=0.0.15 <1.0.0` | —           |
| `@antelopejs/interface-core`             | `>=0.2.4 <1.0.0`  | —           |
| `@antelopejs/interface-database`         | `>=0.1.11 <1.0.0` | —           |
| `@antelopejs/interface-database-catalog` | `>=0.0.3 <1.0.0`  | —           |
| `@antelopejs/interface-dms`              | `>=0.10.0 <1.0.0` | —           |
| `@antelopejs/interface-dms-builder`      | `>=0.2.2 <0.3.0`  | —           |

<!-- antelopejs-docs-compat:end -->

| Package | Version |
| --- | --- |
| `@antelopejs/dms` | `>=0.13.1 <1.0.0` |
| `@antelopejs/interface-dms` | `>=0.9.0 <1.0.0` |
| `@antelopejs/dms-frontend` (renderer) | `>=0.9.2 <0.10.0` |
| `@antelopejs/interface-dms-builder` | `>=0.2.0 <0.3.0` |
| API provider | `@antelopejs/api`, for the HTTP routes |

## Documentation

- [Introduction](https://dms.antelopejs.com/docs/modules/builder/introduction)
- [Installation](https://dms.antelopejs.com/docs/modules/builder/installation)
- [Configuration](https://dms.antelopejs.com/docs/modules/builder/configuration)
- [Usage](https://dms.antelopejs.com/docs/modules/builder/usage/page-editor)
- [Extending](https://dms.antelopejs.com/docs/modules/builder/extending): the interface and the HTTP API
- [FAQ](https://dms.antelopejs.com/docs/modules/builder/faq)

The runtime guide and HTTP API documentation live in [`docs/`](./docs); the canonical consumer contract reference lives in [`packages/interface-dms-builder/docs`](../interface-dms-builder/docs/1.introduction.md). The module ships the `dms-builder` Claude Code skill in [`packages/dms-builder/skills`](https://github.com/AntelopeJS/dms-builder/tree/main/packages/dms-builder/skills), declared under `antelopeJs.skills`.

## Contributing

This package lives in the [`AntelopeJS/dms-builder`](https://github.com/AntelopeJS/dms-builder) pnpm workspace, next to `@antelopejs/interface-dms-builder`. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-builder/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-builder#contributing) for the development commands.

## License

[Apache-2.0](./LICENSE)

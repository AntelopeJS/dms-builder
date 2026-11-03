<div align="center">

# `@antelopejs/dms-builder`

<a href="https://www.npmjs.com/package/@antelopejs/dms-builder"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/dms-builder?style=for-the-badge&labelColor=000000&color=000000" data-illustration></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/dms-builder?style=for-the-badge&labelColor=000000&color=000000" data-illustration></a>
<a href="https://discord.gg/g4pFt6eXqu"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" data-illustration></a>
<a href="https://dms.antelopejs.com/docs/modules/builder"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" data-illustration></a>

**Edit the pages, tables and data sources of an AntelopeJS DMS project from the dashboard, as TypeScript that compiles.**

</div>

![The builder open on the Helio dashboard, with the block catalog, the canvas and the settings of the Revenue invoiced KPI card](./packages/dms-builder/docs/images/captures/editor-selected.webp)

## What it does

- Turns any DMS page into an editor, opened with the hammer button in the page header or `Ctrl` `B`. In the editor you add blocks from a catalog, arrange them, configure them and bind them to data.
- Writes each edit into the project's TypeScript as an AST rewrite, typechecks it in memory, and writes only if it compiles.
- Creates pages from a layout, arranges the menu, and generates tables with their fields and API.
- Gives a chart or a KPI its numbers from a query, without hand-writing a route.
- Exposes the same operations to other modules through [`@antelopejs/interface-dms-builder`](./packages/interface-dms-builder) and to agents through an HTTP API under `/api/builder`.

By default the builder runs only in development (`ajs project dev`), and every route requires a tenant owner.

## Install

Run the AntelopeJS CLI from the root of a project that already loads `@antelopejs/dms`:

```bash
ajs project modules add @antelopejs/dms-builder
```

## Quick start

The builder edits the project it runs in. If the backend's working directory is not the app's source root, set `projectRoot` in the entry that `ajs project modules add` wrote:

```ts fragment
// antelope.config.ts
"@antelopejs/dms-builder": {
  source: { /* … */ },
  config: {
    projectRoot: __dirname,
  },
},
```

Start the backend with `ajs project dev -w`, then the frontend with `ajs dms dev`. Open any page and click the hammer button in the page header, or press `Ctrl` `B` (`⌘` `B` on macOS).

## Compatibility

The [compatibility table of the module README](packages/dms-builder/README.md#compatibility) lists the interface ranges the module supports. The module needs a DMS backend that implements the `@antelopejs/interface-dms` range in that table. Its frontend needs a `@antelopejs/dms-frontend` renderer in the range of `engines["@antelopejs/dms-frontend"]` in `packages/dms-builder/frontend-vue/package.json`. The `ajs dms` CLI refuses to build the frontend with a renderer outside that range.

The HTTP routes need an API provider, such as `@antelopejs/api`.

## Packages

| Package | Directory | Role |
| --- | --- | --- |
| [`@antelopejs/dms-builder`](https://www.npmjs.com/package/@antelopejs/dms-builder) | [`packages/dms-builder`](./packages/dms-builder) | The module: the AST engine, the HTTP API and the builder UI. |
| [`@antelopejs/interface-dms-builder`](https://www.npmjs.com/package/@antelopejs/interface-dms-builder) | [`packages/interface-dms-builder`](./packages/interface-dms-builder) | The interface another module in the same process calls. |

## Documentation

- [Introduction](https://dms.antelopejs.com/docs/modules/builder/introduction)
- [Installation](https://dms.antelopejs.com/docs/modules/builder/installation)
- [Configuration](https://dms.antelopejs.com/docs/modules/builder/configuration)
- [Usage](https://dms.antelopejs.com/docs/modules/builder/usage/page-editor)
- [Extending](https://dms.antelopejs.com/docs/modules/builder/extending): the interface and the HTTP API
- [FAQ](https://dms.antelopejs.com/docs/modules/builder/faq)

The guide's sources live in [`packages/dms-builder/docs`](./packages/dms-builder/docs). The interface reference lives in [`packages/interface-dms-builder/docs`](./packages/interface-dms-builder/docs). The module ships the `dms-builder` Claude Code skill in [`packages/dms-builder/skills`](./packages/dms-builder/skills), declared under `antelopeJs.skills`.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. One root `pnpm install` installs the shared tooling, both packages and the builder UI (`frontend-vue`). Workspace packages keep separate lockfiles to preserve their dependency resolutions. The playground remains independent.

```bash
pnpm install
pnpm build          # the interface, then the module
pnpm lint
pnpm typecheck
pnpm test
```

The playground (`packages/dms-builder/playground`) loads the builder with a demo `orders` table and a **Board** page that holds a chart to configure. From that directory, run `pnpm install --ignore-workspace`, then `pnpm dev` and `pnpm frontend:dev`.

<details>
<summary>Repository notes</summary>

- The backend registers the builder's frontend module at priority 100, and only when the builder is on. `frontend-vue/dms.frontend.ts` registers the `DmsBuilder` components and the client plugin only when the backend's manifest entry carries `dmsBuilder.enabled === true`. Check that layer with `pnpm --dir packages/dms-builder/frontend-vue typecheck` and `lint`.
- The module implements the interface, so its dependency range on the interface is `>=<interface version> <0.<minor + 1>.0`. A breaking interface minor never reaches a module that does not implement it. Inside the workspace, pnpm resolves that range to the sibling package.
- Each package releases on its own. `release-interface.yml` publishes `@antelopejs/interface-dms-builder`. `release.yml` then publishes `@antelopejs/dms-builder`, and refuses to run until the interface version in `packages/interface-dms-builder/package.json` is on npm.

</details>

## License

[Apache-2.0](./LICENSE)

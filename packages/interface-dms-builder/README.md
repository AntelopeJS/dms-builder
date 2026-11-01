<div align="center">

# @antelopejs/interface-dms-builder

<a href="https://www.npmjs.com/package/@antelopejs/interface-dms-builder"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-dms-builder?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-dms-builder?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/g4pFt6eXqu"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs/modules/builder/extending"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

The AntelopeJS interface to edit a DMS project's pages, blocks, resources and queries from code.

</div>

## What it does

- Creates and edits pages, categories and their block trees: `CreatePage`, `AddBlock`, `ConfigureBlock`, `MoveBlock`, `SetPageBlocks`…
- Generates resources (a `Table`, a `DataController` and a model) and edits their fields.
- Compiles query templates into a model method and a page route, so a card gets a number without hand-written code.
- Reports every block type and DataType the builder can write, with a schema for its options (`GetCatalog`).
- Returns every mutation as an `OpResult`: the files changed on success, a typed error otherwise.

Every operation is an `InterfaceFunction` routed to [`@antelopejs/dms-builder`](https://www.npmjs.com/package/@antelopejs/dms-builder), which parses the project, applies the edit as an AST rewrite, and writes only if the project still typechecks.

## Install

Add the interface to the module that calls the builder:

```bash
pnpm add @antelopejs/interface-dms-builder
```

## Quick start

Create a page and put a KPI card on it:

```ts
import { AddBlock, CreatePage } from "@antelopejs/interface-dms-builder";

const page = await CreatePage({
  name: "revenue",
  displayName: "Revenue",
  category: "pages",
  icon: "i-ph-chart-line",
});
if (!page.ok) {
  throw new Error(`could not create the page: ${page.error.code}`);
}

const block = await AddBlock({
  page: page.data.ref,
  name: "total",
  type: "KpiCard",
  config: { title: "Total revenue", icon: "i-ph-currency-eur" },
});
if (!block.ok) {
  throw new Error(`could not add the block: ${block.error.code}`);
}
```

## Compatibility

The interface declares this peer dependency:

<!-- antelopejs-docs-compat:start -->

| Package                      | Supported        | Tested with |
| ---------------------------- | ---------------- | ----------- |
| `@antelopejs/interface-core` | `>=0.2.4 <1.0.0` | —           |

<!-- antelopejs-docs-compat:end -->

The 0.2 interface is implemented by `@antelopejs/dms-builder` 0.4, used with DMS 0.9. These implementation versions are not peer dependencies of the interface package. The implementation runs in development only, unless its [`api.enabled`](https://dms.antelopejs.com/docs/modules/builder/configuration) option forces it.

## Documentation

- [Extending the builder](https://dms.antelopejs.com/docs/modules/builder/extending): the interface and the HTTP API
- [Interface reference](./docs/1.introduction.md): the canonical contract, shipped with this package and published at [/docs/modules/builder/reference](https://dms.antelopejs.com/docs/modules/builder/reference)
- [A chart without code](./docs/10.a-chart-without-code.md): the whole journey, from picking a measure to reopening the page

## Contributing

This package lives in the [`AntelopeJS/dms-builder`](https://github.com/AntelopeJS/dms-builder) pnpm workspace, next to the module that implements it. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms-builder/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms-builder#contributing) for the development commands. Release this package before the module that implements it.

## License

[Apache-2.0](./LICENSE)

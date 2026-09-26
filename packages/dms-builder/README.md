# @antelopejs/dms-builder

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

Programmatic editing of an AntelopeJS DMS project's source tree. The module
parses the app's own TypeScript, applies an edit as an AST rewrite, typechecks
the result in memory, and writes only if it compiles.

It exposes two surfaces:

- the **`@antelopejs/interface-dms-builder` interface**, for another module in
  the same process — see
  [the interface documentation](https://github.com/AntelopeJS/dms-builder/tree/main/packages/interface-dms-builder/docs);
- an **HTTP API** a builder UI drives, described below.

## Installation

```bash
ajs project modules add @antelopejs/dms-builder
```

The module needs the `@antelopejs/interface-api` interface connected for its
HTTP routes, alongside the interfaces the engine itself uses.

## Configuration

```json
{
  "projectRoot": "/absolute/path/to/the/app",
  "api": { "enabled": true }
}
```

| Option | Type | Description |
| --- | --- | --- |
| `projectRoot` | `string` | Absolute path to the app source root where page files live. Defaults to the process working directory. |
| `factoring` | `FactoringConfig` | Thresholds past which the emitter factors a sub-tree into a module-level const. |
| `api.enabled` | `boolean` | Forces the builder on or off. Defaults to the project's development mode. |

The builder rewrites the app's TypeScript sources, which only exist in a
development checkout, so it is available only while the project runs in
development — `ajs project run`, with or without `-w`. `ajs project start`,
which runs a build, gets no builder: no HTTP routes, and no frontend module, so
the **Edit this page** action does not exist in the dashboard either. The flag
consulted is the core's own (`GetRuntimeInfo().dev`), the same one the DMS uses
for dev reload, not `NODE_ENV`.

Set `api.enabled` to override that decision in either direction — `true` mounts
the builder on a started build for whoever wants it there on purpose, `false`
keeps it off in development. Every route additionally requires an authenticated
tenant owner, and when the builder is disabled the controller is never imported,
so every route under `/api/builder` answers `404`.

## HTTP API

All routes sit under `/api/builder` and answer with the interface's own
`OpResult` shape — `{ ok: true, data, changes }` or `{ ok: false, error }` —
so a client branches on `ok` rather than on the status code.

| Method | Path | Body / query | Operation |
| --- | --- | --- | --- |
| `GET` | `/status` | — | Whether the API is live, and the project root it edits |
| `GET` | `/catalog` | — | `GetCatalog` |
| `GET` | `/pages` | — | `ListPages` |
| `POST` | `/pages` | `CreatePageInput` | `CreatePage` |
| `GET` | `/categories` | — | `ListCategories` |
| `GET` | `/page` | `?ref=` | `GetPageStructure` |
| `DELETE` | `/page` | `?ref=` | `DeletePage` |
| `POST` | `/page/configure` | `{ page, patch, expectedVersion? }` | `ConfigurePage` |
| `POST` | `/page/preview` | `{ page, draft }` | `PreviewLayout` |
| `POST` | `/page/blocks` | `{ page, draft, expectedVersion? }` | `SetPageBlocks` |
| `GET` | `/resources` | — | `ListResources` |
| `POST` | `/resources` | `CreateResourceInput` | `CreateResource` |
| `GET` | `/resource` | `?ref=` | `GetResourceStructure` |
| `POST` | `/resource/fields` | `{ resource, field, expectedVersion? }` | `AddField` |
| `PUT` | `/resource/fields` | `{ path, patch, expectedVersion? }` | `ConfigureField` |
| `DELETE` | `/resource/fields` | `?path=` | `RemoveField` |
| `GET` | `/query-templates` | — | `ListQueryTemplates` |
| `POST` | `/queries` | `{ page, input, expectedVersion? }` | `AddQuery` |
| `PUT` | `/queries` | `{ query, patch, expectedVersion? }` | `ConfigureQuery` |
| `DELETE` | `/queries` | `?ref=` | `RemoveQuery` |
| `POST` | `/refresh` | — | `RefreshSourceIndex` |

### Editing a whole page

An editor holds a draft of the page rather than replaying edits, so it reads
the structure, edits locally, previews as often as it likes, and writes once:

```
GET  /api/builder/page?ref=/dashboard      → PageStructure (with its version)
POST /api/builder/page/preview             → the serialized layout of the draft
POST /api/builder/page/blocks              → one transaction, one typecheck
```

Passing the structure's `version` back as `expectedVersion` makes the write
conditional: the page changing underneath — another editor, an agent, a hand
edit — fails with `stale` instead of overwriting. See
[Drafts and Preview](https://github.com/AntelopeJS/dms-builder/blob/main/packages/interface-dms-builder/docs/9.drafts-and-preview.md).

## The builder UI

The module ships a Vue 3 frontend module, registered with `AddFrontendModule`
only when the builder is enabled. It adds an **Edit this page** action to the DMS header;
opening it overlays the page's content area with the builder and leaves the DMS
chrome — sidebar, header, breadcrumb — usable behind it.

- **Canvas** — the page rendered by its real components. The layout comes from
  `PreviewLayout`, so a card fetches its real data and a grid lays itself out
  exactly as it will once saved. Blocks the preview cannot build faithfully
  (a `TableView`, whose DataAPI class only the running page holds) render as a
  labelled placeholder rather than a lie. A drop is aimed at a block that is
  already there, and every block of a grid answers on all four of its sides:
  its left and right quarters place the block in the column before or after it,
  the bands across its top and bottom above or below it, and the middle of a
  container inside it. The rows and columns those readings need are the
  editor's to write — composing a grid never asks anyone to place one.
- **Library** — the catalog, grouped and searchable. Drag onto the page to place
  a block, or click to append it. Placement follows the catalog:
  `allowedChildren` refuses a block a container will not take. A type named as a
  container's *one* allowed child is left out of the palette entirely — that
  container writes it around whatever is dropped in, so it is structure rather
  than a component (`Grid` and its `GridRow`).
- **Settings** — a panel generated from the block's schema. Every option gets
  the control its declaration asks for, with its label, help text, default and
  bounds; nested objects, arrays, unions, DataTypes and nested blocks all
  render recursively. Nothing is hand-written per block type.
- **Data source** — the resource behind the selected block: its fields and
  their aspects (listed, searchable, sortable, filterable, required), plus
  resource creation. These write straight through, since they touch files the
  page only references.
- **Queries** — the `count` and `aggregate` routes the page exposes, and a form
  to add one. A card's data source picks from them.
- **Outline**, **Page** (title, description, icon, visibility) and **JSON**
  (export the draft, or paste one back).

Edits stay local until **Save**: undo/redo (`⌘Z` / `⌘⇧Z`), discard, and a
single `SetPageBlocks` write at the end. `⌘S` saves, `⌘D` duplicates, `Delete`
removes, the arrows reorder, `Escape` deselects. A page that changed on disk
while you were editing refuses the write and offers a reload rather than
overwriting.

`frontend-vue/dms.frontend.ts` registers the `DmsBuilder` components and the
client plugin at priority 100, and only when the backend's manifest entry for
this module carries `dmsBuilder.enabled === true` in its public options — the
loader nests a module's options under its `configKey`. A frontend is built once and
served later, so the module re-checks rather than trusting the Vite build mode,
which says nothing about how the backend runs. Navigation and shared state use
the host's `#dms/frontend-module` runtime.

The published DMS frontend loader verifies the source module in a generated
Inertia workspace:

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

The runtime depends on the interface through `>=<interface version> <1.0.0`;
inside the workspace pnpm resolves that range to the sibling package
(`link-workspace-packages`), and the published manifest keeps it. Release the
interface package first (`release-interface.yml`), then release
`@antelopejs/dms-builder` (`release.yml`) — the runtime's release workflow
refuses to run until the interface version it resolves to is on npmjs.

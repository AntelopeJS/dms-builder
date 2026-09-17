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
| `api.enabled` | `boolean` | Whether to mount the HTTP API. Defaults to `true` outside production. |

The builder rewrites the app's TypeScript sources, which only exist in a
development checkout, so the API refuses to mount when `NODE_ENV` is
`production` unless `api.enabled` says otherwise. Every route additionally
requires an authenticated tenant owner.

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
when the API is enabled. It adds an **Edit this page** action to the DMS header;
opening it overlays the page's content area with the builder and leaves the DMS
chrome — sidebar, header, breadcrumb — usable behind it.

- **Canvas** — the page rendered by its real components. The layout comes from
  `PreviewLayout`, so a card fetches its real data and a grid lays itself out
  exactly as it will once saved. Blocks the preview cannot build faithfully
  (a `TableView`, whose DataAPI class only the running page holds) render as a
  labelled placeholder rather than a lie.
- **Library** — the catalog, grouped and searchable. Drag onto the page to place
  a block, or click to append it. Placement follows the catalog:
  `allowedChildren` refuses a block a container will not take.
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
development-only client plugin at priority 100. Navigation and shared state use
the host's `#dms-inertia/frontend-module` runtime.

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

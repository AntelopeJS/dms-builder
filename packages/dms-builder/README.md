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

All routes sit under `/api/builder`. The operations answer with the
interface's own `OpResult` shape — `{ ok: true, data, changes }` or
`{ ok: false, error }` — so a client branches on `ok` rather than on the status
code; the reads that only describe the project (`/tables/usage`,
`/page/impact`, `/page/access`, `/permissions`) answer with their value.

| Method | Path | Body / query | Operation |
| --- | --- | --- | --- |
| `GET` | `/status` | — | Whether the API is live, and the project root it edits |
| `GET` | `/catalog` | — | `GetCatalog` |
| `GET` | `/pages` | — | `ListPages` |
| `POST` | `/pages` | `CreatePageInput` | `CreatePage` |
| `GET` | `/categories` | — | `ListCategories` |
| `GET` | `/page` | `?ref=` | `GetPageStructure` |
| `DELETE` | `/page` | `?ref=` | `DeletePage` |
| `POST` | `/page/configure` | `{ page, patch, expectedVersion? }` | `ConfigurePage` (a page or category option sent as `null` is taken out) |
| `POST` | `/page/preview` | `{ page, draft }` | `PreviewLayout` |
| `POST` | `/page/blocks` | `{ page, draft, expectedVersion? }` | `SetPageBlocks` |
| `GET` | `/page/impact` | `?ref=` | What deleting the page takes: its blocks, its data sources, the pages linking to it |
| `GET` | `/page/access` | `?ref=&permission=` | Who reaches the page and each of its blocks: how the DMS gates it, its blocks' actions and the blocks they hold, and the tenant's roles with what they hold of it (`permission`: another the draft gives the page) |
| `GET` | `/permissions` | — | The permissions the DMS registered, flat, to pick a page's access from |
| `GET` | `/resources` | — | `ListResources` |
| `POST` | `/resources` | `CreateResourceInput` | `CreateResource` |
| `GET` | `/resource` | `?ref=` | `GetResourceStructure` |
| `POST` | `/resource/fields` | `{ resource, field, expectedVersion? }` | `AddField` |
| `PUT` | `/resource/fields` | `{ path, patch, expectedVersion? }` | `ConfigureField` |
| `DELETE` | `/resource/fields` | `?path=` | `RemoveField` |
| `GET` | `/tables/usage` | — | The pages reading each table, and its rows at the request's tenant |
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
only when the builder is enabled. It adds an **Edit this page** action to the
DMS header (or `⌘B`); the builder is a mode of the page being looked at, laid
over its content area, the DMS chrome — sidebar, header, breadcrumb — still
usable behind it.

- **Bar** — the mode, the page and its address, the workspace (**Page**,
  **Tables**, **Data**), the save status (saved, *n* unsaved changes, saving,
  to fix, failed) that opens the change list, undo/redo, the canvas's zoom and
  width, Simple/Developer, **Save** and **Done**.
- **Side rail** — three tabs that stay whatever is selected: **Add** (the
  catalog, grouped and searchable by what a block is for, laid out as tiles or
  as a list saying what each block is for; drag onto the page,
  click to add where you are working, `↵`/`⌥↵` to add below or beside the
  selection), **Layers** (every block of the page as a tree, the rows and
  columns the editor wrote shown for what they hold) and **Pages** (the menu:
  pages and categories, a new page started from a layout, its address checked
  as it is typed).
- **Canvas** — the page rendered by its real components. The layout comes from
  `PreviewLayout`, so a card fetches its real data and a grid lays itself out
  exactly as it will once saved. Blocks the preview cannot build faithfully
  (a `TableView`, whose DataAPI class only the running page holds) render as a
  labelled stand-in rather than a lie. A drop is aimed at a block that is
  already there, and every block of a grid answers on all four of its sides:
  its left and right quarters place the block in the column before or after it,
  the bands across its top and bottom above or below it, and the middle of a
  container inside it; where it would land is said in words before it is let
  go. The rows and columns those readings need are the editor's to write —
  composing a grid never asks anyone to place one.
- **Inspector** — the selected block, named as the page shows it and placed in
  words (`Top list · column 2 of 3`), its settings in tabs (Content, Data,
  Style; a table adds Actions, a form Fields and After submit). Blocks with a
  panel of their own are set up in the words of whoever builds the page; the
  rest get a panel generated from their schema. It also shows the page's own
  settings, the page as JSON, and the **change list**: every unsaved edit in
  plain words, revertible one by one, then what Save will check and write,
  then what was already written straight to the project.
- **Tables** and **Data** — workspaces of their own: the tables with their
  fields, API and settings, each saying how many rows it holds and which pages
  read it; the page's data sources, read as a sentence, with who uses them and
  a preview.

Edits stay local until **Save**: undo/redo (`⌘Z` / `⌘⇧Z`) — the choices of
one data source count as one step —, discard, and a single `SetPageBlocks`
write at the end, the page's position, access and visibility included. The
draft is also kept on this device, for a week, and offered again on the next
visit. `⌘S` saves, `⌘D` duplicates, `Delete` removes, `↑`/`↓` select the block
before or after, `⌥↑`/`⌥↓` move it, `↵` opens its settings, `/` searches the
blocks — while the focus is on the page, not on a control of the panel.
`Escape` closes the block menu, then deselects; it never leaves the editor.
A page that changed on disk while you were editing refuses the write, and
offers to keep your version or to reload.

The DMS gives each block a permission of its own, named after where it sits —
the page's, then the name of every block down to it, the rows and columns the
editor writes included — and a role holds ids, not prefixes. So adding a
block, renaming it, moving it, or laying it in a row the editor wrote all hand
it a permission no role holds yet. The change list says so before Save (*Support
loses Revenue*, *No role sees Notes yet*), the inspector says who sees the
selected block and who opens the page, and **View as** in the bar shows the
draft as a role sees it, with the DMS's own role-preview veils: a block hidden
from it hatched, one whose actions it is not given marked *Read only* or
*Limited*. A table's fields and API, the menu's
order and a category are still written at once, for every page reading them;
the change list keeps a note of each, with what it reached.

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

The runtime implements the interface, so it depends on it through
`>=<interface version> <0.<minor + 1>.0` (a cap below the next minor): a
breaking interface minor never reaches a runtime that does not implement it.
Inside the workspace pnpm resolves that range to the sibling package
(`link-workspace-packages`), and the published manifest keeps it. Release the
interface package first (`release-interface.yml`), then release
`@antelopejs/dms-builder` (`release.yml`) — the runtime's release workflow
refuses to run until the interface version it resolves to is on npmjs.

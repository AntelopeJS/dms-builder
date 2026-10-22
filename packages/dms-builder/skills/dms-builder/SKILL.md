---
name: dms-builder
description: Uses the @antelopejs/dms-builder module of the AntelopeJS DMS, which edits a project's pages, tables and data sources as typechecked AST rewrites of its TypeScript sources (the "Edit this page" editor, Ctrl+B, the /api/builder HTTP API and @antelopejs/interface-dms-builder). Use when installing or configuring dms-builder (projectRoot, api.enabled), calling its interface or HTTP API from code, or when the editor or its routes are missing. For page edits through the dms-ai agent tools, use dms-builder-safe.
icon: i-lucide-hammer
category: builder
tags: [builder, pages, editor, ast, typecheck, interface]
---

# dms-builder

The builder has no store of its own: pages are `PageController` classes, blocks their static fields or `.child()` calls, tables a `Table` + `DataController` + model. Every write is staged in memory, typechecked across the project, and written only if it compiles. User docs: https://dms.antelopejs.com/docs/modules/builder (source: `docs/` of this package); interface reference: `node_modules/@antelopejs/interface-dms-builder/docs`.

## Surfaces

- **Editor**: `Ctrl` `B` on any page; Page / Tables / Data workspaces; edits stay a local draft until Save (one `SetPageBlocks` transaction). Tables, menu and categories are written at once.
- **Interface** (`@antelopejs/interface-dms-builder`): `ListPages`, `GetPageStructure`, `AddBlock`, `SetPageBlocks`, `PreviewLayout`, `CreateResource`, `AddQuery`… Mutations return `OpResult` (`{ ok, data, changes }` / `{ ok: false, error }`): branch on `ok`.
- **HTTP**: `/api/builder/*`, tenant owner only, same `OpResult`. Pass the structure's `version` as `expectedVersion` to fail with `stale` instead of overwriting.

## Config

`projectRoot` (absolute source root, default the working directory), `api.enabled` (default: the core's dev flag). `factoring` was removed in 0.3. Version 0.4+ needs `@antelopejs/dms` 0.9 (`interface-dms` 0.7) and `@antelopejs/dms-frontend` 0.6.

## Gotchas

- Off under `ajs project start`: no routes (404), no frontend module, no Edit button. `api.enabled: true` forces it on.
- Blocks are read back by shape: code that leaves the factory-call grammar becomes `opaque`, shown but not rewritten.
- The period selector and Live / Pause switch the editor places go into the page's top-level `PageToolbar`, made at the top when missing (children `period` / `live`, ids and options read from the catalog's `PageToolbar.initialChildren`, as `pageToolbar()` sets them, with no override of the editor's). A page with its own top-level selector or switch, or a toolbar the editor cannot rewrite (a `pageToolbar()` call is not factory grammar), gets the control beside it instead.
- A block's permission is named after its position: moving or renaming it drops role grants; the change list warns.
- A type error anywhere in the project blocks every write: fix it first.
- A query `AddQuery` writes is a page route served at `/dms/pages<pageRef><endpoint>` (DMS 0.9); a block's `fetchUrl` must use that address (`pageRoutePath` from `@antelopejs/interface-dms/page`).
- Page content rules (blocks backend-side, custom only for a missing block, `.meta()` on custom blocks) come from `dms-best-practices`.

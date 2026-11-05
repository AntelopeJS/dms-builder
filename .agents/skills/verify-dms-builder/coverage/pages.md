# Coverage: pages

Docs: `4.page-operations.md`, `2.addressing-and-structure.md`. Journeys: `journeys/pages.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| interface-dms-builder/docs/4.page-operations.md:69 | CreatePage writes <category-folder>/<name>/page.ts with DefaultLayout fullWidth and exports it from the barrel | create-page-writes-the-file-and-wires-the-barrel | file, options, layout, barrel export; ref joins slug and name |
| interface-dms-builder/docs/4.page-operations.md:69 | Without a barrel beside the category the page goes to src/<name>.ts; dir replaces the placement | same | src/side.ts; src/reporting/monthly/page.ts |
| interface-dms-builder/docs/4.page-operations.md:69 | name rules, duplicates, unknown category, dir outside src | same | invalid_config for uppercase, underscore, double dash; duplicate_name; not_found; unsupported |
| interface-dms-builder/docs/4.page-operations.md:31 | GetPageStructure returns meta, blocks, queries and a version, with no changes | same | empty blocks, version, empty changes, meta |
| interface-dms-builder/docs/2.addressing-and-structure.md:168 | ListPages summaries | same | displayName, category, order, icon |
| interface-dms-builder/docs/4.page-operations.md:115 | ConfigurePage patches in place; null removes a key | configure-a-page-patches-and-moves-it | displayName, order, hidden; icon removed; read back |
| interface-dms-builder/docs/4.page-operations.md:129 | A category patch moves the file and the route, with a route_changed warning | same | new ref, warning, file moved |
| interface-dms-builder/docs/4.page-operations.md:129 | Move refusals: unknown target not_found; built-in unsupported; destination name taken duplicate_name | same | not_found driven; Not driven: unsupported and duplicate_name need a built-in target and a same-named page in the target |
| interface-dms-builder/docs/4.page-operations.md:155 | DeletePage removes the class, the file and the barrel import | delete-a-page-removes-its-file-and-import | file gone, barrel export gone, neighbour untouched, listing |
| interface-dms-builder/docs/8.results-and-errors.md:183 | expectedVersion makes a write conditional; stale carries the current version | configure-a-page-patches-and-moves-it / delete-a-page-removes-its-file-and-import | stale refused and nothing written; the current version accepted |
| interface-dms-builder/docs/4.page-operations.md:48 | RefreshSourceIndex rescans after a hand edit | catalog | the cache part is driven; Not driven: the rescan cost is not observable |

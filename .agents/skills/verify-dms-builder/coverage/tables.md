# Coverage: tables

Docs: `4.usage/3.tables.md`. Journeys: `journeys/tables.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| dms-builder/docs/4.usage/3.tables.md:13 | + Table writes three files at once with one Title field | a-table-is-created-and-deleted-from-the-tables-workspace | files and one field |
| dms-builder/docs/4.usage/3.tables.md:9 | the list line and the open table show rows, route, readers and tabs | an-open-table-shows-its-rows-route-readers-and-tabs | 18 rows · served at /api/order · read by Board; Fields 3; API 8/8 |
| dms-builder/docs/4.usage/3.tables.md:23 | the API tab: each route on or off, the last cannot be switched off | the-last-served-route-cannot-be-switched-off | Update off leaves get; Read stays on |
| dms-builder/docs/4.usage/3.tables.md:34 | Delete the table is gated by the typed key | a-table-is-created-and-deleted-from-the-tables-workspace | disabled when empty or wrong; enabled with the key |
| dms-builder/docs/4.usage/3.tables.md:34 | Delete the table and its rows deletes at once | delete-the-table-removes-it-and-its-files-at-once | FAILS: dms-builder#148 |
| dms-builder/docs/4.usage/3.tables.md:19 | field flags Shown/Search/Sort/Filter/In export/Required, Add field, Remove field | - | Not driven: the field ticks are covered at the engine (resources); the tick grid is not asserted |
| dms-builder/docs/4.usage/3.tables.md:41 | refusal when another table imports it; mirrored database tables | - | Not driven: no second table imports another in the playground; no external database |

# Coverage: catalog

Docs: `3.catalog.md`. Journeys: `journeys/catalog.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| interface-dms-builder/docs/3.catalog.md:13 | GetCatalog returns blocks, dataTypes, reservedFieldNames and generatedAt | the-catalog-describes-block-types-and-data-types | all four fields; ISO time |
| interface-dms-builder/docs/3.catalog.md:35 | A block descriptor has its import, componentName, group, container, controllerArg, configOrigin | same | KpiCard, Card, Tab, TableView, PageToolbar checked |
| interface-dms-builder/docs/3.catalog.md:62 | Card has slots actions and footer; Tab names regions from items | same | slot ids; dynamicSlots optionPath, idKey, labelKey |
| interface-dms-builder/docs/3.catalog.md:89 | Controller-leading blocks carry controllerArg | same | TableView true, KpiCard not |
| interface-dms-builder/docs/3.catalog.md:155 | DataTypes by id with their import | same | string, number, date and select; every import named |
| interface-dms-builder/docs/3.catalog.md:193 | reservedFieldNames lists the names a field may not take | same | the first eight documented names; the resource refusals are in resources |
| interface-dms-builder/docs/3.catalog.md:25 | The catalog is cached; a full RefreshSourceIndex drops it, a page-scoped one does not | same | generatedAt is stable across reads and a page refresh and changes after a full refresh |
| interface-dms-builder/docs/3.catalog.md:207 | ListDataSources returns declared data sources | same | an array; Not driven: the playground declares no data source, so no entry is read |
| interface-dms-builder/docs/3.catalog.md:105 | ConfigSchema and ImportRef.targetFile shapes | - | Not driven: the schema vocabulary is read by the editor; targetFile is exercised by TableView controller emission (blocks) |

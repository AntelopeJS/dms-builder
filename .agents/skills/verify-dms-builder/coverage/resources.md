# Coverage: resources

Docs: `5.resources.md`. Journeys: `journeys/resources.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| interface-dms-builder/docs/5.resources.md:31 | CreateResource writes three files with derived names and field decorators | create-resource-writes-a-table-a-controller-and-an-index | Product, ProductModel, products, productDataAPI at /api/product; searchable; required and optional |
| interface-dms-builder/docs/5.resources.md:80 | the exported aspect writes @Exported | an-exported-field-is-written-with-its-import | created; @Exported() on the field; Exported imported; GetResourceStructure reads exported back |
| interface-dms-builder/docs/5.resources.md:208 | ListResources and GetResourceStructure | create-resource-writes-a-table-a-controller-and-an-index | summary names, order of fields, aspects, version; fieldCount counts _id |
| interface-dms-builder/docs/5.resources.md:106 | routes choose the exposed endpoints; empty or unknown routes are invalid_config | same / fields-and-routes-are-edited-in-both-generated-files | ["get","edit"] reads back; replaced by ["list","get"] |
| interface-dms-builder/docs/5.resources.md:31 | name, duplicates, reserved field names | create-resource-writes-a-table-a-controller-and-an-index | invalid_config, duplicate_name, invalid_config |
| interface-dms-builder/docs/5.resources.md:164 | AddField, ConfigureField, RemoveField | fields-and-routes-are-edited-in-both-generated-files | both files edited; version bumps; merge; indexed rewrites the table; duplicates, reserved, not_found, stale |
| interface-dms-builder/docs/5.resources.md:268 | DeleteResource removes files, folder and imports, refuses stale, leaves neighbours | delete-resource-removes-its-files-imports-and-rows | all three; keeper untouched |
| interface-dms-builder/docs/5.resources.md:268 | keepData, referential_integrity, data_not_dropped and data_kept | - | Not driven: the row deletion is not observable through the files and a relation field needs a second resource with a relation DataType |
| interface-dms-builder/docs/5.resources.md:141 | location forms (string, category, page) | - | Not driven: only the default location is driven |
| interface-dms-builder/docs/5.resources.md:31 | seeds and schema | - | Not driven: not read back |

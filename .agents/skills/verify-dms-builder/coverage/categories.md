# Coverage: categories

Docs: `4.page-operations.md`, `2.addressing-and-structure.md`. Journeys: `journeys/categories.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| interface-dms-builder/docs/4.page-operations.md:168 | CreateCategory writes <name>.category.ts and imports it from the barrel | a-category-is-written-beside-the-root-barrel | file and barrel import; ref pages.reports; nested ref joins with a dot |
| interface-dms-builder/docs/4.page-operations.md:168 | name must be lowercase letters, digits and single dashes; duplicates and unknown parents are refused | same | uppercase and double dash invalid_config; duplicate_name; unknown parent not_found |
| interface-dms-builder/docs/2.addressing-and-structure.md:168 | ListCategories summaries carry displayName, parent, icon, order | same | all four read back |
| interface-dms-builder/docs/4.page-operations.md:198 | ConfigureCategory patches in place; parent, built-in and unknown are refused | configure-and-delete-follow-the-documented-refusals | file rewritten; unsupported for parent and for pages; not_found |
| interface-dms-builder/docs/4.page-operations.md:217 | DeleteCategory refuses a category with pages or children and lists blockedBy; an empty one is deleted with its file and import | same | blockedBy holds the page and the child; the empty category is gone from disk and barrel |
| interface-dms-builder/docs/4.page-operations.md:217 | A built-in category is unsupported | same | the root pages is refused (referential_integrity answers first because it holds pages); Not driven: no empty built-in category exists in the playground |
| interface-dms-builder/docs/4.page-operations.md:168 | module option places the category in another module | - | Not driven: the playground has one module |

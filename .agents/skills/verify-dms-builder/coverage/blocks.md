# Coverage: blocks

Docs: `4.page-operations.md`, `8.results-and-errors.md`, `7.values.md`. Journeys: `journeys/blocks.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| interface-dms-builder/docs/4.page-operations.md:232 | AddBlock writes a static member or a .child() call and answers the path | add-block-writes-a-factory-call-and-refuses-what-it-cannot-write | static member; path /shop/lab#tabs/inner; slot and meta in the call |
| interface-dms-builder/docs/4.page-operations.md:232 | index places the block; an index past the end is clamped with index_clamped | same | index 0 first; 99 appended with the warning |
| interface-dms-builder/docs/4.page-operations.md:232 | duplicates, unknown type, missing parent, controller mismatches | same | duplicate_name with scope page and siblings; unsupported; not_found; invalid_config both ways |
| interface-dms-builder/docs/4.page-operations.md:232 | a controller-leading block emits the imported DataAPI class | same | TableView(orderDataAPI |
| interface-dms-builder/docs/4.page-operations.md:232 | opaque_target for an opaque parent | - | Not driven: the playground has no opaque block |
| interface-dms-builder/docs/4.page-operations.md:285 | ConfigureBlock merges, removes undefined keys, replaces on request, rewrites child meta | configure-move-and-remove-rewrite-one-block | title replaced, icon added, description removed, replace leaves only the title, colSpan written |
| interface-dms-builder/docs/4.page-operations.md:285 | meta on a top-level block is unsupported; unknown block not_found | same | both |
| interface-dms-builder/docs/4.page-operations.md:325 | MoveBlock reorders and reparents; top-level or parentless is unsupported; index clamps | same | a moves after b; unsupported twice; clamped warning; not_found |
| interface-dms-builder/docs/4.page-operations.md:348 | RemoveBlock drops static and nested blocks | same | both removed; again is not_found |
| interface-dms-builder/docs/8.results-and-errors.md:171 | typecheck_failed lists file, line and message and writes nothing | a-write-that-would-not-compile-is-rolled-back | diagnostic on schema.ts with its line; page unchanged |
| interface-dms-builder/docs/8.results-and-errors.md:64 | warnings other than index_clamped and route_changed | - | Not driven: each belongs to an operation the run cannot reach (external database, hand-edited queries) |
| interface-dms-builder/docs/7.values.md:24 | $dataType, $ref, $expr and $block encodings | set-page-blocks-writes-blocks-and-queries-in-one-transaction (drafts) | $block (a nested chart) and $dataType through the whole-page write; Not driven: $ref and $expr in AddBlock |

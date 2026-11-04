# Coverage: drafts

Docs: `9.drafts-and-preview.md`, `8.results-and-errors.md`. Journeys: `journeys/drafts.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| interface-dms-builder/docs/9.drafts-and-preview.md:31 | SetPageBlocks writes metadata, blocks and queries together and returns the new version | set-page-blocks-writes-blocks-and-queries-in-one-transaction | version changes and equals the read-back; tree, slot and meta, nested chart, query |
| interface-dms-builder/docs/9.drafts-and-preview.md:31 | blocks the draft leaves out are removed; omitted queries are kept, an empty array removes them | same | only tabs left; one query kept; none after [] |
| interface-dms-builder/docs/9.drafts-and-preview.md:91 | preserve writes a block back as it stands; changes to a preserved block are refused | preserving-every-block-changes-only-the-page-metadata | only the display name differs; another type or a config is invalid_config |
| interface-dms-builder/docs/9.drafts-and-preview.md:172 | every problem is reported at once with its JSON pointer | set-page-blocks-reports-every-problem-at-once | seven pointers; nothing written |
| interface-dms-builder/docs/9.drafts-and-preview.md:172 | stale and unknown page | same | stale with currentVersion; not_found |
| interface-dms-builder/docs/9.drafts-and-preview.md:188 | PreviewLayout serializes without writing and lists degraded blocks | preview-layout-serializes-a-draft-without-writing | title in the component; two degraded; a placeholder; nothing written |
| interface-dms-builder/docs/9.drafts-and-preview.md:31 | query_opaque and query_kept warnings | - | Not driven: they need a hand-edited query and a block reading a dropped query |

# Coverage: pages-menu

Docs: `4.usage/2.pages.md`. Journeys: `journeys/pages-menu.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| dms-builder/docs/4.usage/2.pages.md:17 | New page asks for a title, the address follows it, a taken address disables Create page | new-page-writes-the-page-at-once-from-a-layout | disabled when empty; layouts in order; /shop/weekly-sales; refused for Board |
| dms-builder/docs/4.usage/2.pages.md:17 | Create page writes at once | same | ListPages and the file; the layout is not written |
| dms-builder/docs/4.usage/2.pages.md:25 | New category writes at once; only an empty category can be deleted | categories-and-pages-are-managed-from-the-menu | Reports created; Delete Empty shows, Delete Shop does not |
| dms-builder/docs/4.usage/2.pages.md:46 | Delete the page asks, counts the blocks, offers Keep it, writes at once | same | the confirmation text; Keep it deletes nothing; Delete the page removes file and listing |
| dms-builder/docs/4.usage/2.pages.md:35 | rename, reorder and move categories; Position, Show in the menu, settings | - | Not driven: the menu arrows and the page settings fields are not asserted |

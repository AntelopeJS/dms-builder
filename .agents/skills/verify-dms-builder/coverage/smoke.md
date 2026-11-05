# Coverage: smoke

Docs: `1.introduction.md`. Journeys: `journeys/smoke.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| dms-builder/docs/1.introduction.md:11 | Selecting a card, changing its title and saving updates the page and writes the TypeScript | smoke | the bar counts one unsaved change; Saved; the card title is in page.ts; GetPageStructure reads it; the rebuilt page shows it |
| dms-builder/docs/1.introduction.md:21 | Edits are not written before Save | smoke | the source still holds the old title while the draft is open |
| dms-builder/docs/1.introduction.md:35 | The builder keeps no database of pages: it reads the sources | smoke | status projectRoot is the run copy; the other blocks are still in the file |

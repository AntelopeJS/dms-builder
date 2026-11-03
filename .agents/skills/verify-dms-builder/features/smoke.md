---
covers:
  - packages/dms-builder/src/index.ts
  - packages/dms-builder/package.json
docs:
  - packages/dms-builder/docs/1.introduction.md
---

# Smoke

The fixed journey every verdict runs, whatever the diff touches: the introduction's "What one change looks like".

## Sub-features

- `smoke`: an owner opens a page in the builder, retitles a card, saves, and the new title is in the page source, in the structure API and on the reloaded page.

## How to get to it (user POV)

- Any DMS page, the hammer button in the page header, a card, its title.

## Driving it with dms-control

```bash
dms-control journey "$RUN" smoke
```

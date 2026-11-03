---
covers:
  - packages/dms-builder/src/implementations/dms-builder/engine/page-structure.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/page-delete.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/page-category-move.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/compose-page.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/planned-page.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/ops.ts
docs:
  - packages/interface-dms-builder/docs/4.page-operations.md
  - packages/interface-dms-builder/docs/2.addressing-and-structure.md
---

# Pages

## Sub-features

- `create-page-writes-the-file-and-wires-the-barrel`: CreatePage, ListPages, GetPageStructure.
- `configure-a-page-patches-and-moves-it`: ConfigurePage and the move between categories.
- `delete-a-page-removes-its-file-and-import`: DeletePage.

## Driving it with dms-control

```bash
dms-control journey "$RUN" pages
```

---
covers:
  - packages/dms-builder/src/implementations/dms-builder/engine/page-structure.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/page-delete.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/page-category-move.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/compose-page.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/planned-page.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/ops.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/name-words.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/page-access.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/paths.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/permissions.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/scan.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/indexed-project.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/source-index.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/source-options.ts
  - packages/interface-dms-builder/src/compose.ts
  - packages/interface-dms-builder/src/operations.ts
  - packages/interface-dms-builder/src/structure.ts
docs:
  - packages/interface-dms-builder/docs/4.page-operations.md
  - packages/interface-dms-builder/docs/2.addressing-and-structure.md
---

# Pages

## Sub-features

- `create-page-writes-the-file-and-wires-the-barrel`
- `configure-a-page-patches-and-moves-it`
- `delete-a-page-removes-its-file-and-import`

## Driving it with dms-control

```bash
dms-control journey "$RUN" pages
```

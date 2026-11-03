---
covers:
  - packages/dms-builder/src/implementations/dms-builder/engine/ops-blocks.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/block-tree.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/block-target.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/chain.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/emit.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/placement.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/writable.ts
docs:
  - packages/interface-dms-builder/docs/4.page-operations.md
  - packages/interface-dms-builder/docs/8.results-and-errors.md
---

# Blocks

## Sub-features

- `add-block-writes-a-factory-call-and-refuses-what-it-cannot-write`: AddBlock.
- `configure-move-and-remove-rewrite-one-block`: ConfigureBlock, MoveBlock, RemoveBlock.
- `a-write-that-would-not-compile-is-rolled-back`: typecheck_failed.

## Driving it with dms-control

```bash
dms-control journey "$RUN" blocks
```

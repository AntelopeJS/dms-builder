---
covers:
  - packages/dms-builder/src/implementations/dms-builder/engine/ops-blocks.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/block-tree.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/block-target.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/chain.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/emit.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/placement.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/writable.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/column-display.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/column-label.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/config-literal.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/describe-value.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/display-defaults.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/expression.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/guards.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/literal-overrides.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/literals.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/relabel-columns.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/value.ts
  - packages/interface-dms-builder/src/values.ts
docs:
  - packages/interface-dms-builder/docs/4.page-operations.md
  - packages/interface-dms-builder/docs/8.results-and-errors.md
---

# Blocks

## Sub-features

- `add-block-writes-a-factory-call-and-refuses-what-it-cannot-write`
- `configure-move-and-remove-rewrite-one-block`
- `a-write-that-would-not-compile-is-rolled-back`

## Driving it with dms-control

```bash
dms-control journey "$RUN" blocks
```

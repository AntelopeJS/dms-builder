---
covers:
  - packages/dms-builder/src/implementations/dms-builder/engine/page-draft-validation.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/page-draft.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/preview.ts
  - packages/interface-dms-builder/src/drafts.ts
  - packages/interface-dms-builder/src/results.ts
docs:
  - packages/interface-dms-builder/docs/9.drafts-and-preview.md
  - packages/interface-dms-builder/docs/8.results-and-errors.md
---

# Drafts and preview

## Sub-features

- `set-page-blocks-writes-blocks-and-queries-in-one-transaction`
- `set-page-blocks-reports-every-problem-at-once`
- `preserving-every-block-changes-only-the-page-metadata`
- `preview-layout-serializes-a-draft-without-writing`

## Driving it with dms-control

```bash
dms-control journey "$RUN" drafts
```

---
covers:
  - packages/dms-builder/src/implementations/dms-builder/engine/resource-data.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/resource-emit-types.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/resource-emit.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/resource-index.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/resource-ops-delete.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/resource-ops.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/resource-schema.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/resource-structure.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/resource-summary-route.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/table-readers.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/table-view-checks.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/table-view-settings.ts
  - packages/interface-dms-builder/src/resources.ts
  - packages/interface-dms-builder/src/table-view.ts
docs:
  - packages/interface-dms-builder/docs/5.resources.md
---

# Resources

## Sub-features

- `create-resource-writes-a-table-a-controller-and-an-index`
- `an-exported-field-is-written-with-its-import`
- `fields-and-routes-are-edited-in-both-generated-files`
- `delete-resource-removes-its-files-imports-and-rows`

## Driving it with dms-control

```bash
dms-control journey "$RUN" resources
```

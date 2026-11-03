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
docs:
  - packages/interface-dms-builder/docs/5.resources.md
---

# Resources

## Sub-features

- `create-resource-writes-a-table-a-controller-and-an-index`: CreateResource, ListResources, GetResourceStructure.
- `fields-and-routes-are-edited-in-both-generated-files`: AddField, ConfigureField, RemoveField, ConfigureResource.
- `delete-resource-removes-its-files-imports-and-rows`: DeleteResource.

## Driving it with dms-control

```bash
dms-control journey "$RUN" resources
```

---
covers:
  - packages/dms-builder/src/implementations/dms-builder/engine/catalog-connection.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/catalog-inference.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/catalog.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/reserved-names.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/native-kind.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/mixed-types.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/price-currency.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/interface-capabilities.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/interface-ids.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/scalar-guards.ts
  - packages/interface-dms-builder/src/catalog.ts
  - packages/interface-dms-builder/src/addressing.ts
docs:
  - packages/interface-dms-builder/docs/3.catalog.md
---

# Catalog

## Sub-features

- `the-catalog-describes-block-types-and-data-types`: GetCatalog, RefreshSourceIndex, ListDataSources.

## Driving it with dms-control

```bash
dms-control journey "$RUN" catalog
```

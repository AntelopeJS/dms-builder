---
covers:
  - packages/dms-builder/src/routes/builder.ts
  - packages/dms-builder/src/routes/index.ts
  - packages/dms-builder/src/constants/routes.ts
  - packages/dms-builder/src/config.ts
  - packages/dms-builder/src/frontend-module.ts
  - packages/dms-builder/src/implementations/dms-builder/index.ts
docs:
  - packages/dms-builder/docs/3.configuration.md
  - packages/dms-builder/docs/5.extending.md
  - packages/dms-builder/docs/6.faq.md
---

# HTTP API and configuration

## Sub-features

- `every-route-needs-a-tenant-owner`: authentication on every route.
- `lists-answer-their-value-and-mutations-answer-an-op-result`: the answer shapes.
- `the-builder-follows-api-enabled-and-the-start-mode`: `api.enabled` under `ajs project start`.
- `project-root-decides-where-the-builder-writes`: `projectRoot`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" http-api
```

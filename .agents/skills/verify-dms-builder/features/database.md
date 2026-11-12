---
covers:
  - packages/dms-builder/src/implementations/dms-builder/engine/analysis-fields.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/analysis-input.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/analysis-job.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/analysis-names.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/analysis-relations.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/analysis.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/database-connection-remove.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/database-connection.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/database-pin.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/env-lines.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/map-resources-batch.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/map-resources-pages.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/map-resources-plan.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/map-resources-references.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/map-resources-repairs.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/map-resources.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/mapped-choices.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/mapped-displays.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/mapped-modules.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/mapped-routes.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/mapping-refusal.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/module-reload.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/modules.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/own-connections.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project-config-ops.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project-config-readers.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project-config-remove.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project-config-steps.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project-config-text.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project-config.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project-env-loading.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project-env.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project-scaffold.ts
  - packages/dms-builder/src/implementations/dms-builder/engine/project.ts
  - packages/interface-dms-builder/src/analysis.ts
  - packages/interface-dms-builder/src/mapping.ts
  - packages/interface-dms-builder/src/project.ts
  - packages/dms-builder/src/routes/database.ts
  - packages/dms-builder/src/routes/query-text.ts
  - packages/dms-builder/frontend-vue/app/components/ConnectPrompt.vue
  - packages/dms-builder/frontend-vue/app/components/DatabaseApplied.vue
  - packages/dms-builder/frontend-vue/app/components/DatabaseApplySummary.vue
  - packages/dms-builder/frontend-vue/app/components/DatabaseBuild.vue
  - packages/dms-builder/frontend-vue/app/components/DatabaseConnect.vue
  - packages/dms-builder/frontend-vue/app/components/DatabaseConnectionEdit.vue
  - packages/dms-builder/frontend-vue/app/components/DatabaseConnectionRemove.vue
  - packages/dms-builder/frontend-vue/app/components/DatabasePanel.vue
  - packages/dms-builder/frontend-vue/app/components/DatabasePromptCopy.vue
  - packages/dms-builder/frontend-vue/app/components/DatabaseProposal.vue
  - packages/dms-builder/frontend-vue/app/components/DatabaseRelation.vue
  - packages/dms-builder/frontend-vue/app/runtime/analysis-summary.ts
  - packages/dms-builder/frontend-vue/app/runtime/connect-prompt.ts
  - packages/dms-builder/frontend-vue/app/runtime/database-build.ts
  - packages/dms-builder/frontend-vue/app/runtime/database-connect.ts
  - packages/dms-builder/frontend-vue/app/runtime/database-display.ts
  - packages/dms-builder/frontend-vue/app/runtime/database-remap.ts
  - packages/dms-builder/frontend-vue/app/runtime/database-rules.ts
  - packages/dms-builder/frontend-vue/app/runtime/database-server-text.ts
  - packages/dms-builder/frontend-vue/app/runtime/database-types.ts
  - packages/dms-builder/frontend-vue/app/runtime/database.ts
  - packages/dms-builder/frontend-vue/app/runtime/use-connect-prompt.ts
docs:
  - packages/interface-dms-builder/docs/11.external-databases.md
---

# External databases

## Sub-features

- `a-project-without-an-external-database-answers-the-documented-empties-and-404s`
- `the-database-workspace-offers-to-connect-a-database`
- `the-connect-prompt-asks-once-per-browser`

## Driving it with dms-control

```bash
dms-control journey "$RUN" database
```

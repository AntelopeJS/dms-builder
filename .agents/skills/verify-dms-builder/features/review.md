---
covers:
  - packages/dms-builder/frontend-vue/app/components/ChangesPanel.vue
  - packages/dms-builder/frontend-vue/app/components/ChangesFooter.vue
  - packages/dms-builder/frontend-vue/app/components/DiffView.vue
  - packages/dms-builder/frontend-vue/app/components/Banners.vue
  - packages/dms-builder/frontend-vue/app/components/Access.vue
  - packages/dms-builder/frontend-vue/app/components/Boundary.vue
  - packages/dms-builder/frontend-vue/app/runtime/changes.ts
  - packages/dms-builder/frontend-vue/app/runtime/draft-store.ts
  - packages/dms-builder/frontend-vue/app/runtime/draft.ts
  - packages/dms-builder/frontend-vue/app/runtime/access.ts
  - packages/dms-builder/frontend-vue/app/runtime/save-status.ts
  - packages/dms-builder/frontend-vue/app/runtime/diff-rows.ts
  - packages/dms-builder/frontend-vue/app/runtime/errors.ts
docs:
  - packages/dms-builder/docs/4.usage/5.saving-and-access.md
---

# Save, review and access

## Sub-features

- `the-change-list-names-the-edits-and-what-save-checks`
- `a-save-after-an-outside-change-is-refused-with-three-ways-out`
- `an-unsaved-draft-is-kept-on-the-device-and-offered-back`
- `view-as-previews-the-page-the-way-a-role-sees-it`

## Driving it with dms-control

```bash
dms-control journey "$RUN" review
```

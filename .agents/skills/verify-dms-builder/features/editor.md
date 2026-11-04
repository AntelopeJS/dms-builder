---
covers:
  - packages/dms-builder/frontend-vue/dms.frontend.ts
  - packages/dms-builder/frontend-vue/dms.frontend.build.ts
  - packages/dms-builder/frontend-vue/app/build/Node.ts
  - packages/dms-builder/frontend-vue/app/components/Bar.vue
  - packages/dms-builder/frontend-vue/app/components/Workspace.vue
  - packages/dms-builder/frontend-vue/app/components/LeftRail.vue
  - packages/dms-builder/frontend-vue/app/components/Library.vue
  - packages/dms-builder/frontend-vue/app/components/Layers.vue
  - packages/dms-builder/frontend-vue/app/components/Canvas.vue
  - packages/dms-builder/frontend-vue/app/components/Inspector.vue
  - packages/dms-builder/frontend-vue/app/components/BlockMenu.vue
  - packages/dms-builder/frontend-vue/app/plugins/builder.client.ts
  - packages/dms-builder/frontend-vue/app/build/Config.ts
  - packages/dms-builder/frontend-vue/app/build/NodePart1.ts
  - packages/dms-builder/frontend-vue/app/build/NodePart2.ts
  - packages/dms-builder/frontend-vue/app/build/Option.ts
  - packages/dms-builder/frontend-vue/app/build/OptionPart1.ts
  - packages/dms-builder/frontend-vue/app/build/OptionPart2.ts
  - packages/dms-builder/frontend-vue/app/components/Children.vue
  - packages/dms-builder/frontend-vue/app/components/ColourChips.vue
  - packages/dms-builder/frontend-vue/app/components/Config.vue
  - packages/dms-builder/frontend-vue/app/components/FoldCard.vue
  - packages/dms-builder/frontend-vue/app/components/FormPanel.vue
  - packages/dms-builder/frontend-vue/app/components/FormTarget.vue
  - packages/dms-builder/frontend-vue/app/components/GuardSettings.vue
  - packages/dms-builder/frontend-vue/app/components/IconPicker.vue
  - packages/dms-builder/frontend-vue/app/components/JsonPanel.vue
  - packages/dms-builder/frontend-vue/app/components/Node.vue
  - packages/dms-builder/frontend-vue/app/components/OnThePage.vue
  - packages/dms-builder/frontend-vue/app/components/Option.vue
  - packages/dms-builder/frontend-vue/app/components/Placeholder.vue
  - packages/dms-builder/frontend-vue/app/components/ResourceFormPanel.vue
  - packages/dms-builder/frontend-vue/app/components/SpacerPanel.vue
  - packages/dms-builder/frontend-vue/app/components/SubmitSettings.vue
  - packages/dms-builder/frontend-vue/app/components/TableActions.vue
  - packages/dms-builder/frontend-vue/app/components/TableChoice.vue
  - packages/dms-builder/frontend-vue/app/components/TableLink.vue
  - packages/dms-builder/frontend-vue/app/components/TablePanel.vue
  - packages/dms-builder/frontend-vue/app/components/TabsPanel.vue
  - packages/dms-builder/frontend-vue/app/components/TrendFold.vue
  - packages/dms-builder/frontend-vue/app/components/ValueFold.vue
  - packages/dms-builder/frontend-vue/app/runtime/after-submit.ts
  - packages/dms-builder/frontend-vue/app/runtime/anchor.ts
  - packages/dms-builder/frontend-vue/app/runtime/api.ts
  - packages/dms-builder/frontend-vue/app/runtime/block-panel.ts
  - packages/dms-builder/frontend-vue/app/runtime/canvas-options.ts
  - packages/dms-builder/frontend-vue/app/runtime/canvas-view.ts
  - packages/dms-builder/frontend-vue/app/runtime/catalog-blocks.ts
  - packages/dms-builder/frontend-vue/app/runtime/catalog-options.ts
  - packages/dms-builder/frontend-vue/app/runtime/catalog-settings.ts
  - packages/dms-builder/frontend-vue/app/runtime/catalog.ts
  - packages/dms-builder/frontend-vue/app/runtime/constants.ts
  - packages/dms-builder/frontend-vue/app/runtime/dev-reload.ts
  - packages/dms-builder/frontend-vue/app/runtime/dropping-geometry.ts
  - packages/dms-builder/frontend-vue/app/runtime/dropping.ts
  - packages/dms-builder/frontend-vue/app/runtime/field-type-answer.ts
  - packages/dms-builder/frontend-vue/app/runtime/form-panel.ts
  - packages/dms-builder/frontend-vue/app/runtime/form-table.ts
  - packages/dms-builder/frontend-vue/app/runtime/icon-search.ts
  - packages/dms-builder/frontend-vue/app/runtime/inline-code.ts
  - packages/dms-builder/frontend-vue/app/runtime/keys.ts
  - packages/dms-builder/frontend-vue/app/runtime/layout.ts
  - packages/dms-builder/frontend-vue/app/runtime/mode.ts
  - packages/dms-builder/frontend-vue/app/runtime/object.ts
  - packages/dms-builder/frontend-vue/app/runtime/page-controls.ts
  - packages/dms-builder/frontend-vue/app/runtime/palette-view.ts
  - packages/dms-builder/frontend-vue/app/runtime/resource-form-panel.ts
  - packages/dms-builder/frontend-vue/app/runtime/session-blocks.ts
  - packages/dms-builder/frontend-vue/app/runtime/session-derived.ts
  - packages/dms-builder/frontend-vue/app/runtime/session-history.ts
  - packages/dms-builder/frontend-vue/app/runtime/session-lifecycle.ts
  - packages/dms-builder/frontend-vue/app/runtime/session-loaders.ts
  - packages/dms-builder/frontend-vue/app/runtime/session-model.ts
  - packages/dms-builder/frontend-vue/app/runtime/session-navigation.ts
  - packages/dms-builder/frontend-vue/app/runtime/session-site.ts
  - packages/dms-builder/frontend-vue/app/runtime/session.ts
  - packages/dms-builder/frontend-vue/app/runtime/spacer-panel.ts
  - packages/dms-builder/frontend-vue/app/runtime/table-panel.ts
  - packages/dms-builder/frontend-vue/app/runtime/tabs-panel.ts
  - packages/dms-builder/frontend-vue/app/runtime/typed-values.ts
  - packages/dms-builder/frontend-vue/app/runtime/types.ts
  - packages/dms-builder/frontend-vue/app/runtime/wrappers.ts
  - packages/dms-builder/frontend-vue/build/backend-boundary.ts
  - packages/dms-builder/frontend-vue/package.json
docs:
  - packages/dms-builder/docs/4.usage/1.page-editor.md
---

# Page editor

## Sub-features

- `the-hammer-and-ctrl-b-open-and-close-the-editor-and-esc-never-does`
- `the-layers-tab-lists-every-block-and-selecting-opens-its-settings`
- `adding-duplicating-removing-and-undoing-are-unsaved-changes-until-save`
- `developer-mode-adds-the-blocks-simple-mode-hides`

## Driving it with dms-control

```bash
dms-control journey "$RUN" editor
```

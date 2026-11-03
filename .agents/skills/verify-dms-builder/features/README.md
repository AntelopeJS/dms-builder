# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, `journeys/<feature>.mjs` its journeys, `coverage/<feature>.md` the documented behaviours and the check that pins each, and `seeded-breaks/<feature>.patch` the break its journeys must catch. `dms-control map` checks that every user-facing file is covered and that every feature has its journeys, its seeded break and existing docs pages.

| Feature | What the user does | Journeys |
|---|---|---|
| [blocks](blocks.md) | Blocks: add, configure, move and remove; value encodings; typecheck rollback. | add-block-writes-a-factory-call-and-refuses-what-it-cannot-write, configure-move-and-remove-rewrite-one-block, a-write-that-would-not-compile-is-rolled-back |
| [catalog](catalog.md) | `GetCatalog` and `RefreshSourceIndex`: block types, DataTypes, reserved names and the catalog cache. | the-catalog-describes-block-types-and-data-types |
| [categories](categories.md) | Menu categories: create, list, patch, delete and their refusals. | a-category-is-written-beside-the-root-barrel, configure-and-delete-follow-the-documented-refusals |
| [data-sources](data-sources.md) | The Data workspace: the sources of a page read as sentences. | the-data-workspace-lists-the-sources-of-the-page-and-adds-one |
| [database](database.md) | The Database workspace and its `/api/builder/database` routes on a project without an external database. | a-project-without-an-external-database-answers-the-documented-empties-and-404s, the-database-workspace-offers-to-connect-a-database |
| [drafts](drafts.md) | `SetPageBlocks` and `PreviewLayout`: a whole page in one transaction, validation with pointers, preserved blocks. | set-page-blocks-writes-blocks-and-queries-in-one-transaction, set-page-blocks-reports-every-problem-at-once, preserving-every-block-changes-only-the-page-metadata, preview-layout-serializes-a-draft-without-writing |
| [editor](editor.md) | The editor in the dashboard: open and close, bar, Add and Layers tabs, inspector, modes, shortcuts, undo and redo. | the-hammer-and-ctrl-b-open-and-close-the-editor-and-esc-never-does, the-layers-tab-lists-every-block-and-selecting-opens-its-settings, adding-duplicating-removing-and-undoing-are-unsaved-changes-until-save, developer-mode-adds-the-blocks-simple-mode-hides |
| [http-api](http-api.md) | The `/api/builder` routes and the options that switch them: owner-only access, answer shapes, `api.enabled`, `projectRoot`. | every-route-needs-a-tenant-owner, lists-answer-their-value-and-mutations-answer-an-op-result, the-builder-follows-api-enabled-and-the-start-mode, project-root-decides-where-the-builder-writes |
| [i18n](i18n.md) | The English and French catalogs of the builder. | english-and-french-catalogs-carry-the-same-keys-under-dms-builder |
| [package](package.md) | What the module and the interface publish, and the shipped skill. | the-module-and-the-interface-tarballs-hold-what-their-manifests-name, the-skill-cases-name-existing-skills |
| [pages-menu](pages-menu.md) | The Pages tab: new page, new category, delete with confirmation. | new-page-writes-the-page-at-once-from-a-layout, categories-and-pages-are-managed-from-the-menu |
| [pages](pages.md) | Pages: create from a name, patch metadata, move between categories, delete, with versions for conditional writes. | create-page-writes-the-file-and-wires-the-barrel, configure-a-page-patches-and-moves-it, delete-a-page-removes-its-file-and-import |
| [queries](queries.md) | Data sources: templates, `AddQuery`, `ConfigureQuery`, `RemoveQuery` and `PreviewQuery` on the seeded orders. | preview-query-answers-exact-figures-from-the-seeded-orders, preview-validates-parameters-as-add-query-does, add-configure-and-remove-a-query-write-a-route-and-a-model-method |
| [resources](resources.md) | Tables and their DataAPI: create, fields, routes, delete. | create-resource-writes-a-table-a-controller-and-an-index, an-exported-field-is-written-with-its-import, fields-and-routes-are-edited-in-both-generated-files, delete-resource-removes-its-files-imports-and-rows |
| [review](review.md) | Save, review and access: the change list, stale saves, the kept draft and View as. | the-change-list-names-the-edits-and-what-save-checks, a-save-after-an-outside-change-is-refused-with-three-ways-out, an-unsaved-draft-is-kept-on-the-device-and-offered-back, view-as-previews-the-page-the-way-a-role-sees-it |
| [smoke](smoke.md) | The fixed journey every verdict runs: retitle a card in the editor, save, read the change in the source and on the page. | smoke |
| [tables](tables.md) | The Tables workspace: create, API switches, delete with a typed key. | a-table-is-created-and-deleted-from-the-tables-workspace, delete-the-table-removes-it-and-its-files-at-once, an-open-table-shows-its-rows-route-readers-and-tabs, the-last-served-route-cannot-be-switched-off |

The smoke journey runs on every verdict.

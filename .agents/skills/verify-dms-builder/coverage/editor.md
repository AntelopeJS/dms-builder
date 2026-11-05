# Coverage: editor

Docs: `4.usage/1.page-editor.md`, `1.introduction.md`. Journeys: `journeys/editor.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| dms-builder/docs/4.usage/1.page-editor.md:7 | the hammer and Ctrl+B open and close the editor; Esc never closes it | the-hammer-and-ctrl-b-open-and-close-the-editor-and-esc-never-does | open, Esc twice, Ctrl+B closes and opens, the hammer closes |
| dms-builder/docs/4.usage/1.page-editor.md:13 | the bar holds the badge, workspaces, status, Undo, Redo, mode, Save, Done | same | workspaces in order; All changes saved; disabled controls; Simple; Done |
| dms-builder/docs/4.usage/1.page-editor.md:42 | the Add tab groups the catalog; Simple hides CodeBlock, EmptyState, LiveToggle that Developer lists | developer-mode-adds-the-blocks-simple-mode-hides | groups; the three names |
| dms-builder/docs/4.usage/1.page-editor.md:46 | clicking a tile adds the block; search | adding-duplicating-removing-and-undoing-are-unsaved-changes-until-save | search KPI then click adds one unsaved change |
| dms-builder/docs/4.usage/1.page-editor.md:56 | the Layers tab lists every block and Find narrows it | the-layers-tab-lists-every-block-and-selecting-opens-its-settings | eleven rows in order; the filter |
| dms-builder/docs/4.usage/1.page-editor.md:70 | the inspector shows title, kind, who sees it and the tabs of its kind | same | chart card Content/Data/Style; table Content/Actions/Style; form Fields/After submit/Style |
| dms-builder/docs/4.usage/1.page-editor.md:95 | Ctrl+Z, Ctrl+Shift+Z, Ctrl+S, Remove, Done asks first | adding-duplicating-removing-and-undoing-are-unsaved-changes-until-save | undo, redo, save writes a KpiCard; Remove is a draft; the three leave choices |
| dms-builder/docs/4.usage/1.page-editor.md:75 | Ctrl+D, Delete, Backspace, arrows, Alt+arrows, Enter, / and Ctrl+B inside editable text | (shortcuts) | see `coverage/shortcuts.md` |
| dms-builder/docs/4.usage/1.page-editor.md:46 | drop geometry: nearest edge, 32 px band, Beside … · new column | - | Not driven: pointer drag is not in the accessibility tree |
| dms-builder/docs/4.usage/1.page-editor.md:58 | canvas, preview stand-ins, zoom and width, controls the editor places (toolbar, period selector, Live switch, Guard) | - | Not driven: canvas pixels and zoom are not in the accessibility tree; the controls the editor places are written by the engine from the draft |
| dms-builder/docs/4.usage/1.page-editor.md:20 | View as in the bar | review | see review |

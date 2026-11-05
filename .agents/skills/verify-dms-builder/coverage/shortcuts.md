# Coverage: shortcuts

Docs: `4.usage/1.page-editor.md`, the Keyboard section. Journeys: `journeys/shortcuts.mjs`. Ctrl+B outside text fields, Ctrl+Z, Ctrl+Shift+Z, Ctrl+S and Esc are in `coverage/editor.md`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| dms-builder/docs/4.usage/1.page-editor.md:82 | Delete or Backspace removes the selected block | delete-and-backspace-remove-the-selected-block | the block leaves Layers, the rest keeps its order, one unsaved change; Undo brings it back |
| dms-builder/docs/4.usage/1.page-editor.md:83 | the arrows select the previous or next block, or the last or first with nothing selected | arrows-select-and-alt-arrows-move | the inspector names the first, the next, the previous and the last block |
| dms-builder/docs/4.usage/1.page-editor.md:84 | Alt with an arrow moves the selected block | arrows-select-and-alt-arrows-move | the Layers order changes and comes back, one unsaved change |
| dms-builder/docs/4.usage/1.page-editor.md:81 | Ctrl+D duplicates the selected block | ctrl-d-duplicates-enter-opens-settings-and-slash-searches | one more block of the same title, one unsaved change |
| dms-builder/docs/4.usage/1.page-editor.md:85 | Enter opens the selected block's settings | same | the inspector's Content, Data, Style tabs |
| dms-builder/docs/4.usage/1.page-editor.md:86 | / searches the catalog | same | the search box receives what is typed next |
| dms-builder/docs/4.usage/1.page-editor.md:86 | Enter and Alt+Enter in the catalog search add below and beside | search-enter-adds-below-and-alt-enter-adds-beside | a KPI card follows the selected block; Alt+Enter adds one more |
| dms-builder/docs/4.usage/1.page-editor.md:89 | the other shortcuts do nothing while you type in a field; Ctrl+S works anywhere | keys-do-nothing-while-typing-but-ctrl-s-still-saves | the block stays, nothing unsaved, the selection does not move; Ctrl+S saves |
| dms-builder/docs/4.usage/1.page-editor.md:89 | Ctrl+B works anywhere except inside editable text | ctrl-b-closes-from-a-text-field-but-not-from-editable-text | closes from the Find box; stays open from a contenteditable region placed on the page, which the builder itself never renders |
| dms-builder/docs/4.usage/1.page-editor.md:89 | the block keys work only in the Page workspace | - | Not driven: the other workspaces hold no selected block to act on |
| dms-builder/docs/4.usage/1.page-editor.md:73 | Cmd works as Ctrl | - | Not driven: the run's browser is Chromium on Linux |

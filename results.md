# Layers row focus, block shortcuts (dms-builder #142)

Page: /shop/board (11 block rows). Block 2 is the `Tabs` container (rows 3-5 are its children), so Ctrl+D and Delete act on it and its 3 children.
Each key is its own trial: reload, Ctrl+B, Layers tab, real mouse click on row 2 (the row keeps focus), key, observe, Done -> Leave without saving.

## BEFORE origin/main 78b36d2

| key | selected before | selected after | block order / count | save status | inspector title |
|---|---|---|---|---|---|
| ArrowDown | Tabs (row 2) | Tabs (row 2) | 11 -> 11 rows; first rows ['Period selector', 'Tabs', 'Placeholder'] | All changes saved -> All changes saved | Tabs -> Tabs |
| Alt+ArrowUp | Tabs (row 2) | Tabs (row 2) | 11 -> 11 rows; first rows ['Period selector', 'Tabs', 'Placeholder'] | All changes saved -> All changes saved | Tabs -> Tabs |
| Ctrl+D | Tabs (row 2) | Tabs (row 2) | 11 -> 11 rows; first rows ['Period selector', 'Tabs', 'Placeholder'] | All changes saved -> All changes saved | Tabs -> Tabs |
| Delete | Tabs (row 2) | Tabs (row 2) | 11 -> 11 rows; first rows ['Period selector', 'Tabs', 'Placeholder'] | All changes saved -> All changes saved | Tabs -> Tabs |
| Enter | Tabs (row 2) | Tabs (row 2) | 11 -> 11 rows; first rows ['Period selector', 'Tabs', 'Placeholder'] | All changes saved -> All changes saved | Tabs -> Tabs |

## AFTER fix HEAD be01e07

| key | selected before | selected after | block order / count | save status | inspector title |
|---|---|---|---|---|---|
| ArrowDown | Tabs (row 2) | Placeholder (row 3) | 11 -> 11 rows; first rows ['Period selector', 'Tabs', 'Placeholder'] | All changes saved -> All changes saved | Tabs -> Placeholder |
| Alt+ArrowUp | Tabs (row 2) | Tabs (row 1) | 11 -> 11 rows; first rows ['Tabs', 'Placeholder', 'form'] | All changes saved -> 1 unsaved change | Tabs -> Tabs |
| Ctrl+D | Tabs (row 2) | Tabs (row 6) | 11 -> 15 rows; first rows ['Period selector', 'Tabs', 'Placeholder'] | All changes saved -> 4 unsaved changes | Tabs -> Tabs |
| Delete | Tabs (row 2) | none | 11 -> 7 rows; first rows ['Period selector', 'Revenue', 'Orders by status'] | All changes saved -> 4 unsaved changes | Tabs -> Nothing selected |
| Enter | Tabs (row 2) | Tabs (row 2) | 11 -> 11 rows; first rows ['Period selector', 'Tabs', 'Placeholder'] | All changes saved -> All changes saved | Tabs -> Tabs |

## AFTER only: Tab onto another block row

- tab-start: focused row 2, selected ['Tabs'], 11 rows, status All changes saved, inspector Tabs
- tab-1: focused row 2, selected ['Tabs'], 11 rows, status All changes saved, inspector Tabs
- tab-2: focused row 3, selected ['Placeholder'], 11 rows, status All changes saved, inspector Placeholder
- tab-delete: focused row none, selected none, 10 rows, status 1 unsaved change, inspector Nothing selected
- tab-undo: focused row none, selected none, 11 rows, status All changes saved, inspector Nothing selected

Tab case detail (AFTER): from row 2 (`Tabs`) the first Tab lands on that row's "Actions" button (same row, selection unchanged); the second Tab lands on row 3's block button (`Placeholder`, child of Tabs), which selects it and swaps the inspector to Placeholder. Delete then removed that `Placeholder` (11 -> 10 rows, order Period selector, Tabs, form, Placeholder, ...), and Ctrl+Z restored all 11 rows with "All changes saved".

Enter: no visible change on either build. Selecting a block already puts the inspector on its settings (`select()` sets the config view), so `setView('config')` has nothing to change; this key does not separate before from after in this scenario.

Nothing was saved: every trial ended with Done -> Leave without saving. Artifacts: before.png, after.png (state after ArrowDown), before.webm, after.webm (all five keys plus the Tab case), out-before/ and out-after/ (per-key screenshots, log.jsonl with the DOM state before and after each key).

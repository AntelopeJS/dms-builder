---
name: formal-page-save
description: TLA+ model of how a dms-builder page file is saved (the editor's draft, its version and expectedVersion, the stale refusal with Keep my version and Reload the page, a page move and the refresh that follows it, engine mutations from another module, and an editor outside the builder), checked with TLC. Use when a change touches the save path of packages/dms-builder (engine/ops.ts openPage, checkVersion or commit, engine/writable.ts refreshFromDisk or Transaction, engine/page-draft.ts setPageBlocks, engine/page-structure.ts, engine/source-index.ts, or the frontend's session-lifecycle.ts, session-site.ts, session-loaders.ts or draft.ts), or needs proof that a save never silently overwrites a change it did not see.
---

# Formal check: a save never silently overwrites a change

A tenant owner edits a page in the builder while the same file can change elsewhere: another builder tab, another module calling `@antelopejs/interface-dms-builder`, or the developer's own editor. The builder promises that a save does not overwrite a change it has not seen. When the file changed since the tab opened it, Save writes nothing and the banner says "This page changed outside the builder since it was opened". The tab can then keep its version, having seen the change, or reload.

The model treats each engine operation, each read of the page and each outside save as one step. TLC checks every order of those steps across two tabs, one module edit, one outside save and, in one configuration, one page move, within the bounds below. The rule it checks is that no edit the file held is gone unless a tab that wrote over it had seen it.

- `PageSave.tla` holds the variables, the actions and the rule. Each action names the code it stands for as `file.ts:NN`. Engine paths are under `packages/dms-builder/src/implementations/dms-builder/`, frontend paths under `packages/dms-builder/frontend-vue/app/`.
- `Serial.cfg`, `Window.cfg` and `Move.cfg` are the three configurations (see the table below).
- `check.mjs` runs all three through the shared runner and compares the result with the record in this file.

## Run it

From the repository root, with Node 24 and `pnpm install` done (the runner comes from `@antelopejs/tooling-configs/formal`):

```sh
node .agents/skills/formal-page-save/check.mjs
```

Java 11 or later comes from `$JAVA`, else `java` on PATH, else the `eclipse-temurin:21-jre` Docker image (set `TLC_DOCKER_PREFIX` to name the containers). The first run downloads TLC 1.7.4 into `~/.cache/antelopejs-formal` (or `$XDG_CACHE_HOME/antelopejs-formal`) and checks its SHA-256.

| Configuration | What it allows | States | Result |
| --- | --- | --- | --- |
| `Serial` | Outside saves only between engine operations; no page move | 631,503 | `NoSilentLoss` holds |
| `Window` | An outside save may land inside an engine operation; no page move | 645,113 | `NoSilentLoss` holds |
| `Move` | Outside saves between engine operations; one page move from a tab | 3,410,969 | finding F2, 11 states |

All three use two tabs, one module edit, one outside save and five edits in all. One run of all three took 43 s in Docker Java 21 on a shared 16-core machine with a load average near 40; most of it is container and JVM start-up.

- Exit 0 means every rule that held still holds, and each finding still breaks with its recorded counterexample length.
- Exit 1 means a rule changed. `BROKEN` names a rule that held and now breaks. `CHANGED` names a finding whose shortest counterexample changed length. `HOLDS` names a finding that no longer breaks. The runner keeps TLC's output in a temporary folder and prints its path. It stops at the first configuration that changed.
- Exit 2 means TLC or Java could not run, or the arguments were wrong.

A rule that still holds prints as lowercase `holds`. A finding is judged by the length of its shortest counterexample alone, so a change that adds a longer path to a recorded finding exits 0. While F2 stands, read the diff of the covered code yourself.

Read every result with the pstack `/statechart` skill. It shows a violation as its shortest path in plain words, and when the check passes it charts how a tab, the engine and the file move between states.

## When to run it

Run it when a change touches a file in the coverage record below, or this folder. The `verify-dms-builder` skill lists it under `formal` in its `verify.config.ts`, so `dms-control formal` runs it for such a diff and a verdict fails on a changed rule.

## The rule

| Rule | Plain sentence | Harm when it breaks |
| --- | --- | --- |
| `NoSilentLoss` | Every edit the page file ever held is still in it, unless a tab that saved over it had seen it, through Keep my version. | A developer's or another tab's change disappears from the page's source with no banner and no trace. |

`TypeOK` holds in every configuration.

## How the model reads the code

The engine is one actor. Every engine mutation is synchronous from `refreshFromDisk` to `Transaction.flush`, so no other operation of the process runs in between. A writer in another process can act in that window, which holds the project typecheck. A file's content is the set of edits it holds, each edit with a fresh id. Two contents are equal exactly when their texts are, so the content stands for its version, a hash of the text.

| Action | Code |
| --- | --- |
| `Open` | `GetPageStructure` (`engine/page-structure.ts:32`): the text on disk and its version; the source index restamps a file whose mtime changed (`engine/source-index.ts:28`) |
| `Edit` | an edit to a block in the tab's draft (`runtime/session-history.ts`); nothing is written |
| `RequestSave`, `BeginSave` | `save()` sends the draft with `expectedVersion` (`runtime/session-lifecycle.ts:289`); `setPageBlocks` refreshes (`engine/ops.ts:132`), checks (`engine/ops.ts:147`) and replaces the blocks, keeping the rest of the text it read (`engine/page-draft.ts:519`) |
| `Write`, `Rollback` | `commit` flushes, or rolls back on a typecheck error (`engine/ops.ts:160`); a save answers the version of what it wrote (`engine/page-draft.ts:607`) |
| `Refuse` | `commit` finds the file no longer holds the text the operation read (`engine/writable.ts:426`), rolls back and answers `stale` (`engine/ops.ts:173`); a save raises the stale banner, a move reports the refusal |
| `KeepMine`, `ReloadPage` | the stale banner's Keep my version (`runtime/session-lifecycle.ts:226`) and Reload the page (`runtime/session-lifecycle.ts:106`, `reload` through `loadStructure`) |
| `RequestMove`, `BeginMove`, `RefreshAfterMove` | moving the page to another category (`runtime/session-site.ts:209`): `configurePage` with no version, then, with an unsaved draft, `refresh()` adopts the page's version and keeps the draft (`runtime/session-lifecycle.ts:130`) |
| `BeginModuleEdit` | another module's mutation with no `expectedVersion`, on a block or elsewhere in the file |
| `OutsideWrite` | an editor outside the builder saves the file |

A save writes the draft's blocks and only the page options the tab changed (`runtime/draft.ts:62`), so an edit outside the blocks, such as a move's new category, survives it. The model splits edits the same way (`blockIds`).

## Findings

Each finding was replayed on the real engine in a `verify-dms-builder` run (`dms-control up`), through the skill playground's fixture route, which calls the interface in process as another module does. The replay was a scratch script and is not committed. It wrote the page file directly to stand for the outside editor, and restored the playground's `src` between replays.

- **F1, an outside save during an engine operation was overwritten (`Window`, 4 states, dms-builder#162). Fixed.** `refreshFromDisk` reads the file, the operation edits the text in memory, the typecheck runs, and `flush` writes the whole text back with `saveSync` (`engine/writable.ts:443`), never comparing the file with what it read. In TLC's path, another module's edit starts, the outside editor saves, and the engine writes. Replay: a module's `ConfigurePage("/shop/board", { order: 9 })` took 2.5 to 3.4 s; an outside save that landed 0.05, 0.3, 0.8 or 1.5 s into it was gone afterwards, and one at 4 s, after the write, was kept. A builder tab's Save goes through the same window. The fix compares each file with the text the operation read before `flush` writes any of them, and answers `stale` when one differs; `Window` now holds.
- **F2, a page move lets the next save overwrite an outside change (`Move`, 11 states, dms-builder#163).** After a move with an unsaved draft, `refresh()` takes the page's current version and keeps the draft, without the stale check. The next Save then passes `checkVersion` and writes the draft's blocks over any block change made outside since the tab opened the page. Replay: the tab read `/shop/board` and retitled Revenue in its draft; the page moved to a new category `pages.other`; the outside editor retitled Orders by status; `GetPageStructure` gave the new version; `SetPageBlocks` with that version answered ok, and the file held the tab's title and no longer the outside one. Without the move, the same Save answered `stale` and the outside title stayed.

F2 is not fixed. The likely fix is `refresh()` raising the stale banner when the version it reads is not the one the move wrote.

## A scratch break this check catches

Take the version check out of `setPageBlocks` (`engine/page-draft.ts:519`, the `checkVersion` call). In the model that is `CheckVersion = FALSE`. With it, `Serial` reports `BROKEN NoSilentLoss`. TLC's path is a tab opens and edits, the outside editor saves, the tab saves, and the outside save is gone. The constant exists for this proof; the configurations keep it `TRUE`.

## When the check changes

- `BROKEN` after a code change: replay TLC's path on the real code before you call it a bug, as the findings above were. If the code cannot take that path, the model is wrong: fix the action and its `file.ts:NN` comment, not the rule.
- `HOLDS` for F2: a fix landed, or the model drifted. Confirm on the code, then remove the finding from `check.mjs` and from this file.
- An intended behaviour change (a new way to write the page, a new refusal): add or change the action first, run the check, then update the tables here.

Never weaken `NoSilentLoss` or shrink a bound to make a run pass.

## Coverage record

Sync commit: the fix for dms-builder#162 (`main`). The model was last confirmed against these files at that commit. Move it forward only after you confirm that the model still describes them at the new commit.

- `packages/dms-builder/src/implementations/dms-builder/engine/ops.ts`: `openPage`, `checkVersion`, `commit`
- `packages/dms-builder/src/implementations/dms-builder/engine/writable.ts`: `refreshFromDisk`, `Transaction`
- `packages/dms-builder/src/implementations/dms-builder/engine/page-draft.ts`: `setPageBlocks`
- `packages/dms-builder/src/implementations/dms-builder/engine/page-structure.ts`: `contentVersion`, `buildPageStructure`
- `packages/dms-builder/src/implementations/dms-builder/engine/source-index.ts`: `getSourceIndex`
- `packages/dms-builder/frontend-vue/app/runtime/session-lifecycle.ts`: `save`, `refresh`, `keepMine`
- `packages/dms-builder/frontend-vue/app/runtime/session-site.ts`: `movePage`
- `packages/dms-builder/frontend-vue/app/runtime/session-loaders.ts`: `loadStructure`
- `packages/dms-builder/frontend-vue/app/runtime/draft.ts`: `structureToDraft`

## What it does not cover

- One page file. Operations that write several files (a page and its barrel, a resource's two files) are not modeled; `Transaction.flush` writes them one by one.
- The content of an edit: two edits never conflict inside a block, they only replace one another.
- A draft kept in the browser across visits and offered back (`restoreAnyway`), and the changed-page confirmation that guards it.
- Two engine processes on one project.
- The source index's mtime stamps are taken to see every outside save; a save within the file system's mtime resolution of the previous one is not modeled.
- Liveness: that a tab can always save eventually.

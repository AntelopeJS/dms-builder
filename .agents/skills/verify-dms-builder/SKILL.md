---
name: verify-dms-builder
description: "Drive the AntelopeJS dms-builder module (the page editor in the dashboard, pages and menu, tables, data sources, the /api/builder HTTP API and the @antelopejs/interface-dms-builder operations) the way a tenant owner and another module do, inside a DMS with free ports and its own MongoDB database, and post a verdict with evidence. Use to prove a change to AntelopeJS/dms-builder works before merge, to verify a PR, or to check that a seeded break or a seeded one-way door is caught."
---

# Verify dms-builder

Every deterministic step is a `dms-control` command. You choose which journeys to run and judge what they show; you never write a multi-step shell recipe. When a journey you need does not exist, add it to `journeys/<feature>.mjs`, describe it in its feature file, and run it.

The pack has no `dms` verify kind, so this skill follows the layout of dms-media and dms-automation. `dms-control` is the bin of `@antelopejs/dms`, a dependency of the skill's own playground (`playground/`), which `prepare` installs. Run it with Node 24 after the repository install:

```bash
C="node .agents/skills/verify-dms-builder/playground/node_modules/@antelopejs/dms/bin/dms-control.mjs"
$C                       # lists every command
```

Give `seeded`, `doors` and `--skill` absolute paths. Set `TMPDIR` to a folder of yours.

## Launch

```bash
RUN=$($C up --prepare --skill "$PWD/.agents/skills/verify-dms-builder" --base origin/campaign/integration)
```

`--prepare` runs the `prepare` commands of `verify.config.ts`: the frozen install, the build of the interface and the module, the playground install and its TypeScript build. `up` starts an isolated DMS from `playground/`:

- the checkout is laid out again under `$RUN/root` and the playground copied without `node_modules`, so the sources the builder rewrites, `.antelope/` and the build are the run's own;
- the API, the dashboard and the mail sink get free ports from the kernel, `HOME` is `$RUN/home`, and the run holds its own `DMS_SETUP_TOKEN` that `onboard` sends with the first registration;
- a `mongod` the run owns serves `verify_<run>` databases;
- the backend runs `ajs project start -e docs` with `api.enabled` forced on (`VERIFY_BUILDER_API`, see `playground/antelope.config.ts`), because the builder is off under `start` otherwise.

The playground (`playground/src`) is the repository playground's Board page, `orders` table and 18 seeded orders, plus a fixture module under `/verify-builder`: `POST /call { name, args }` calls an operation of `@antelopejs/interface-dms-builder` in process, as another module does (an argument `{ "$undefined": true }` stands for `undefined`), `POST /member` makes a member with a role, `GET /permissions` names the Board's permission ids.

## Doctor

```bash
$C doctor "$RUN"          # prints only failing checks; --verbose prints all
```

Do not drive a run that fails doctor.

## Drive

```bash
$C plan --base origin/campaign/integration   # the diff mapped to features; unmapped surfaces
$C journey "$RUN" smoke
$C journey "$RUN" pages [journey-id...]
```

- Each feature file in [features/](features/README.md) lists its source globs (`covers:`), its docs pages (`docs:`) and its journeys; [coverage/](coverage) holds one table per feature with every documented behaviour, its catching check or its `Not driven` reason. Journeys are in `journeys/<feature>.mjs`; helpers are `builder.mjs` (API, operations, project files, `rebuild`, `withConfig`, `member`), `editor.mjs` (open the builder, select a block, the save status) and `guard.mjs`.
- A journey starts on an empty database with the owner onboarded and the backend restarted on it. The builder writes the playground's sources, so `guard.mjs` copies `src` and `dist` aside before the first journey and puts them back when each journey ends. A journey reads every write back through a second view: the project files, `GetPageStructure`, the listing operations, a reload, or a rebuilt and restarted backend (`rebuild`).
- `withConfig(ctx, { VERIFY_BUILDER_*: … }, body)` restarts the backend with `api.enabled` (`VERIFY_BUILDER_API=off|follow-dev`) or `projectRoot` (`VERIFY_BUILDER_PROJECT_ROOT`) set and restarts it again without them.
- To look at the product yourself: `$C onboard "$RUN"`, `$C browser "$RUN" login`, `goto --path`, `snapshot`, `click --role --name`, `fill`, `press`, `screenshot`, `$C api "$RUN" <method> <path> [--as anon] [--body <json>]`, `$C reset "$RUN"`. Each writes its evidence under `$RUN/evidence/`.

## Evidence

Everything goes under `$RUN/evidence/`: `<feature>/<journey>/NN-<step>/` with `action.json`, `url.txt`, `aria.yml` and `screenshot.png` for a browser step, `request.json` and `response.json` for a request, `file.ts.txt` for a project file read, and `checks.json` for every step that checks something; `<feature>/<journey>/result.json` and `<feature>/feature.json`. Read the evidence before you judge a PASS: a check passing proves only what it asserts.

## Cleanup

```bash
$C down "$RUN"
```

## Verdict rules

1. **Run every feature whose `covers:` globs the diff touches, plus the smoke journey.** `plan` prints that list as `run`.
2. **Unmapped surface fails the verdict.** User-facing code is `packages/dms-builder/src/**`, `frontend-vue/**`, `skills/**`, `package.json`, and `packages/interface-dms-builder/src/**` and `package.json`, tests and tool configs excluded (`verify.config.ts`). `map` checks the whole tree.
3. **Every registered journey of a feature in `run` must have run and passed.** Known findings stay as failing journeys (see Gotchas): they fail a verdict only when the diff touches their feature.
4. **Docs.** Judge every `docs:` page of each touched feature against what the journeys showed.
5. **Formal checks.** None.
6. **One-way doors.** The section comes right after the result line and is mandatory. `$C doors` prints the `One-way-door:` line for the diff. A Data door is contained only by `pages/delete-a-page-removes-its-file-and-import` and `resources/delete-resource-removes-its-files-imports-and-rows` passing in this run, an Exposure door by `http-api/every-route-needs-a-tenant-owner`; no journey contains a Format, Contract or Publish door, so those rows say so.
7. **Result.** FAIL if any of rules 1 to 6 fail. PASS+NOTES when something is not verified or needs the owner's attention. PASS otherwise.

Write `$RUN/evidence/judgement.json` (`doors`, `docs`, `notVerified`, `attention`, `verifier`), then `$C verdict "$RUN" --pr <n>` and, from a thread that did not write the change, `$C publish "$RUN" --pr <n>`.

## Trust

The skill is not Trusted yet. It becomes Trusted when it catches every seeded break and flags every seeded door, passes a shadow run of 10 consecutive agent PRs, and its last maintain pass is newer than the last change to the repository or its `@antelopejs` dependencies and at most 30 days old.

## Seeded breaks and doors

```bash
$C seeded smoke pages
$C doors "$PWD/.agents/skills/verify-dms-builder/seeded-doors/data.patch"
```

`seeded-breaks/<feature>.patch` is one minimal product bug per feature; `seeded` builds a control and a patched worktree from the committed HEAD, runs the feature's journeys in each, and prints `CAUGHT` with the journeys that caught it, or `MISSED`. A break counts only when a journey that passes in the control fails one of its checks with the patch. `seeded-doors/<kind>.patch` holds one change per door kind.

## Gotchas

- Every dashboard page renders on the server and hydrates after `load`; a click that lands first does nothing. `openBuilder` clicks the hammer until the editor bar shows.
- On a project with no external database the dashboard asks a fresh browser to connect one, in a dialog over every page. `guarded` answers Not now once per browser before any page script runs; `database/the-connect-prompt-asks-once-per-browser` removes that answer to drive the dialog.
- The page files the builder writes are not served until the project is compiled and the backend restarted, which `ajs project dev -w` does on its own; journeys that need the rendered page call `rebuild`.
- A frontend is built once: the dashboard keeps its builder button after the backend turns the builder off, so the button's absence is Not driven; the routes' 404 is driven.
- The docs name the change list's undo control "Put this one back"; the UI button reads "Revert: <edit>" (dms-builder#151).
- `CreatePage` places a page at `<category-folder>/<name>/page.ts` when a barrel sits beside the category's file, and at `src/<name>.ts` otherwise; journeys create a category first when they need the folder form.
- `ResourceSummary.fieldCount` counts the generated `_id`.
- Known findings at the integration head, each a failing journey with an issue draft: `resources/an-exported-field-is-written-with-its-import` (the `@Exported` import is missing, dms-builder#149), `queries/preview-validates-parameters-as-add-query-does` (PreviewQuery accepts an undeclared parameter, dms-builder#150), `tables/delete-the-table-removes-it-and-its-files-at-once` (the backend serves no `DELETE /api/builder/resource`, dms-builder#148), `data-sources/read-it-now-shows-one-row-per-group-known-finding` (a card-arranged source shows an undefined NaN row, dms-builder#152).

## Not driven

List these under `notVerified` in the judgement of every verdict; the per-feature `coverage/` tables carry the rest.

- connecting an external database, analysing it, mapping its relations and the module changes that follow (`AnalyseDatabase`, `MapResources`, `ConfigureProject`, `AddModule`, `CreateLocalModule`, `ConfigureTableView`): the run has no catalog provider and no external database, so only the empty and refusal paths are driven;
- the builder button's absence under `ajs project start` (the dashboard is built once, see Gotchas);
- pointer drag and drop of a block, the canvas zoom and width, and the pixels of the preview: the accessibility tree does not carry them;
- `Cmd` in place of `Ctrl`, and the block keys outside the Page workspace (see `coverage/shortcuts.md`);
- `module` placement of pages, categories and resources in another project module: the playground has one module.

## Feature map

[features/README.md](features/README.md).

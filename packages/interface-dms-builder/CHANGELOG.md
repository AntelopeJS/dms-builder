# Changelog

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.4...v0.2.0)

### 💅 Refactors

- ⚠️  Remove pre-DMS-0.8 compatibility, dead code and duplicated helpers ([#41](https://github.com/AntelopeJS/dms-builder/pull/41))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.7 ([5942f48](https://github.com/AntelopeJS/dms-builder/commit/5942f48))

#### ⚠️ Breaking Changes

- ⚠️  Remove pre-DMS-0.8 compatibility, dead code and duplicated helpers ([#41](https://github.com/AntelopeJS/dms-builder/pull/41))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.4

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.3...v0.1.4)

### 🚀 Enhancements

- **panels:** Lay out simple-mode block panels as cards ([8f798b5](https://github.com/AntelopeJS/dms-builder/commit/8f798b5))
- **palette:** Leave the charts a chart card draws with to the card ([b33f90c](https://github.com/AntelopeJS/dms-builder/commit/b33f90c))
- **frontend-vue:** Declare the @antelopejs/dms-frontend releases the layer supports ([#30](https://github.com/AntelopeJS/dms-builder/pull/30))
- **palette:** Leave the types the DMS never declared to the advanced view ([ee357f7](https://github.com/AntelopeJS/dms-builder/commit/ee357f7))
- **catalog:** Keep a placeholder's size to the advanced view ([11dbe53](https://github.com/AntelopeJS/dms-builder/commit/11dbe53))
- **palette:** Lay out the components as icon tiles ([a5ba986](https://github.com/AntelopeJS/dms-builder/commit/a5ba986))
- **panels:** Set a spacer up by the room it takes ([baf2a70](https://github.com/AntelopeJS/dms-builder/commit/baf2a70))
- **panels:** Pick and reach a block's table the same way in every panel ([4de4277](https://github.com/AntelopeJS/dms-builder/commit/4de4277))
- **panels:** Leave a form's fields to its table ([b4a0b84](https://github.com/AntelopeJS/dms-builder/commit/b4a0b84))
- **panels:** Pick an icon option by sight, as a page's icon is picked ([40570e4](https://github.com/AntelopeJS/dms-builder/commit/40570e4))
- **panels:** Set a tree up without JSON or methods ([941263d](https://github.com/AntelopeJS/dms-builder/commit/941263d))
- **trees:** Build a tree from the page's tables ([49a0785](https://github.com/AntelopeJS/dms-builder/commit/49a0785))
- **canvas:** Place a tab set with a first tab already in it ([7015301](https://github.com/AntelopeJS/dms-builder/commit/7015301))
- **panels:** Set a tab set up one line per tab ([a07ca90](https://github.com/AntelopeJS/dms-builder/commit/a07ca90))
- **panels:** Offer two rows of icons before anything is searched ([2fde83b](https://github.com/AntelopeJS/dms-builder/commit/2fde83b))
- **panels:** Fold a KPI card's and a top list's settings behind a line each ([08b856f](https://github.com/AntelopeJS/dms-builder/commit/08b856f))
- **editor:** Rebuild the frame: side rail, inspector and workspaces ([500b6b2](https://github.com/AntelopeJS/dms-builder/commit/500b6b2))
- **editor:** Restyle the palette, pages and block menu to the v2 design ([5e90bf8](https://github.com/AntelopeJS/dms-builder/commit/5e90bf8))
- **inspector:** Tab block settings, stage page settings in the draft ([71ee252](https://github.com/AntelopeJS/dms-builder/commit/71ee252))
- **workspaces:** Lay tables and data sources out as list and detail ([bbc9c13](https://github.com/AntelopeJS/dms-builder/commit/bbc9c13))
- **editor:** Keep the draft on this device, and ask before leaving ([b3a8325](https://github.com/AntelopeJS/dms-builder/commit/b3a8325))
- **api:** Table usage, page deletion impact and the permission list ([91e9f55](https://github.com/AntelopeJS/dms-builder/commit/91e9f55))
- **api:** Read who reaches a page and each of its blocks ([2194142](https://github.com/AntelopeJS/dms-builder/commit/2194142))
- **editor:** Say which roles a block reaches, and what a save takes ([a9688d4](https://github.com/AntelopeJS/dms-builder/commit/a9688d4))
- **editor:** View the draft as a role sees it ([514d84d](https://github.com/AntelopeJS/dms-builder/commit/514d84d))
- **palette:** Lay the blocks out as tiles again, the list on request ([e395d6c](https://github.com/AntelopeJS/dms-builder/commit/e395d6c))
- **editor:** Write section rows and content guards for the author ([9177371](https://github.com/AntelopeJS/dms-builder/commit/9177371))
- **editor:** Place the period selector and the live switch for the page ([600a5d3](https://github.com/AntelopeJS/dms-builder/commit/600a5d3))
- **tables:** Give a table its icon from the builder, through @TableIcon ([ae61f46](https://github.com/AntelopeJS/dms-builder/commit/ae61f46))
- **editor:** Make the blocks readable to someone who does not code ([9cb3215](https://github.com/AntelopeJS/dms-builder/commit/9cb3215))

### 🩹 Fixes

- **deps:** Relax @antelopejs/interface-database to >=0.1.7 <1.0.0 ([#28](https://github.com/AntelopeJS/dms-builder/pull/28))
- **deps:** Cap @antelopejs/interface-dms-builder below the next minor and check interface ranges ([#32](https://github.com/AntelopeJS/dms-builder/pull/32))
- **canvas:** Draw a chart card's chart on the page being built ([5b51ffe](https://github.com/AntelopeJS/dms-builder/commit/5b51ffe))
- **pages:** Wait for a page's route before opening it from the tree ([05021f5](https://github.com/AntelopeJS/dms-builder/commit/05021f5))
- **canvas:** Draw the selection frame inside the block ([00cd982](https://github.com/AntelopeJS/dms-builder/commit/00cd982))
- **catalog:** Offer no factory the builder could not write a call to ([3904de1](https://github.com/AntelopeJS/dms-builder/commit/3904de1))
- **canvas:** Follow the draft where the canvas drew the saved page ([81b001d](https://github.com/AntelopeJS/dms-builder/commit/81b001d))
- **canvas:** Follow a spacer's size and a table's row actions as edited ([51fea3e](https://github.com/AntelopeJS/dms-builder/commit/51fea3e))
- **spacer:** Make "all the free room" take columns or lines ([b8e6c11](https://github.com/AntelopeJS/dms-builder/commit/b8e6c11))
- **editor:** Keep drafts through direct writes, report failed requests ([5500e5d](https://github.com/AntelopeJS/dms-builder/commit/5500e5d))

### 💅 Refactors

- **chart-card:** Drop the data preview from the panel ([d8021e2](https://github.com/AntelopeJS/dms-builder/commit/d8021e2))
- **trees:** Remove the tree builder, gone from the DMS ([bd779a1](https://github.com/AntelopeJS/dms-builder/commit/bd779a1))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.3 ([22968b6](https://github.com/AntelopeJS/dms-builder/commit/22968b6))
- **release:** @antelopejs/dms-builder v0.2.4 ([4899251](https://github.com/AntelopeJS/dms-builder/commit/4899251))
- **release:** @antelopejs/dms-builder v0.2.5 ([38d06d6](https://github.com/AntelopeJS/dms-builder/commit/38d06d6))
- **release:** @antelopejs/dms-builder v0.2.6 ([69b0cc2](https://github.com/AntelopeJS/dms-builder/commit/69b0cc2))
- **playground:** Open module source ranges ([#33](https://github.com/AntelopeJS/dms-builder/pull/33))
- **playground:** Script a test owner account to sign in with ([00258c0](https://github.com/AntelopeJS/dms-builder/commit/00258c0))

### 🎨 Styles

- **banners:** Lay the strips out like the DMS's role preview bar ([3a74bd8](https://github.com/AntelopeJS/dms-builder/commit/3a74bd8))

### 🤖 CI

- Speed up pipeline ([#37](https://github.com/AntelopeJS/dms-builder/pull/37))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Glastis <glastis@glastis.com>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.1.3

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.2...v0.1.3)

### 🩹 Fixes

- **db:** Index relation columns by default and refuse deleting a referenced resource ([#26](https://github.com/AntelopeJS/dms-builder/pull/26))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.2 ([88f388e](https://github.com/AntelopeJS/dms-builder/commit/88f388e))
- **playground:** Move to @antelopejs/dms-frontend 0.3.2 ([#27](https://github.com/AntelopeJS/dms-builder/pull/27))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.2

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.1...v0.1.2)

### 🚀 Enhancements

- Configure a chart's data without writing a route ([#9](https://github.com/AntelopeJS/dms-builder/pull/9))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.1 ([5627d59](https://github.com/AntelopeJS/dms-builder/commit/5627d59))

### ❤️ Contributors

- Fabrice Cst <fabrice@altab.be>

## v0.1.1

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.0...v0.1.1)

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.0 ([6691db5](https://github.com/AntelopeJS/dms-builder/commit/6691db5))

## v0.1.0

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.0.2...v0.1.0)

### 🩹 Fixes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#4](https://github.com/AntelopeJS/dms-builder/pull/4))
- **frontend:** ⚠️  Register the frontend module under its package name ([#5](https://github.com/AntelopeJS/dms-builder/pull/5))
- **builder:** Gate the builder on the project's development mode ([#11](https://github.com/AntelopeJS/dms-builder/pull/11))
- **queries:** Register the count and aggregate query templates ([#21](https://github.com/AntelopeJS/dms-builder/pull/21))

### 💅 Refactors

- **frontend:** Route both builder navigations through one dev-reload helper ([#3](https://github.com/AntelopeJS/dms-builder/pull/3))
- **frontend:** Import the SDK through #dms/frontend-module ([#12](https://github.com/AntelopeJS/dms-builder/pull/12))
- **build:** Merge tsconfig.build.json into tsconfig.json ([#16](https://github.com/AntelopeJS/dms-builder/pull/16))
- **package:** ⚠️  Drop moduleResolution node support and consumer compile checks ([#19](https://github.com/AntelopeJS/dms-builder/pull/19))
- Remove dead exports reported by knip ([#20](https://github.com/AntelopeJS/dms-builder/pull/20))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.0.2 ([b9b4acc](https://github.com/AntelopeJS/dms-builder/commit/b9b4acc))
- **release:** @antelopejs/dms-builder v0.1.0 ([d0e2236](https://github.com/AntelopeJS/dms-builder/commit/d0e2236))
- **release:** @antelopejs/dms-builder v0.1.1 ([50e5a87](https://github.com/AntelopeJS/dms-builder/commit/50e5a87))
- Require @antelopejs/core 1.7 ([#8](https://github.com/AntelopeJS/dms-builder/pull/8))
- Align community files with the organization defaults ([#10](https://github.com/AntelopeJS/dms-builder/pull/10))
- **release:** @antelopejs/dms-builder v0.1.2 ([1ca7af9](https://github.com/AntelopeJS/dms-builder/commit/1ca7af9))
- Migrate frontend CLI and core version ([#13](https://github.com/AntelopeJS/dms-builder/pull/13))
- Remove obsolete playground script ([#14](https://github.com/AntelopeJS/dms-builder/pull/14))
- **release:** @antelopejs/dms-builder v0.1.3 ([f710aaa](https://github.com/AntelopeJS/dms-builder/commit/f710aaa))

### 🤖 CI

- **release:** Release next from a dedicated branch and restore requireCommits ([#17](https://github.com/AntelopeJS/dms-builder/pull/17))
- **release:** Reference the shared release workflows through v1 ([#18](https://github.com/AntelopeJS/dms-builder/pull/18))

#### ⚠️ Breaking Changes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#4](https://github.com/AntelopeJS/dms-builder/pull/4))
- **frontend:** ⚠️  Register the frontend module under its package name ([#5](https://github.com/AntelopeJS/dms-builder/pull/5))
- **package:** ⚠️  Drop moduleResolution node support and consumer compile checks ([#19](https://github.com/AntelopeJS/dms-builder/pull/19))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.0.2

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.0.1...v0.0.2)

### 🏡 Chore

- Regenerate lockfiles against the published DMS packages ([#1](https://github.com/AntelopeJS/dms-builder/pull/1))
- **release:** Skip the npm auth pre-flight for trusted publishing ([#2](https://github.com/AntelopeJS/dms-builder/pull/2))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>


# Changelog

## v0.2.6

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.2.5...v0.2.6)

### 🚀 Enhancements

- **panels:** Lay out simple-mode block panels as cards ([8f798b5](https://github.com/AntelopeJS/dms-builder/commit/8f798b5))
- **palette:** Leave the charts a chart card draws with to the card ([b33f90c](https://github.com/AntelopeJS/dms-builder/commit/b33f90c))
- **frontend-vue:** Declare the @antelopejs/dms-frontend releases the layer supports ([#30](https://github.com/AntelopeJS/dms-builder/pull/30))
- **palette:** Leave the types the DMS never declared to the advanced view ([ee357f7](https://github.com/AntelopeJS/dms-builder/commit/ee357f7))
- **catalog:** Keep a placeholder's size to the advanced view ([11dbe53](https://github.com/AntelopeJS/dms-builder/commit/11dbe53))
- **palette:** Lay out the components as icon tiles ([a5ba986](https://github.com/AntelopeJS/dms-builder/commit/a5ba986))
- **panels:** Set a spacer up by the room it takes ([baf2a70](https://github.com/AntelopeJS/dms-builder/commit/baf2a70))

### 🩹 Fixes

- **canvas:** Draw a chart card's chart on the page being built ([5b51ffe](https://github.com/AntelopeJS/dms-builder/commit/5b51ffe))
- **pages:** Wait for a page's route before opening it from the tree ([05021f5](https://github.com/AntelopeJS/dms-builder/commit/05021f5))
- **canvas:** Draw the selection frame inside the block ([00cd982](https://github.com/AntelopeJS/dms-builder/commit/00cd982))
- **catalog:** Offer no factory the builder could not write a call to ([3904de1](https://github.com/AntelopeJS/dms-builder/commit/3904de1))

### 💅 Refactors

- **chart-card:** Drop the data preview from the panel ([d8021e2](https://github.com/AntelopeJS/dms-builder/commit/d8021e2))

### ❤️ Contributors

- Glastis <glastis@glastis.com>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.2.5

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.2.4...v0.2.5)

### 🩹 Fixes

- **deps:** Cap @antelopejs/interface-dms-builder below the next minor and check interface ranges ([#32](https://github.com/AntelopeJS/dms-builder/pull/32))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.4

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.2.3...v0.2.4)

### 🩹 Fixes

- **deps:** Relax @antelopejs/interface-database to >=0.1.7 <1.0.0 ([#28](https://github.com/AntelopeJS/dms-builder/pull/28))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.3

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.2.2...v0.2.3)

### 🩹 Fixes

- **db:** Index relation columns by default and refuse deleting a referenced resource ([#26](https://github.com/AntelopeJS/dms-builder/pull/26))

### 🏡 Chore

- **playground:** Move to @antelopejs/dms-frontend 0.3.2 ([#27](https://github.com/AntelopeJS/dms-builder/pull/27))
- **release:** @antelopejs/interface-dms-builder v0.1.3 ([9443693](https://github.com/AntelopeJS/dms-builder/commit/9443693))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.2

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.2.1...v0.2.2)

### 🚀 Enhancements

- Configure a chart's data without writing a route ([#9](https://github.com/AntelopeJS/dms-builder/pull/9))

### 🏡 Chore

- **release:** @antelopejs/interface-dms-builder v0.1.2 ([3092f3d](https://github.com/AntelopeJS/dms-builder/commit/3092f3d))

### ❤️ Contributors

- Fabrice Cst <fabrice@altab.be>

## v0.2.1

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.2.0...v0.2.1)

### 🏡 Chore

- **release:** @antelopejs/interface-dms-builder v0.1.1 ([7e7a7fd](https://github.com/AntelopeJS/dms-builder/commit/7e7a7fd))

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.1.3...v0.2.0)

### 🩹 Fixes

- **queries:** Register the count and aggregate query templates ([#21](https://github.com/AntelopeJS/dms-builder/pull/21))

### 💅 Refactors

- **build:** Merge tsconfig.build.json into tsconfig.json ([#16](https://github.com/AntelopeJS/dms-builder/pull/16))
- **package:** ⚠️  Drop moduleResolution node support and consumer compile checks ([#19](https://github.com/AntelopeJS/dms-builder/pull/19))
- Remove dead exports reported by knip ([#20](https://github.com/AntelopeJS/dms-builder/pull/20))

### 🏡 Chore

- **release:** @antelopejs/interface-dms-builder v0.1.0 ([efe5270](https://github.com/AntelopeJS/dms-builder/commit/efe5270))

### 🤖 CI

- **release:** Release next from a dedicated branch and restore requireCommits ([#17](https://github.com/AntelopeJS/dms-builder/pull/17))
- **release:** Reference the shared release workflows through v1 ([#18](https://github.com/AntelopeJS/dms-builder/pull/18))

#### ⚠️ Breaking Changes

- **package:** ⚠️  Drop moduleResolution node support and consumer compile checks ([#19](https://github.com/AntelopeJS/dms-builder/pull/19))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.3

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.1.2...v0.1.3)

### 🏡 Chore

- Migrate frontend CLI and core version ([#13](https://github.com/AntelopeJS/dms-builder/pull/13))
- Remove obsolete playground script ([#14](https://github.com/AntelopeJS/dms-builder/pull/14))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.2

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.1.1...v0.1.2)

### 🩹 Fixes

- **builder:** Gate the builder on the project's development mode ([#11](https://github.com/AntelopeJS/dms-builder/pull/11))

### 💅 Refactors

- **frontend:** Import the SDK through #dms/frontend-module ([#12](https://github.com/AntelopeJS/dms-builder/pull/12))

### 🏡 Chore

- Require @antelopejs/core 1.7 ([#8](https://github.com/AntelopeJS/dms-builder/pull/8))
- Align community files with the organization defaults ([#10](https://github.com/AntelopeJS/dms-builder/pull/10))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.1

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.1.0...v0.1.1)

## v0.1.0

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/v0.0.2...v0.1.0)

### 🩹 Fixes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#4](https://github.com/AntelopeJS/dms-builder/pull/4))
- **frontend:** ⚠️  Register the frontend module under its package name ([#5](https://github.com/AntelopeJS/dms-builder/pull/5))

### 💅 Refactors

- **frontend:** Route both builder navigations through one dev-reload helper ([#3](https://github.com/AntelopeJS/dms-builder/pull/3))

#### ⚠️ Breaking Changes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#4](https://github.com/AntelopeJS/dms-builder/pull/4))
- **frontend:** ⚠️  Register the frontend module under its package name ([#5](https://github.com/AntelopeJS/dms-builder/pull/5))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.0.2

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.0.2...v0.0.2)


const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dmsBuilder = require(path.join(root, "package.json"));
const interfaceRoot = path.resolve(root, "../interface-dms-builder");
const interfacePackage = require(path.join(interfaceRoot, "package.json"));
const frontendLayer = require(path.join(root, "frontend-vue/package.json"));

const RENDERER_PACKAGE = "@antelopejs/dms-frontend";
const RENDERER_LOCKFILES = [
  "frontend-vue/pnpm-lock.yaml",
  "playground/pnpm-lock.yaml",
];
const LOCKED_RENDERER = /^ {2}'@antelopejs\/dms-frontend@([^'(]+)':$/gm;
const ENGINE_RANGE = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/;
const IMPLEMENTED_RANGE = /^>=(0\.(\d+)\.\d+) <(0\.(\d+)\.0)$/;
const FLEET_RANGE = /^>=\d+\.\d+\.\d+ <1\.0\.0$/;

function compareVersions(a, b) {
  const parts = (version) => version.split("-")[0].split(".").map(Number);
  const [x, y] = [parts(a), parts(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/**
 * The module implements the interface, so it caps it below the next minor
 * (`>=<floor> <0.<minor+1>.0`): a breaking interface minor must never reach a
 * module that does not implement it.
 */
function satisfiesImplementedRange(version, range) {
  const match = IMPLEMENTED_RANGE.exec(range ?? "");
  if (!match || Number(match[4]) !== Number(match[2]) + 1) return false;
  return (
    compareVersions(version, match[1]) >= 0 &&
    compareVersions(version, match[3]) < 0
  );
}

/**
 * The layer's engine shape is `>=<floor> <<ceiling>`, the ceiling being the
 * next breaking loader release. A prerelease counts as the release it leads
 * to, as the loader counts it.
 */
function satisfiesEngineRange(version, range) {
  const bounds = ENGINE_RANGE.exec(range ?? "");
  if (bounds === null) return false;
  const [, floor, ceiling] = bounds;
  return (
    compareVersions(version, floor) >= 0 &&
    compareVersions(version, ceiling) < 0
  );
}

function lockedRenderers(lockfile) {
  const source = fs.readFileSync(path.join(root, lockfile), "utf8");
  return [...source.matchAll(LOCKED_RENDERER)].map(([, version]) => version);
}

function interfaceIsPublishable() {
  const failures = [];
  if (interfacePackage.name !== "@antelopejs/interface-dms-builder") {
    failures.push(`the interface is named ${interfacePackage.name}`);
  }
  if (
    interfacePackage.peerDependencies["@antelopejs/interface-core"] !==
    ">=0.2.4 <1.0.0"
  ) {
    failures.push(
      "the interface does not peer on interface-core >=0.2.4 <1.0.0",
    );
  }
  const entry = interfacePackage.exports["."];
  if (
    entry?.types !== "./dist/index.d.ts" ||
    entry?.default !== "./dist/index.js"
  ) {
    failures.push("the interface root export is not dist/index");
  }
  for (const published of ["dist", "docs"]) {
    if (!interfacePackage.files.includes(published)) {
      failures.push(`the interface does not publish ${published}`);
    }
  }
  if (
    !satisfiesImplementedRange(
      interfacePackage.version,
      dmsBuilder.dependencies["@antelopejs/interface-dms-builder"],
    )
  ) {
    failures.push(
      `the interface ${interfacePackage.version} does not satisfy the published range`,
    );
  }
  return failures;
}

/**
 * A runtime package carries an implementation, not a contract: depending on one
 * couples this module to another module's build rather than to the interface it
 * answers. Interfaces are the only cross-module runtime dependency.
 */
function noRuntimeDependency() {
  return Object.keys(dmsBuilder.dependencies)
    .filter(
      (name) =>
        name.startsWith("@antelopejs/dms") && !name.includes("interface"),
    )
    .map((name) => `dependencies holds the DMS runtime package ${name}`);
}

function interfaceIsNotOwned() {
  const failures = [];
  if (dmsBuilder.exports["./interfaces/dms-builder"] !== undefined) {
    failures.push("the package exports ./interfaces/dms-builder");
  }
  const files = fs
    .readdirSync(path.join(root, "src"), { recursive: true })
    .filter((file) => file.endsWith(".ts"));
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, "src", file), "utf8");
    if (source.includes("interfaces/dms-builder")) {
      failures.push(`src/${file} names interfaces/dms-builder`);
    }
  }
  return failures;
}

/**
 * The `./*` pattern exports every flat module of `dist`. The interface builds
 * to a flat `dist`, but a directory with an index would need its own entry --
 * Node does not fall back to one inside a pattern.
 */
function everyBuiltModuleIsExported() {
  const dist = path.join(interfaceRoot, "dist");
  if (!fs.statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
    return [
      `${dist} is missing: build the interface before running this check.`,
    ];
  }
  const failures = [];
  const wildcard = interfacePackage.exports["./*"];
  if (
    wildcard?.types !== "./dist/*.d.ts" ||
    wildcard?.default !== "./dist/*.js"
  ) {
    failures.push("the interface ./* export is not dist/*");
  }
  const entries = fs.readdirSync(dist, { recursive: true, encoding: "utf8" });
  for (const entry of entries) {
    if (!entry.endsWith(`${path.sep}index.js`)) continue;
    const subpath = `./${path.dirname(entry).split(path.sep).join("/")}`;
    if (interfacePackage.exports[subpath] === undefined) {
      failures.push(`${subpath} is built but not exported`);
    }
  }
  return failures;
}

/**
 * `^0.0.1` means `>=0.0.1 <0.0.2`. Every DMS package is at 0.0.x, so a caret
 * pins them to one patch, and `@antelopejs/core` refuses to start when a
 * module's range does not admit the interface version the project installed.
 * The fleet range is `>=<floor> <1.0.0`. The interfaces this module implements
 * are the exception: they are capped below the next minor.
 */
function packagesAreDependedOnByRange() {
  const failures = [];
  for (const manifest of [dmsBuilder, frontendLayer]) {
    const implemented = manifest.antelopeJs?.implements ?? [];
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (!/^@antelopejs\/(dms|interface-dms)/.test(name)) continue;
        const accepted = implemented.includes(name)
          ? IMPLEMENTED_RANGE.test(range)
          : FLEET_RANGE.test(range);
        if (!accepted)
          failures.push(`${manifest.name} ${field} ${name}@${range}`);
      }
    }
  }
  return failures;
}

/**
 * The loader refuses a frontend module whose range excludes its own release,
 * and only warns about one that declares none (AntelopeJS/dms-frontend#46).
 */
function layerDeclaresLoaderRange() {
  const range = frontendLayer.engines?.[RENDERER_PACKAGE] ?? "";
  return ENGINE_RANGE.test(range)
    ? []
    : [
        `the frontend layer declares no loader range (${JSON.stringify(range)})`,
      ];
}

function layerAdmitsLockedLoaders() {
  const range = frontendLayer.engines?.[RENDERER_PACKAGE];
  const locked = RENDERER_LOCKFILES.flatMap(lockedRenderers);
  if (locked.length === 0) return ["no lockfile locks the loader"];
  return locked
    .filter((version) => !satisfiesEngineRange(version, range))
    .map(
      (version) =>
        `the layer range ${range} excludes the locked loader ${version}`,
    );
}

const failures = [
  interfaceIsPublishable,
  noRuntimeDependency,
  interfaceIsNotOwned,
  everyBuiltModuleIsExported,
  packagesAreDependedOnByRange,
  layerDeclaresLoaderRange,
  layerAdmitsLockedLoaders,
].flatMap((check) => check().map((failure) => `${check.name}: ${failure}`));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}

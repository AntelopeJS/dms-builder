const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dmsBuilder = require(path.join(root, "package.json"));
const interfacePackage = require(
  path.resolve(root, "../interface-dms-builder/package.json"),
);

const PUBLIC_REGISTRY = "https://registry.npmjs.org/";
const REPOSITORY = "git+https://github.com/AntelopeJS/dms-builder.git";

/**
 * The fleet shape is `>=<floor> <1.0.0`: the ceiling is out of reach for a 0.x
 * package, so comparing the release triples against the floor is enough.
 */
function compareVersions(a, b) {
  const parts = (version) => version.split("-")[0].split(".").map(Number);
  const [x, y] = [parts(a), parts(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

function satisfiesFleetRange(version, range) {
  const floor = /^>=(\d+\.\d+\.\d+) <1\.0\.0$/.exec(range ?? "")?.[1];
  return floor !== undefined && compareVersions(version, floor) >= 0;
}

test("both packages publish publicly from this repository", () => {
  for (const pkg of [dmsBuilder, interfacePackage]) {
    assert.equal(pkg.private, undefined);
    assert.equal(pkg.license, "Apache-2.0");
    assert.equal(pkg.repository.url, REPOSITORY);
    assert.deepEqual(pkg.publishConfig, {
      access: "public",
      provenance: true,
      registry: PUBLIC_REGISTRY,
    });
  }
});

test("the interface is a separately publishable workspace package", () => {
  assert.equal(interfacePackage.name, "@antelopejs/interface-dms-builder");
  assert.equal(
    interfacePackage.peerDependencies["@antelopejs/interface-core"],
    ">=0.1.1 <1.0.0",
  );
  assert.deepEqual(interfacePackage.exports["."], {
    types: "./dist/index.d.ts",
    default: "./dist/index.js",
  });
  assert.equal(interfacePackage.files.includes("dist"), true);
  assert.equal(interfacePackage.files.includes("docs"), true);
  // The interface in this tree only has to satisfy the published range: a floor
  // that lags it widens what consumers may install, it never pulls a second copy.
  assert.equal(
    satisfiesFleetRange(
      interfacePackage.version,
      dmsBuilder.dependencies["@antelopejs/interface-dms-builder"],
    ),
    true,
  );
});

test("the module manifest names the interface package, not the module", () => {
  assert.equal(dmsBuilder.name, "@antelopejs/dms-builder");
  assert.deepEqual(dmsBuilder.antelopeJs.implements, [
    "@antelopejs/interface-dms-builder",
  ]);
});

/**
 * A runtime package carries an implementation, not a contract: depending on one
 * couples this module to another module's build rather than to the interface it
 * answers. Interfaces are the only cross-module runtime dependency.
 */
test("nothing in dependencies is a DMS runtime package", () => {
  const runtime = Object.keys(dmsBuilder.dependencies).filter(
    (name) => name.startsWith("@antelopejs/dms") && !name.includes("interface"),
  );
  assert.deepEqual(runtime, []);
});

test("the implementation package does not own or re-export its interface", () => {
  assert.equal(dmsBuilder.exports["./interfaces/dms-builder"], undefined);

  const sources = fs
    .readdirSync(path.join(root, "src"), { recursive: true })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => fs.readFileSync(path.join(root, "src", file), "utf8"));
  assert.equal(
    sources.some((source) => source.includes("interfaces/dms-builder")),
    false,
  );
});

/**
 * The `./*` pattern exports every flat module of `dist`. The interface builds
 * to a flat `dist`, but a directory with an index would need its own entry --
 * Node does not fall back to one inside a pattern.
 */
test("every module the interface builds is exported", () => {
  const dist = path.resolve(root, "../interface-dms-builder/dist");
  assert.ok(
    fs.statSync(dist, { throwIfNoEntry: false })?.isDirectory(),
    `${dist} is missing: build the interface before running this test.`,
  );
  assert.deepEqual(interfacePackage.exports["./*"], {
    types: "./dist/*.d.ts",
    default: "./dist/*.js",
  });

  const entries = fs.readdirSync(dist, { recursive: true, encoding: "utf8" });
  const directoryIndexes = entries
    .filter((entry) => entry.endsWith(`${path.sep}index.js`))
    .map((entry) => `./${path.dirname(entry).split(path.sep).join("/")}`);
  const missing = directoryIndexes.filter(
    (subpath) => interfacePackage.exports[subpath] === undefined,
  );
  assert.deepEqual(missing, []);
});

/**
 * `^0.0.1` means `>=0.0.1 <0.0.2`. Every DMS package is at 0.0.x, so a caret
 * pins them to one patch, and `@antelopejs/core` refuses to start when a
 * module's range does not admit the interface version the project installed.
 * The fleet range is the same one the other `@antelopejs/interface-*` packages
 * use, including the sibling interface: pnpm links it inside the workspace
 * through `link-workspace-packages`, the published manifest keeps the range.
 */
test("DMS packages are depended on by range, not by patch", () => {
  const manifests = [
    dmsBuilder,
    require(path.join(root, "frontend-vue/package.json")),
  ];
  const wrong = manifests.flatMap((manifest) =>
    ["dependencies", "devDependencies", "peerDependencies"].flatMap((field) =>
      Object.entries(manifest[field] ?? {})
        .filter(([name]) => /^@antelopejs\/(dms|interface-dms)/.test(name))
        .filter(([, range]) => !/^>=\d+\.\d+\.\d+ <1\.0\.0$/.test(range))
        .map(([name, range]) => `${manifest.name} ${field} ${name}@${range}`),
    ),
  );
  assert.deepEqual(wrong, []);
});

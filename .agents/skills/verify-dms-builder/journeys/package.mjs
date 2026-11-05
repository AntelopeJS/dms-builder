import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guarded } from "../guard.mjs";
import { check, isRow, list, pick, text } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

/**
 * The files `npm pack` would publish for a package folder of the checkout.
 *
 * @param {Ctx} ctx The journey
 * @param {string} folder The package folder under the checkout
 * @returns {{ files: string[], manifest: Record<string, unknown> }} The packed paths and the manifest
 */
function packed(ctx, folder) {
  const cwd = join(ctx.state.repo ?? ctx.state.moduleRoot, folder);
  const run = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  /** @type {unknown} */
  const parsed = JSON.parse(run.stdout || "[]");
  const first = list(parsed)[0];
  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  return { files: list(first, "files").map((file) => text(file, "path")), manifest: isRow(manifest) ? manifest : {} };
}

/**
 * The range a 0.x dependant accepts of a 0.x package: its minor from `.0`, below the next minor.
 *
 * @param {string} version The package's version, for example `0.4.0`
 * @returns {string} For example `>=0.4.0 <0.5.0`
 */
function minorRange(version) {
  const [major, minor] = version.split(".").map(Number);
  return `>=${major}.${minor}.0 <${major}.${(minor ?? 0) + 1}.0`;
}

export const journeys = guarded([
  {
    id: "the-module-and-the-interface-tarballs-hold-what-their-manifests-name",
    title: "The module package ships its build, frontend layer, skill, README and licence and not its tests; the interface ships its build and docs; both manifests name entry points that the tarballs hold",
    entryPoint: "npm pack of packages/dms-builder and packages/interface-dms-builder",
    async run(/** @type {Ctx} */ ctx) {
      const module = packed(ctx, "packages/dms-builder");
      const contract = packed(ctx, "packages/interface-dms-builder");
      const has = (/** @type {string[]} */ files, /** @type {string} */ path) => files.includes(path);
      await ctx.verify("the module tarball", [
        check("main and types point at files in the tarball", has(module.files, text(module.manifest, "main")) && has(module.files, text(module.manifest, "types")), [module.manifest.main, module.manifest.types]),
        check("the dashboard layer is shipped", module.files.some((file) => file.startsWith("frontend-vue/app/components/")) && has(module.files, "frontend-vue/dms.frontend.ts"), module.files.filter((file) => file.startsWith("frontend-vue")).length),
        check("the frontend module entry exists", has(module.files, text(module.manifest, "dmsFrontend")), module.manifest.dmsFrontend),
        check("the skill and its cases are shipped", has(module.files, "skills/dms-builder/SKILL.md") && has(module.files, "skills/dms-builder/cases.json"), module.files.filter((file) => file.startsWith("skills"))),
        check("README and LICENSE are shipped", has(module.files, "README.md") && has(module.files, "LICENSE"), "files"),
        check("the compiled tests are not shipped", !module.files.some((file) => file.startsWith("dist/test")), module.files.filter((file) => file.includes("test")).slice(0, 3)),
        check("the manifest declares the skills folder and the interface it implements", JSON.stringify(pick(module.manifest, "antelopeJs", "skills")) === '["./skills"]' && JSON.stringify(pick(module.manifest, "antelopeJs", "implements")) === '["@antelopejs/interface-dms-builder"]', pick(module.manifest, "antelopeJs")),
      ]);
      await ctx.verify("the interface tarball", [
        check("main and types point at files in the tarball", has(contract.files, text(contract.manifest, "main")) && has(contract.files, text(contract.manifest, "types")), [contract.manifest.main, contract.manifest.types]),
        check("the docs are shipped", contract.files.filter((file) => file.startsWith("docs/")).length >= 11, contract.files.filter((file) => file.startsWith("docs/")).length),
        check("the sources are not shipped", !contract.files.some((file) => file.startsWith("src/")), contract.files.filter((file) => file.startsWith("src/")).slice(0, 2)),
        check("the module depends on the interface from its released minor up to the next", text(module.manifest, "dependencies", "@antelopejs/interface-dms-builder") === minorRange(text(contract.manifest, "version")), [pick(module.manifest, "dependencies"), text(contract.manifest, "version")]),
      ]);
    },
  },
  {
    id: "the-skill-cases-name-existing-skills",
    title: "The shipped skill has frontmatter naming dms-builder and its cases file lists cases that expect skills which exist",
    entryPoint: "packages/dms-builder/skills/dms-builder",
    async run(/** @type {Ctx} */ ctx) {
      const folder = join(ctx.state.repo ?? ctx.state.moduleRoot, "packages/dms-builder/skills/dms-builder");
      const skill = readFileSync(join(folder, "SKILL.md"), "utf8");
      /** @type {unknown} */
      const cases = JSON.parse(readFileSync(join(folder, "cases.json"), "utf8"));
      const rows = list(cases, "cases");
      await ctx.verify("the skill and its cases", [
        check("the frontmatter names dms-builder and describes when to use it", /^---\nname: dms-builder\ndescription: .*Use when/s.test(skill), skill.slice(0, 120)),
        check("every case has an id, a prompt and an expected skill", rows.length > 0 && rows.every((row) => text(row, "id") !== "" && text(row, "prompt") !== "" && Array.isArray(pick(row, "expect", "skills"))), rows.length),
        check("case ids are unique", new Set(rows.map((row) => text(row, "id"))).size === rows.length, rows.length),
      ]);
    },
  },
]);

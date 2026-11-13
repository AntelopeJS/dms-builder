/** A kind of one-way door. */
export type DoorKind = "data" | "format" | "contract" | "outbound" | "exposure" | "publish";

/** Path rules for one door kind: globs and declared funnel modules. */
export interface DoorRule {
  globs: string[];
  funnels: string[];
  why: string;
}

/**
 * How the gate decides whether a diff changed what the covered code does:
 * `emit` compares the JavaScript statements of the covered files on the
 * base and on HEAD (types, comments, formatting, imports and export
 * keywords left out); `probe` runs a command on a checkout of each, the
 * checkout's path as last argument, and compares what it prints.
 */
export type Behaviour = { kind: "emit" } | { kind: "probe"; command: string[] };

/**
 * A formal check: the source files it covers, the check's own files, the
 * command that runs it, how its output names a violated and a passing rule,
 * how the gate decides that a diff changed the covered behaviour, and the
 * command run on the base when it did or when the check's own files changed
 * (`command` when absent).
 */
export interface FormalCheck {
  name: string;
  covers: string[];
  files: string[];
  command: string[];
  baseCommand?: string[];
  violation: RegExp | null;
  passing: RegExp | null;
  behaviour: Behaviour;
}

/** The repo-owned layer of the verification skill, read by `dms-control`. */
export interface VerifyConfig {
  playground: string;
  prepare: string[][];
  userFacing: string[];
  notUserFacing: string[];
  smoke: string;
  smokeJourney: string;
  doors: Record<DoorKind, DoorRule | null>;
  formal: FormalCheck[];
}

const SKILL = ".agents/skills/verify-dms-builder";
const MODULE = "packages/dms-builder";
const INTERFACE = "packages/interface-dms-builder";

const config: VerifyConfig = {
  playground: `${SKILL}/playground`,
  prepare: [
    ["pnpm", "install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
    ["pnpm", "run", "build"],
    ["pnpm", "--dir", `${SKILL}/playground`, "install", "--ignore-workspace", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
    [`${SKILL}/playground/node_modules/.bin/tsc`, "-p", `${SKILL}/playground/tsconfig.build.json`],
  ],
  userFacing: [`${MODULE}/src/**`, `${MODULE}/frontend-vue/**`, `${MODULE}/skills/**`, `${MODULE}/package.json`, `${INTERFACE}/src/**`, `${INTERFACE}/package.json`],
  notUserFacing: [
    `${MODULE}/src/test/**`,
    `${MODULE}/frontend-vue/tests/**`,
    `${MODULE}/frontend-vue/.*`,
    `${MODULE}/frontend-vue/eslint.config.mjs`,
    `${MODULE}/frontend-vue/vitest.config.ts`,
    `${MODULE}/frontend-vue/pnpm-lock.yaml`,
  ],
  smoke: "smoke",
  smokeJourney: "onboard, open the Board page in the builder, retitle its Revenue card, save, and read the new title back from the page source and the structure API",
  doors: {
    data: {
      globs: [
        `${MODULE}/src/implementations/dms-builder/engine/page-delete.ts`,
        `${MODULE}/src/implementations/dms-builder/engine/resource-ops-delete.ts`,
        `${MODULE}/src/implementations/dms-builder/engine/ops-categories.ts`,
        `${MODULE}/src/implementations/dms-builder/engine/database-connection-remove.ts`,
        `${MODULE}/src/implementations/dms-builder/engine/project-config-remove.ts`,
      ],
      funnels: [],
      why: "these delete project source files, tables and their rows, which a revert of the builder does not bring back",
    },
    format: {
      globs: [`${MODULE}/src/implementations/dms-builder/engine/emit.ts`, `${MODULE}/src/implementations/dms-builder/engine/resource-emit.ts`, `${MODULE}/src/implementations/dms-builder/engine/resource-emit-types.ts`, `${MODULE}/src/implementations/dms-builder/engine/query-emit.ts`, `${MODULE}/src/implementations/dms-builder/engine/query-template-emit.ts`],
      funnels: [],
      why: "the source the builder writes into a project is read back by the next version of the builder and by the project's own build",
    },
    contract: {
      globs: [`${MODULE}/package.json`, `${MODULE}/src/routes/**`, `${MODULE}/src/config.ts`, `${INTERFACE}/package.json`, `${INTERFACE}/src/**`, `${MODULE}/frontend-vue/package.json`],
      funnels: [],
      why: "other modules import the interface, agents call the HTTP routes, and projects set the config keys and the renderer range",
    },
    outbound: null,
    exposure: {
      globs: [`${MODULE}/src/routes/**`, `${MODULE}/src/config.ts`, `${MODULE}/src/frontend-module.ts`, `${MODULE}/src/index.ts`],
      funnels: [],
      why: "these decide who may rewrite the project's sources and whether the builder is reachable at all",
    },
    publish: {
      globs: [`${MODULE}/package.json`, `${INTERFACE}/package.json`, `${MODULE}/.release-it.json`, `${INTERFACE}/.release-it.json`, `${MODULE}/changelogen.config.json`, `${INTERFACE}/changelogen.config.json`, ".github/workflows/release.yml"],
      funnels: [],
      why: "the package names, their files and the release workflows claim @antelopejs/dms-builder and @antelopejs/interface-dms-builder in the npm registry",
    },
  },
  formal: [
    {
      name: "formal-page-save",
      covers: [`${MODULE}/src/implementations/dms-builder/engine/ops.ts`, `${MODULE}/src/implementations/dms-builder/engine/writable.ts`, `${MODULE}/src/implementations/dms-builder/engine/page-draft.ts`, `${MODULE}/src/implementations/dms-builder/engine/page-structure.ts`, `${MODULE}/src/implementations/dms-builder/engine/source-index.ts`, `${MODULE}/frontend-vue/app/runtime/session-lifecycle.ts`, `${MODULE}/frontend-vue/app/runtime/session-site.ts`, `${MODULE}/frontend-vue/app/runtime/session-loaders.ts`, `${MODULE}/frontend-vue/app/runtime/draft.ts`],
      files: [".agents/skills/formal-page-save/**"],
      command: ["node", ".agents/skills/formal-page-save/check.mjs"],
      violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
      passing: /(?<=^holds +(?:\w+, )*)(\w+)(?=,| \()/gm,
      behaviour: { kind: "emit" },
    },
  ],
};

export default config;

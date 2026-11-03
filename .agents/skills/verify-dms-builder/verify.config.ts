/** A kind of one-way door. */
export type DoorKind = "data" | "format" | "contract" | "outbound" | "exposure" | "publish";

/** Path rules for one door kind: globs, declared funnel modules, and the journeys, as `feature/journey`, that contain it. */
export interface DoorRule {
  globs: string[];
  funnels: string[];
  containments: string[];
  why: string;
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
  formal: never[];
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
      containments: ["pages/delete-a-page-removes-its-file-and-import", "resources/delete-resource-removes-its-files-imports-and-rows"],
      why: "these delete project source files, tables and their rows, which a revert of the builder does not bring back",
    },
    format: {
      globs: [`${MODULE}/src/implementations/dms-builder/engine/emit.ts`, `${MODULE}/src/implementations/dms-builder/engine/resource-emit.ts`, `${MODULE}/src/implementations/dms-builder/engine/resource-emit-types.ts`, `${MODULE}/src/implementations/dms-builder/engine/query-emit.ts`, `${MODULE}/src/implementations/dms-builder/engine/query-template-emit.ts`],
      funnels: [],
      containments: [],
      why: "the source the builder writes into a project is read back by the next version of the builder and by the project's own build",
    },
    contract: {
      globs: [`${MODULE}/package.json`, `${MODULE}/src/routes/**`, `${MODULE}/src/config.ts`, `${INTERFACE}/package.json`, `${INTERFACE}/src/**`, `${MODULE}/frontend-vue/package.json`],
      funnels: [],
      containments: [],
      why: "other modules import the interface, agents call the HTTP routes, and projects set the config keys and the renderer range",
    },
    outbound: null,
    exposure: {
      globs: [`${MODULE}/src/routes/**`, `${MODULE}/src/config.ts`, `${MODULE}/src/frontend-module.ts`, `${MODULE}/src/index.ts`],
      funnels: [],
      containments: ["http-api/every-route-needs-a-tenant-owner"],
      why: "these decide who may rewrite the project's sources and whether the builder is reachable at all",
    },
    publish: {
      globs: [`${MODULE}/package.json`, `${INTERFACE}/package.json`, `${MODULE}/.release-it.json`, `${INTERFACE}/.release-it.json`, `${MODULE}/changelogen.config.json`, `${INTERFACE}/changelogen.config.json`, ".github/workflows/release.yml", ".github/workflows/release-interface.yml"],
      funnels: [],
      containments: [],
      why: "the package names, their files and the release workflows claim @antelopejs/dms-builder and @antelopejs/interface-dms-builder in the npm registry",
    },
  },
  formal: [],
};

export default config;

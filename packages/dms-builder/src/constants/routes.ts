/**
 * Fixed rather than configurable: the builder UI ships in this package and
 * addresses these routes, so a per-app prefix would only let the two drift.
 */
export const DEFAULT_ROUTE_PREFIX = "/api/builder";

export const ROUTES = {
  status: "/status",
  catalog: "/catalog",
  pages: "/pages",
  categories: "/categories",
  category: "/category",
  page: "/page",
  pageConfigure: "/page/configure",
  blocks: "/page/blocks",
  preview: "/page/preview",
  resources: "/resources",
  resource: "/resource",
  resourceConfigure: "/resource/configure",
  fields: "/resource/fields",
  queryTemplates: "/query-templates",
  queries: "/queries",
  queryPreview: "/query-preview",
  dataSources: "/data-sources",
  tableUsage: "/tables/usage",
  pageImpact: "/page/impact",
  pageAccess: "/page/access",
  permissions: "/permissions",
  refresh: "/refresh",
  databaseConnections: "/database/connections",
  databaseAnalyse: "/database/analyse",
  databaseAnalysis: "/database/analysis",
  databaseMap: "/database/map",
  databaseMapping: "/database/mapping",
  databaseProject: "/database/project",
  databaseVariable: "/database/variable",
  databaseSample: "/database/sample",
  theme: "/theme",
  themeLayer: "/theme/layer",
} as const;

/**
 * Sized for a save that uploads one logo per slot and mode: eight files of up
 * to 512 KiB, a third larger once base64-encoded, plus the rest of the draft.
 */
export const THEME_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

/**
 * The parameter a GET of the query preview carries its query in, as JSON.
 * Mirrored in `frontend-vue/app/runtime/constants.ts`.
 */
export const QUERY_PREVIEW_PARAMETER = "query";

/**
 * The `@antelopejs/dms-frontend` releases this package's frontend modules run
 * on: from 0.6.0, the first to apply a layer's `app/app.config.ts` itself, up
 * to the next breaking release. Declared in `frontend-vue/package.json` and in
 * the `package.json` of a layer the builder creates; a test keeps them equal.
 */
export const FRONTEND_LOADER_RANGE = ">=0.6.0 <0.7.0";

export const FRONTEND_MODULE_NAME = "@antelopejs/dms-builder-frontend-vue";
export const FRONTEND_MODULE_CONFIG_KEY = "dmsBuilder";
export const FRONTEND_MODULE_DIR = "../frontend-vue";
export const FRONTEND_MODULE_PRIORITY = 100;
/**
 * Option the backend publishes in the frontend manifest so the Vue module can
 * tell an enabled builder from a stale build. Mirrored in
 * `frontend-vue/dms.frontend.ts`.
 */
export const FRONTEND_MODULE_ENABLED_OPTION = "enabled";

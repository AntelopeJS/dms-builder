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
  refresh: "/refresh",
} as const;

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

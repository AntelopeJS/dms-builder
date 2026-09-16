export const DEFAULT_ROUTE_PREFIX = "/api/builder";
export const PRODUCTION_ENV = "production";

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
  refresh: "/refresh",
} as const;

export const FRONTEND_MODULE_NAME = "dms-builder";
export const FRONTEND_MODULE_DIR = "../frontend-vue";
export const FRONTEND_MODULE_PRIORITY = 100;

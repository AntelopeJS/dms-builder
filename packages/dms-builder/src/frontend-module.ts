import path from "node:path";
import type { AddFrontendModuleOptions } from "@antelopejs/interface-dms/page";
import type { DmsBuilderConfig } from "./config";
import {
  FRONTEND_MODULE_CONFIG_KEY,
  FRONTEND_MODULE_DIR,
  FRONTEND_MODULE_ENABLED_OPTION,
  FRONTEND_MODULE_NAME,
  FRONTEND_MODULE_PRIORITY,
} from "./constants/routes";

/** What the registration knows besides the config. */
interface FrontendModuleContext {
  /** Whether the project runs in development, as the core reports it. */
  dev: boolean;
}

/**
 * Whether the builder is on: as configured, else in development only (see
 * `isBuilderEnabled`).
 */
export function builderEnabled(
  config: DmsBuilderConfig | undefined,
  dev: boolean,
): boolean {
  return config?.api?.enabled ?? dev;
}

/**
 * This module's frontend, from its configuration alone: the backend registers
 * it with `AddFrontendModule`, and `@antelopejs/dms-frontend` calls this same
 * function (declared as `dmsFrontend` in package.json) to build and start the
 * frontend without a backend. It reads nothing but its arguments.
 */
export function frontendModule(
  config: DmsBuilderConfig | undefined,
  { dev }: FrontendModuleContext,
): AddFrontendModuleOptions | undefined {
  if (!builderEnabled(config, dev)) return undefined;
  return {
    name: FRONTEND_MODULE_NAME,
    sourcePath: path.join(__dirname, FRONTEND_MODULE_DIR),
    renderer: { name: "vue", version: "3" },
    configKey: FRONTEND_MODULE_CONFIG_KEY,
    priority: FRONTEND_MODULE_PRIORITY,
    // Belt and braces: the module is only registered at all when the builder
    // is enabled, but a frontend can be built once and served later, so the
    // registration says so out loud and the module checks it before
    // registering its plugin.
    options: { [FRONTEND_MODULE_ENABLED_OPTION]: true },
  };
}

import { DEFAULT_ROUTE_PREFIX, PRODUCTION_ENV } from "./constants/routes";

/** Thresholds past which the emitter factors a sub-tree into a module-level const. */
export interface FactoringConfig {
  depthThreshold?: number;
  childCountThreshold?: number;
}

/** The HTTP API a builder UI talks to. */
export interface BuilderApiConfig {
  /**
   * Whether to register the routes. Defaults to `true` outside production: the
   * builder rewrites the app's own sources, which only exist in development.
   */
  enabled?: boolean;
}

/** Runtime configuration for the dms-builder engine. */
export interface DmsBuilderConfig {
  /** Absolute path to the app source root where page files live. */
  projectRoot?: string;
  factoring?: FactoringConfig;
  api?: BuilderApiConfig;
}

let moduleConfig: DmsBuilderConfig = {};

export function setModuleConfig(config?: DmsBuilderConfig): void {
  moduleConfig = config ?? {};
}

export function getModuleConfig(): DmsBuilderConfig {
  return moduleConfig;
}

/**
 * The builder edits the app's TypeScript sources, so its API has no business
 * being reachable in production. An explicit `api.enabled` overrides that.
 */
export function isApiEnabled(): boolean {
  const configured = moduleConfig.api?.enabled;
  return configured ?? process.env.NODE_ENV !== PRODUCTION_ENV;
}

/**
 * Fixed rather than configurable: the builder UI ships in this package and
 * addresses these routes, so a per-app prefix would only let the two drift.
 */
export function getRoutePrefix(): string {
  return DEFAULT_ROUTE_PREFIX;
}

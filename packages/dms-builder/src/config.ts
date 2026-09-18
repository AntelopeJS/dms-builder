import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { DEFAULT_ROUTE_PREFIX } from "./constants/routes";

/** Thresholds past which the emitter factors a sub-tree into a module-level const. */
export interface FactoringConfig {
  depthThreshold?: number;
  childCountThreshold?: number;
}

/** The HTTP API a builder UI talks to. */
export interface BuilderApiConfig {
  /**
   * Force the builder on or off. Unset, it follows the project's development
   * mode: on under `ajs project run` (with or without `-w`), off under
   * `ajs project start`, which runs a build.
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
let enabled: Promise<boolean> | undefined;

export function setModuleConfig(config?: DmsBuilderConfig): void {
  moduleConfig = config ?? {};
  enabled = undefined;
}

export function getModuleConfig(): DmsBuilderConfig {
  return moduleConfig;
}

async function resolveEnabled(): Promise<boolean> {
  const configured = moduleConfig.api?.enabled;
  if (configured !== undefined) {
    return configured;
  }
  const { dev } = await GetRuntimeInfo();
  return dev;
}

/**
 * Whether the builder — its HTTP API and its frontend module alike — is
 * available in this process.
 *
 * The builder edits the app's TypeScript sources, which exist only in a
 * development checkout, so the core's own development flag decides: the same
 * one the DMS uses for dev reload and for its `.antelope/dms-dev.json`
 * handshake. `NODE_ENV` is deliberately not consulted — nothing sets it on the
 * way to `ajs project start`, so a production deployment would have kept the
 * builder mounted. An explicit `api.enabled` overrides the default either way,
 * for an operator who really does want the builder on a running deployment.
 *
 * Memoized: the answer cannot change within a process, and both `construct()`
 * and `start()` ask.
 */
export function isBuilderEnabled(): Promise<boolean> {
  enabled ??= resolveEnabled();
  return enabled;
}

/**
 * Fixed rather than configurable: the builder UI ships in this package and
 * addresses these routes, so a per-app prefix would only let the two drift.
 */
export function getRoutePrefix(): string {
  return DEFAULT_ROUTE_PREFIX;
}

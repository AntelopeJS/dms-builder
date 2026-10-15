import path from "node:path";
import {
  type FrontendModuleMetadata,
  GetFrontendModules,
} from "@antelopejs/interface-dms/page";
import type { ThemeLayer } from "@antelopejs/interface-dms-builder";
import { getModuleConfig } from "../../../config";
import { resolveProjectRoot } from "./project";

const DEPENDENCY_DIRECTORY = "node_modules";
/**
 * A hidden directory holds what tooling keeps, never the project's own code:
 * AntelopeJS installs the modules a project loads by package — the DMS
 * among them — under `.antelope/cache`, inside the project root.
 */
const HIDDEN_DIRECTORY = /^\./;

/** Where a layer the builder creates goes, relative to the project root. */
export const SCAFFOLD_LAYER_DIRECTORY = "frontend-vue";

/** The directory a project without a layer of its own would get one in. */
export function proposedLayerPath(): string {
  return path.join(resolveProjectRoot(), SCAFFOLD_LAYER_DIRECTORY);
}

function isProjectSource(root: string, directory: string): boolean {
  const relative = path.relative(root, directory);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return false;
  }
  return !relative
    .split(path.sep)
    .some(
      (segment) =>
        segment === DEPENDENCY_DIRECTORY || HIDDEN_DIRECTORY.test(segment),
    );
}

function configuredLayer(root: string): ThemeLayer | undefined {
  const configured = getModuleConfig().theme?.layer;
  if (!configured) {
    return undefined;
  }
  const sourcePath = path.resolve(root, configured);
  return { name: path.basename(sourcePath), sourcePath };
}

/** What the resolution reads of a registered frontend module. */
type RegisteredLayer = Pick<
  FrontendModuleMetadata,
  "name" | "sourcePath" | "priority"
>;

function byPriority(left: RegisteredLayer, right: RegisteredLayer): number {
  return right.priority - left.priority;
}

/**
 * The project's own layer among the frontend modules registered: one it
 * registers from inside its root — the DMS and every installed module
 * register theirs from `node_modules`, from AntelopeJS's cache or from a
 * checkout elsewhere, and none of those is the project's to rewrite. Among
 * several, the highest priority wins, as it does for the values it holds.
 */
export function projectLayer(
  root: string,
  modules: RegisteredLayer[],
): ThemeLayer | undefined {
  const own = modules
    .filter((module) => isProjectSource(root, module.sourcePath))
    .sort(byPriority)[0];
  return own ? { name: own.name, sourcePath: own.sourcePath } : undefined;
}

/** The frontend layer the project's theme lives in: the configured one, else its own. */
export async function resolveThemeLayer(): Promise<ThemeLayer | undefined> {
  const root = resolveProjectRoot();
  return (
    configuredLayer(root) ?? projectLayer(root, await GetFrontendModules())
  );
}

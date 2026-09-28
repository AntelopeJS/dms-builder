import path from "node:path";
import {
  type FrontendModuleMetadata,
  GetFrontendModules,
} from "@antelopejs/interface-dms/page";
import type { ThemeLayer } from "@antelopejs/interface-dms-builder";
import { getModuleConfig } from "../../../config";
import { resolveProjectRoot } from "./project";

const DEPENDENCY_DIRECTORY = "node_modules";

function isInsideProject(root: string, directory: string): boolean {
  const relative = path.relative(root, directory);
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    !relative.split(path.sep).includes(DEPENDENCY_DIRECTORY)
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

function byPriority(
  left: FrontendModuleMetadata,
  right: FrontendModuleMetadata,
): number {
  return right.priority - left.priority;
}

/**
 * The frontend layer the project's theme lives in.
 *
 * The project's own layer is the one it registers from inside its root: the
 * DMS and every installed module register theirs from `node_modules` or from
 * a checkout elsewhere, and none of those is the project's to rewrite. Among
 * several, the highest priority wins, as it does for the values it holds.
 */
export async function resolveThemeLayer(): Promise<ThemeLayer | undefined> {
  const root = resolveProjectRoot();
  const configured = configuredLayer(root);
  if (configured) {
    return configured;
  }
  const modules = await GetFrontendModules();
  const own = modules
    .filter((module) => isInsideProject(root, module.sourcePath))
    .sort(byPriority)[0];
  return own ? { name: own.name, sourcePath: own.sourcePath } : undefined;
}

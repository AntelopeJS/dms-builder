// Patching what a resource's DataController says beside its fields: the routes
// it exposes and the icon its table is drawn with.

import type {
  EditableResourceMeta,
  MutationOpts,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import type { Node } from "ts-morph";
import { tableIconsSupported } from "./catalog";
import { ensureNamedImport } from "./emit";
import { getExtendsCall } from "./literals";
import { commit, invalidConfig, notFound, unsupported } from "./ops";
import { routeMapExpr, TABLE_VIEW_MODULE } from "./resource-emit";
import { writeTableIcon } from "./resource-icon";
import { findResourceRecord } from "./resource-index";
import { type OpenResource, openResource } from "./resource-ops";
import { checkVersion } from "./resource-ops-delete";
import { Transaction } from "./writable";

const TABLE_VIEW_ROUTES_IMPORT = "TableViewRoutes";

const ICON_REQUIRED = 'an icon is an Iconify name, such as "i-ph-users"';

const ICONS_UNSUPPORTED =
  "this DMS predates table icons: @TableIcon needs a newer @antelopejs/interface-dms";

const NO_ROUTE_MAP = "the DataController call has no route map to patch";

/**
 * Why a patch cannot be written, before anything is: no route left, an icon
 * with no name, or an icon the DMS would not know what to do with. Taking an
 * icon off is always possible.
 */
function refusal(patch: EditableResourceMeta): OpResult<never> | undefined {
  if (patch.routes?.length === 0) {
    return invalidConfig("a resource must expose at least one route");
  }
  if (patch.icon === undefined || patch.icon === null) {
    return undefined;
  }
  if (typeof patch.icon !== "string" || !patch.icon.trim()) {
    return invalidConfig(ICON_REQUIRED);
  }
  return tableIconsSupported() ? undefined : unsupported(ICONS_UNSUPPORTED);
}

/**
 * Write the patch into the data-api file: the route map is the second argument
 * of the DataController's `extends` call, which the emitter already knows how
 * to write, and the icon its `@TableIcon`.
 */
function writePatch(
  opened: OpenResource,
  patch: EditableResourceMeta,
  routeMap: Node | undefined,
): void {
  const file = opened.dataApiFile;
  if (patch.routes && routeMap) {
    routeMap.replaceWithText(routeMapExpr(patch.routes));
    ensureNamedImport(file, TABLE_VIEW_ROUTES_IMPORT, TABLE_VIEW_MODULE);
  }
  if (patch.icon !== undefined) {
    writeTableIcon(file, opened.dataApiClass, patch.icon?.trim() ?? null);
  }
}

/**
 * Rewrite a resource's route map, its icon, or both. A field left out of the
 * patch is left alone.
 */
export function configureResource(
  ref: string,
  patch: EditableResourceMeta,
  opts?: MutationOpts,
): OpResult {
  const record = findResourceRecord(ref);
  const opened = record ? openResource(record) : undefined;
  if (!opened) {
    return notFound(ref);
  }
  const stale = checkVersion(
    ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  if (patch.routes === undefined && patch.icon === undefined) {
    return { ok: true, data: undefined, changes: [] };
  }
  const refused = refusal(patch);
  if (refused) {
    return refused;
  }
  const routeMap = getExtendsCall(opened.dataApiClass)?.getArguments()[1];
  if (patch.routes && !routeMap) {
    return unsupported(NO_ROUTE_MAP);
  }
  const transaction = new Transaction(opened.project);
  transaction.track(opened.dataApiFile);
  writePatch(opened, patch, routeMap);
  return commit(transaction, undefined);
}

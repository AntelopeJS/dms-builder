import fs from "node:fs";
import path from "node:path";
import type { ExcludedRelation } from "@antelopejs/interface-dms-builder";
import { moduleOfFile, targetModule } from "./modules";

const MANIFEST = "package.json";

interface MappedManifest {
  dmsBuilder?: MappedMarker;
}

interface MappedMarker {
  mapped?: string;
  /** Relations decided against, `"schema.name"` → why, so no analysis proposes them again. */
  excluded?: Record<string, string>;
}

/** What one `MapResources` call changes in the module's record. */
export interface MappedRecordUpdate {
  connection: string;
  mapped: string[];
  excluded: ExcludedRelation[];
}

function manifestPath(root: string): string {
  return path.join(root, MANIFEST);
}

function readManifest(root: string): MappedManifest & Record<string, unknown> {
  const file = manifestPath(root);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function updatedExclusions(
  current: Record<string, string> | undefined,
  update: MappedRecordUpdate,
): Record<string, string> | undefined {
  const excluded = { ...current };
  for (const relation of update.mapped) {
    delete excluded[relation];
  }
  for (const entry of update.excluded) {
    excluded[entry.relation] = entry.reason;
  }
  return Object.keys(excluded).length > 0 ? excluded : undefined;
}

/**
 * Marks a module as one whose tables mirror a database the project does not own, so the
 * operations that would create, alter or empty a table refuse there, and records which relations
 * were decided against.
 */
export function markMapped(module: string, update: MappedRecordUpdate): void {
  const root = targetModule(module)?.root;
  if (!root) {
    return;
  }
  const manifest = readManifest(root);
  const marker: MappedMarker = {
    ...manifest.dmsBuilder,
    mapped: update.connection,
  };
  const excluded = updatedExclusions(marker.excluded, update);
  if (excluded) {
    marker.excluded = excluded;
  } else {
    delete marker.excluded;
  }
  if (JSON.stringify(marker) === JSON.stringify(manifest.dmsBuilder)) {
    return;
  }
  manifest.dmsBuilder = marker;
  fs.writeFileSync(
    manifestPath(root),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/** The connection the module holding a file mirrors, when that module is a mapped one. */
export function mappedConnectionOfFile(filepath: string): string | undefined {
  const root = moduleOfFile(filepath)?.root;
  return root ? readManifest(root).dmsBuilder?.mapped : undefined;
}

/** The relations recorded as decided against in a module, with why. */
export function excludedRelationsOf(module: string): Record<string, string> {
  const root = targetModule(module)?.root;
  return root ? (readManifest(root).dmsBuilder?.excluded ?? {}) : {};
}

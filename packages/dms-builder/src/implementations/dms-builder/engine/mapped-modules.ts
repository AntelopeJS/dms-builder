import fs from "node:fs";
import path from "node:path";
import type { ExcludedRelation } from "@antelopejs/interface-dms-builder";
import { moduleOfFile, targetModule } from "./modules";

const MANIFEST = "package.json";

interface MappedManifest {
  dmsBuilder?: BuilderManifest;
}

interface BuilderManifest {
  database?: DatabaseRecord;
  /** dms-builder 0.6 and earlier: the connection, read until the next save. */
  mapped?: string;
  /** dms-builder 0.6 and earlier: the excluded tables, read until the next save. */
  excluded?: Record<string, string>;
}

/** What a module bound to an external database records about it in its `package.json`. */
interface DatabaseRecord {
  connection?: string;
  /** Tables decided against, `"schema.name"` → why, so no analysis proposes them again. */
  excludedTables?: Record<string, string>;
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

function databaseRecord(manifest: MappedManifest): DatabaseRecord {
  const builder = manifest.dmsBuilder;
  return {
    connection: builder?.database?.connection ?? builder?.mapped,
    excludedTables: builder?.database?.excludedTables ?? builder?.excluded,
  };
}

function writeDatabaseRecord(root: string, record: DatabaseRecord): void {
  const manifest = readManifest(root);
  const {
    mapped: _mapped,
    excluded: _excluded,
    ...builder
  } = manifest.dmsBuilder ?? {};
  const database: DatabaseRecord = { connection: record.connection };
  if (record.excludedTables && Object.keys(record.excludedTables).length > 0) {
    database.excludedTables = record.excludedTables;
  }
  const next = { ...builder, database };
  if (JSON.stringify(next) === JSON.stringify(manifest.dmsBuilder)) {
    return;
  }
  manifest.dmsBuilder = next;
  fs.writeFileSync(
    manifestPath(root),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
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
  const current = databaseRecord(readManifest(root));
  writeDatabaseRecord(root, {
    connection: update.connection,
    excludedTables: updatedExclusions(current.excludedTables, update),
  });
}

/** The connection the module holding a file mirrors, when that module is a mapped one. */
export function mappedConnectionOfFile(filepath: string): string | undefined {
  const root = moduleOfFile(filepath)?.root;
  return root ? databaseRecord(readManifest(root)).connection : undefined;
}

/** The relations recorded as decided against in a module, with why. */
export function excludedRelationsOf(module: string): Record<string, string> {
  const root = targetModule(module)?.root;
  return root ? (databaseRecord(readManifest(root)).excludedTables ?? {}) : {};
}

import fs from "node:fs";
import path from "node:path";

/** A module's `dmsBuilder` record, in its current shape or the one dms-builder 0.6 wrote. */
export interface BuilderRecord {
  database?: {
    connection?: string;
    excludedTables?: Record<string, string>;
  };
  mapped?: string;
  excluded?: Record<string, string>;
}

function manifestFile(root: string, module: string): string {
  return path.join(root, "modules", module, "package.json");
}

/** The `dmsBuilder` record in a fixture module's `package.json`. */
export function builderRecord(root: string, module: string): BuilderRecord {
  return JSON.parse(fs.readFileSync(manifestFile(root, module), "utf8"))
    .dmsBuilder;
}

/** Replaces the `dmsBuilder` record in a fixture module's `package.json`. */
export function setBuilderRecord(
  root: string,
  module: string,
  record: BuilderRecord,
): void {
  const file = manifestFile(root, module);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.dmsBuilder = record;
  fs.writeFileSync(file, JSON.stringify(manifest));
}

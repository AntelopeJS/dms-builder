import fs from "node:fs";
import path from "node:path";
import { moduleOfFile, targetModule } from "./modules";

const MANIFEST = "package.json";

interface MappedManifest {
  dmsBuilder?: MappedMarker;
}

interface MappedMarker {
  mapped?: string;
}

function manifestPath(root: string): string {
  return path.join(root, MANIFEST);
}

function readManifest(root: string): MappedManifest & Record<string, unknown> {
  const file = manifestPath(root);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

/**
 * Marks a module as one whose tables mirror a database the project does not own, so the
 * operations that would create, alter or empty a table refuse there.
 */
export function markMapped(module: string, connection: string): void {
  const root = targetModule(module)?.root;
  if (!root) {
    return;
  }
  const manifest = readManifest(root);
  if (manifest.dmsBuilder?.mapped === connection) {
    return;
  }
  manifest.dmsBuilder = { ...manifest.dmsBuilder, mapped: connection };
  fs.writeFileSync(
    manifestPath(root),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/** The connection a module mirrors, when it is a mapped module. */
export function mappedConnectionOfModule(
  module: string | undefined,
): string | undefined {
  const root = targetModule(module)?.root;
  return root ? readManifest(root).dmsBuilder?.mapped : undefined;
}

/** The connection the module holding a file mirrors, when that module is a mapped one. */
export function mappedConnectionOfFile(filepath: string): string | undefined {
  const root = moduleOfFile(filepath)?.root;
  return root ? readManifest(root).dmsBuilder?.mapped : undefined;
}

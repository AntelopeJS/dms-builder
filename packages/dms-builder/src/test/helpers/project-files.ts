import fs from "node:fs";
import path from "node:path";

/** The fields of a `package.json` the tests read. */
export interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** The fields of a `tsconfig.json` the tests read. */
export interface TsConfigFile {
  compilerOptions?: Record<string, string | boolean>;
}

/** A fixture project's file, as text. */
export function projectFile(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

/** A `package.json` under a fixture project, or the builder's own when `root` is its package. */
export function packageManifest(
  root: string,
  relativePath: string,
): PackageManifest {
  return JSON.parse(projectFile(root, relativePath));
}

/** A `tsconfig.json` under a fixture project. */
export function tsConfigFile(root: string, relativePath: string): TsConfigFile {
  return JSON.parse(projectFile(root, relativePath));
}

/**
 * Runs `check` while a fixture file holds what `edit` makes of it, and puts the file back after,
 * whether `check` passes or not, so a failure does not leak into the tests that follow.
 */
export async function withFileEdited(
  root: string,
  relativePath: string,
  edit: (text: string) => string,
  check: () => void | Promise<void>,
): Promise<void> {
  const file = path.join(root, relativePath);
  const before = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, edit(before));
  try {
    await check();
  } finally {
    fs.writeFileSync(file, before);
  }
}

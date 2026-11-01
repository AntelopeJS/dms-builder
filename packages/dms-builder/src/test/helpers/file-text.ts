import fs from "node:fs";

/** A file of a fixture project by its absolute path, as text. */
export function fileText(filepath: string): string {
  return fs.readFileSync(filepath, "utf8");
}

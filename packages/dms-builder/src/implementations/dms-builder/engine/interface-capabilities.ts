import fs from "node:fs";
import path from "node:path";

const QUERY_RESPONSE_TYPES = path.join(
  "node_modules",
  "@antelopejs",
  "interface-dms",
  "dist",
  "base",
  "query-response.d.ts",
);
const BUCKET_OPTION = /\bbucket\?:/;

/**
 * Whether the `@antelopejs/interface-dms` a file is compiled against takes a `bucket` in a
 * series helper's options, which names each period for a reader. An older interface does not
 * declare it, and a route passing it would fail to typecheck, so the option is only written
 * where the types are found to carry it.
 */
export function interfaceNamesBuckets(fromFile: string): boolean {
  let current = path.dirname(fromFile);
  for (;;) {
    const declaration = path.join(current, QUERY_RESPONSE_TYPES);
    if (fs.existsSync(declaration)) {
      return BUCKET_OPTION.test(fs.readFileSync(declaration, "utf8"));
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

import type { QueryValue } from "@antelopejs/interface-api";
import { isString } from "../implementations/dms-builder/engine/scalar-guards";

/** A query parameter's text, or `undefined` when it is absent or given without a value (`?name`). */
export function queryText(value: QueryValue): string | undefined {
  return isString(value) ? value : undefined;
}

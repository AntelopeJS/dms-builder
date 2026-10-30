/** A value read off a literal in source: data only, nothing executable. */
export type LiteralValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | LiteralValue[]
  | LiteralObject;

/** An object literal read as data. */
export type LiteralObject = { [key: string]: LiteralValue };

/** Whether a value met at run time can be read by property name: an object, an array or a function. */
export function isIndexable(value: unknown): value is Record<string, unknown> {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}

/** Whether a literal value read from source is an object, not an array or a scalar. */
export function isLiteralObject(value: LiteralValue): value is LiteralObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

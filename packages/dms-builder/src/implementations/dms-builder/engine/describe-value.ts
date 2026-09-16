/**
 * A rejected value, as it appears in a validation message.
 *
 * These messages report input that failed its own type: the interface functions
 * are called in-process by other modules, so the declared `string` is not
 * enforced at run time -- which is the whole reason the message exists. Total by
 * construction: JSON.stringify throws on a cycle and on BigInt, and returns
 * `undefined` for a function or a symbol, so a message meant to explain a
 * refusal would have thrown out of the OpResult channel or read "undefined".
 */
export function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  } catch {
    // A cycle or a BigInt.
  }
  return String(value);
}

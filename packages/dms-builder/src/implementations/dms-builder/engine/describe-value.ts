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
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- formats whatever a caller passed to an interface function in-process, typed `string` but not enforced at run time, which is the input this message reports; a narrower type would state a guarantee that does not hold
export function describeValue(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  } catch {}
  return String(value);
}

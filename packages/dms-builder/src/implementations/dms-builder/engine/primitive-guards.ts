/** Whether `value` is a string. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Whether `value` is a number. */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

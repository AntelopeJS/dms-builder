const NATIVE_KINDS: [RegExp, string][] = [
  [
    /^(smallint|integer|int|bigint|int[248]|(small|big)?serial|serial[248]|numeric|decimal|real|double precision|float[48])$/,
    "number",
  ],
  [
    /^(text|character varying|varchar|character|char|bpchar|citext|name)$/,
    "text",
  ],
];

/**
 * The kind of value a native type holds, so two columns compare: numbers with numbers, text with
 * text, any other type only with itself. Modifiers such as a length are left out.
 */
export function nativeKind(native: string): string {
  const base = native
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
  return NATIVE_KINDS.find(([pattern]) => pattern.test(base))?.[1] ?? base;
}

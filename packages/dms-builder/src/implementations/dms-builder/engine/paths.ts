export interface ParsedBlockPath {
  pageRef: string;
  segments: string[];
}

export function parseBlockPath(path: string): ParsedBlockPath | undefined {
  const hash = path.indexOf("#");
  if (hash < 0) {
    return undefined;
  }
  const pageRef = path.slice(0, hash);
  const segments = path
    .slice(hash + 1)
    .split("/")
    .filter((segment) => segment.length > 0);
  if (!pageRef || segments.length === 0) {
    return undefined;
  }
  return { pageRef, segments };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Whether a name can be emitted as a bare JS identifier rather than a string. */
export function isIdentifier(name: unknown): name is string {
  return typeof name === "string" && IDENTIFIER.test(name);
}

export function propertyKey(key: string): string {
  return isIdentifier(key) ? key : JSON.stringify(key);
}

export function valueToText(value: unknown): string {
  return JSON.stringify(value);
}

import type { ImportRef, RefValue } from "@antelopejs/interface-dms-builder";
import { buildCatalog } from "./catalog";
import { propertyKey } from "./paths";

export interface RefResolution {
  text: string;
  import: ImportRef;
}

export interface EmitContext {
  addImport(ref: ImportRef): void;
  /** Resolves a `$ref` to a class identifier + its import. Absent outside a resource-aware op. */
  resolveRef?(ref: RefValue["$ref"]): RefResolution;
}

export class UnknownDataTypeError extends Error {
  constructor(public readonly id: string) {
    super(`unknown dataType "${id}"`);
  }
}

export class UnknownReferenceError extends Error {
  constructor(public readonly resource: string) {
    super(`unknown resource reference "${resource}"`);
  }
}

export class UnknownBlockTypeError extends Error {
  constructor(public readonly type: string) {
    super(`unknown block type "${type}"`);
  }
}

export function createImportCollector(opts?: {
  resolveRef?: EmitContext["resolveRef"];
}): {
  ctx: EmitContext;
  imports: ImportRef[];
} {
  const imports: ImportRef[] = [];
  return {
    ctx: {
      addImport: (ref) => imports.push(ref),
      resolveRef: opts?.resolveRef,
    },
    imports,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExprSentinel(value: Record<string, unknown>): boolean {
  return typeof value.$expr === "string" && Object.keys(value).length === 1;
}

function isDataTypeSentinel(value: Record<string, unknown>): boolean {
  if (typeof value.$dataType !== "string") {
    return false;
  }
  return Object.keys(value).every(
    (key) => key === "$dataType" || key === "config",
  );
}

function isBlockSentinel(value: Record<string, unknown>): boolean {
  if (!isPlainObject(value.$block) || Object.keys(value).length !== 1) {
    return false;
  }
  return typeof value.$block.type === "string";
}

/**
 * Emits a nested block as its factory call — the shape a `x-component` option
 * takes, such as a ChartCard's `chart`.
 */
function blockText(value: Record<string, unknown>, ctx: EmitContext): string {
  const block = value.$block as { type: string; config?: unknown };
  const descriptor = buildCatalog().blocks.find(
    (candidate) => candidate.type === block.type,
  );
  if (!descriptor) {
    throw new UnknownBlockTypeError(block.type);
  }
  ctx.addImport(descriptor.import);
  const config = isPlainObject(block.config) ? block.config : undefined;
  const arg =
    config && definedEntries(config).length > 0
      ? objectValueText(config, ctx)
      : "";
  return `${descriptor.type}(${arg})`;
}

function isRefSentinel(value: Record<string, unknown>): boolean {
  if (!isPlainObject(value.$ref) || Object.keys(value).length !== 1) {
    return false;
  }
  return typeof value.$ref.resource === "string";
}

function refText(value: Record<string, unknown>, ctx: EmitContext): string {
  const ref = value.$ref as RefValue["$ref"];
  if (!ctx.resolveRef) {
    throw new UnknownReferenceError(ref.resource);
  }
  const resolved = ctx.resolveRef(ref);
  ctx.addImport(resolved.import);
  return resolved.text;
}

function definedEntries(obj: Record<string, unknown>): [string, unknown][] {
  return Object.entries(obj).filter(([, value]) => value !== undefined);
}

function dataTypeText(
  value: Record<string, unknown>,
  ctx: EmitContext,
): string {
  const id = value.$dataType as string;
  const descriptor = buildCatalog().dataTypes.find((type) => type.id === id);
  if (!descriptor) {
    throw new UnknownDataTypeError(id);
  }
  ctx.addImport(descriptor.import);
  const config = isPlainObject(value.config) ? value.config : undefined;
  const arg =
    config && definedEntries(config).length > 0
      ? objectValueText(config, ctx)
      : "";
  return `new ${descriptor.import.name}(${arg})`;
}

/**
 * Past this, an object or array is written one entry per line.
 *
 * `formatText()` runs over what the builder writes, but it only re-indents —
 * it never breaks a long line. So a config that would run off the screen has
 * to arrive already broken, or saving a page collapses a block its author had
 * written across ten readable lines onto one.
 */
const INLINE_VALUE_LIMIT = 72;

/**
 * The entries of an object or array, on one line when they fit and one per line
 * when they do not. A part that already spans lines forces the break, so a
 * nested object never leaves its siblings stranded on the opening line.
 */
export function inlineOrBlock(
  parts: string[],
  open: string,
  close: string,
): string {
  const inline =
    open === "{" ? `{ ${parts.join(", ")} }` : `[${parts.join(", ")}]`;
  if (inline.length <= INLINE_VALUE_LIMIT && !inline.includes("\n")) {
    return inline;
  }
  return `${open}\n${parts.map((part) => `${part},`).join("\n")}\n${close}`;
}

function objectValueText(
  obj: Record<string, unknown>,
  ctx: EmitContext,
): string {
  const entries = definedEntries(obj);
  if (entries.length === 0) {
    return "{}";
  }
  const parts = entries.map(
    ([key, value]) => `${propertyKey(key)}: ${serializeValue(value, ctx)}`,
  );
  return inlineOrBlock(parts, "{", "}");
}

export function serializeValue(value: unknown, ctx: EmitContext): string {
  if (isPlainObject(value)) {
    if (isExprSentinel(value)) {
      return value.$expr as string;
    }
    if (isDataTypeSentinel(value)) {
      return dataTypeText(value, ctx);
    }
    if (isRefSentinel(value)) {
      return refText(value, ctx);
    }
    if (isBlockSentinel(value)) {
      return blockText(value, ctx);
    }
    return objectValueText(value, ctx);
  }
  if (Array.isArray(value)) {
    return inlineOrBlock(
      value.map((item) => serializeValue(item, ctx)),
      "[",
      "]",
    );
  }
  return JSON.stringify(value);
}

import path from "node:path";
import {
  type ControllerClass,
  ControllerMeta,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type {
  BlockDraft,
  BlockPath,
  ComponentPreview,
  ConfigSchema,
  OpResult,
  OptionSchema,
  PageDraft,
  PageLayoutPreview,
} from "@antelopejs/interface-dms-builder";
import { blockDescriptor, buildCatalog } from "./catalog";
import { notFound } from "./ops";
import { resolveProjectRoot } from "./project";
import { findResourceRecord } from "./resource-index";
import { findPageRecord } from "./source-index";

const BASE_MODULE = "@antelopejs/interface-dms/base";
const PLACEHOLDER_TYPE = "Placeholder";
const PLACEHOLDER_HEIGHT = "96px";

/**
 * The blocks over a table whose factory only reads the controller, so building
 * one for the preview leaves the running app as it found it. A TableView is not
 * one: it writes its options, guards and gate flag onto the controller's own
 * metadata, which every page mounting that table shares.
 */
const READ_ONLY_CONTROLLER_BLOCKS = new Set(["ResourceForm"]);

/** The subset of `ComponentBuilder` the preview drives. */
interface PreviewBuilder {
  child(
    id: string,
    component: unknown,
    meta?: Record<string, unknown>,
  ): unknown;
  serialize(): Promise<ComponentPreview>;
}

type BlockFactory = (...args: unknown[]) => PreviewBuilder;

class DegradedBlockError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

function loadModule(specifier: string): Record<string, unknown> {
  return require(specifier) as Record<string, unknown>;
}

function factoryFor(type: string): BlockFactory {
  const factory = loadModule(BASE_MODULE)[type];
  if (typeof factory !== "function") {
    throw new DegradedBlockError(`no runtime factory for block type "${type}"`);
  }
  return factory as BlockFactory;
}

/**
 * A resource's DataAPI class as the running app loaded it, or `undefined`.
 *
 * Read off the require cache, never required: loading the file from here would
 * run its decorators a second time. The core drops a module's files from that
 * cache when it reloads the module, so what is found is the live class — and a
 * table created a moment ago, which the app has not reloaded under yet, is
 * simply not there.
 */
function loadedController(ref: string | undefined): unknown {
  const record = ref ? findResourceRecord(ref) : undefined;
  if (!record) {
    return undefined;
  }
  const root = `${resolveProjectRoot()}${path.sep}`;
  const dependencies = `${path.sep}node_modules${path.sep}`;
  for (const [file, entry] of Object.entries(require.cache)) {
    if (!file.startsWith(root) || file.includes(dependencies)) {
      continue;
    }
    const exported = (entry?.exports as Record<string, unknown> | undefined)?.[
      record.apiName
    ];
    if (
      typeof exported === "function" &&
      GetMetadata(exported as ControllerClass, ControllerMeta).location ===
        record.route
    ) {
      return exported;
    }
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walks a dotted export path, e.g. `DefaultDataTypes.StringType`. */
function resolveExport(specifier: string, name: string): unknown {
  return name
    .split(".")
    .reduce<unknown>(
      (current, part) => (isPlainObject(current) ? current[part] : undefined),
      loadModule(specifier),
    );
}

function instantiateDataType(value: Record<string, unknown>): unknown {
  const id = value.$dataType as string;
  const descriptor = buildCatalog().dataTypes.find((type) => type.id === id);
  if (!descriptor?.import.module) {
    throw new DegradedBlockError(`unknown dataType "${id}"`);
  }
  const exported = resolveExport(
    descriptor.import.module,
    descriptor.import.name,
  );
  if (typeof exported !== "function") {
    throw new DegradedBlockError(`dataType "${id}" is not constructible`);
  }
  const Ctor = exported as new (config?: unknown) => unknown;
  // Materialized like any other option: a relation's config names its table.
  return new Ctor(
    value.config === undefined ? undefined : materialize(value.config),
  );
}

/**
 * The DataAPI class a `$ref` in a config names — the table a relation field
 * points at — as the running app loaded it.
 *
 * Only read, as a table form's own class is: the DataType looks the table's
 * routes up on it, which is what the saved page would do when served.
 */
function referencedController(ref: Record<string, unknown>): unknown {
  const dataApi = ref.as === undefined || ref.as === "dataApi";
  const controller =
    dataApi && typeof ref.resource === "string"
      ? loadedController(ref.resource)
      : undefined;
  if (!controller) {
    throw new DegradedBlockError("a table it reads needs the running page");
  }
  return controller;
}

/** Resolves the sentinels a config may carry into the values a factory expects. */
function materialize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(materialize);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  if (typeof value.$expr === "string") {
    throw new DegradedBlockError("$expr cannot be previewed");
  }
  if (isPlainObject(value.$ref)) {
    return referencedController(value.$ref);
  }
  if (typeof value.$dataType === "string") {
    return instantiateDataType(value);
  }
  if (isPlainObject(value.$block)) {
    const block = value.$block as { type: string; config?: unknown };
    return buildBlock({
      name: "preview",
      type: block.type,
      config: isPlainObject(block.config) ? block.config : {},
    });
  }
  const materialized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    materialized[key] = materialize(entry);
  }
  return materialized;
}

/** A value still missing an option its schema requires. */
const UNFINISHED = Symbol("unfinished");

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function isRequired(schema: OptionSchema): boolean {
  return !schema.optional && schema.default === undefined;
}

/**
 * `value` without the list entries it holds that are still being filled in, or
 * `UNFINISHED` when `value` is one of them: a required option left empty,
 * however deep. Hidden options are not the author's to fill, so they are not
 * counted — the same reading the panel's "Waiting on" makes.
 */
function finished(schema: OptionSchema, value: unknown): unknown {
  if (isEmpty(value)) {
    return isRequired(schema) ? UNFINISHED : value;
  }
  if (schema.oneOf?.length) {
    for (const branch of schema.oneOf) {
      const kept = finished(branch, value);
      if (kept !== UNFINISHED) {
        return kept;
      }
    }
    return UNFINISHED;
  }
  if (schema.properties && isPlainObject(value)) {
    const kept: Record<string, unknown> = { ...value };
    for (const [key, nested] of Object.entries(schema.properties)) {
      if (nested.ui?.hidden) {
        continue;
      }
      const entry = finished(nested, value[key]);
      if (entry === UNFINISHED) {
        return UNFINISHED;
      }
      if (key in value) {
        kept[key] = entry;
      }
    }
    return kept;
  }
  if (schema.items && Array.isArray(value)) {
    const items = schema.items;
    return value
      .map((entry) => finished(items, entry))
      .filter((entry) => entry !== UNFINISHED);
  }
  if (schema.values && isPlainObject(value)) {
    const values = schema.values;
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, finished(values, entry)] as const)
        .filter(([, entry]) => entry !== UNFINISHED),
    );
  }
  return value;
}

/**
 * A block's options as the preview builds it: the list entries the author has
 * only begun left out.
 *
 * A form's field arrives with a label and nothing else, and the factory reads
 * its type the moment it is called — so one field just added took the whole
 * form down to a placeholder, until a type was chosen. The block previews as it
 * stood before the entry, and the entry joins it once it is filled in. An
 * option of the block itself left empty is kept as it is: that is the block
 * being unfinished, and the placeholder is the right answer to it.
 */
function withoutUnfinishedEntries(
  schema: ConfigSchema,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const kept: Record<string, unknown> = { ...config };
  for (const [key, option] of Object.entries(schema)) {
    if (!(key in config)) {
      continue;
    }
    const entry = finished(option, config[key]);
    if (entry !== UNFINISHED) {
      kept[key] = entry;
    }
  }
  return kept;
}

/** What the preview walks: the paths it had to stand in for. */
interface PreviewContext {
  degraded: BlockPath[];
  pageRef: string;
}

/**
 * A block the preview cannot build faithfully still has to occupy its place, or
 * its siblings would vanish with it. It renders as a labelled placeholder and
 * the caller is told which paths were substituted.
 */
/**
 * The stand-in a block that could not be built is replaced by.
 *
 * `undefined` when the resolved `dms-base` has no `Placeholder` factory: this
 * runs from inside the handler for a block that already failed, and throwing
 * again there would take the whole preview down — losing every sibling for the
 * sake of one block, which is the opposite of what the stand-in is for.
 */
function placeholderFor(reason: string): unknown {
  try {
    return factoryFor(PLACEHOLDER_TYPE)({
      label: reason,
      height: PLACEHOLDER_HEIGHT,
    });
  } catch {
    return undefined;
  }
}

function childMeta(block: BlockDraft): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  if (block.slot !== undefined) meta.slot = block.slot;
  const combined = { ...meta, ...block.meta };
  return Object.keys(combined).length > 0 ? combined : undefined;
}

function buildBlock(block: BlockDraft): unknown {
  if (block.preserve) {
    throw new DegradedBlockError("written by hand — kept as it stands");
  }
  const descriptor = block.type ? blockDescriptor(block.type) : undefined;
  if (!descriptor) {
    throw new DegradedBlockError(`unknown block type "${block.type}"`);
  }
  const label = descriptor.label ?? descriptor.type;
  if (descriptor.controllerArg && !block.controller) {
    throw new DegradedBlockError(`${label} — choose its table`);
  }
  const controller =
    descriptor.controllerArg && READ_ONLY_CONTROLLER_BLOCKS.has(descriptor.type)
      ? loadedController(block.controller)
      : undefined;
  if (descriptor.controllerArg && !controller) {
    throw new DegradedBlockError(`${label} — needs the running page`);
  }
  const config = materialize(
    withoutUnfinishedEntries(descriptor.config, block.config ?? {}),
  ) as Record<string, unknown>;
  const options = { ...descriptor.defaults, ...config };
  return controller
    ? factoryFor(descriptor.type)(controller, options)
    : factoryFor(descriptor.type)(options);
}

function instantiateBlock(
  block: BlockDraft,
  path: string,
  context: PreviewContext,
): unknown {
  let builder: PreviewBuilder;
  try {
    builder = buildBlock(block) as PreviewBuilder;
  } catch (error) {
    context.degraded.push(path);
    const reason =
      error instanceof DegradedBlockError
        ? error.reason
        : "cannot be previewed";
    return placeholderFor(reason);
  }
  for (const child of block.children ?? []) {
    const instance = instantiateBlock(child, `${path}/${child.name}`, context);
    if (instance === undefined) {
      continue;
    }
    builder.child(child.name, instance, childMeta(child));
  }
  return builder;
}

export async function previewLayout(
  ref: string,
  draft: PageDraft,
): Promise<OpResult<PageLayoutPreview>> {
  // A read of the source index, not of disk: the preview runs on every edit.
  if (!findPageRecord(ref)) {
    return notFound<PageLayoutPreview>(ref);
  }
  const components: Record<string, ComponentPreview> = {};
  const context: PreviewContext = { degraded: [], pageRef: ref };
  for (const block of draft.blocks) {
    const builder = instantiateBlock(block, `${ref}#${block.name}`, context) as
      | PreviewBuilder
      | undefined;
    // Neither the block nor a stand-in for it could be built. It is already
    // reported degraded; the rest of the page still previews.
    if (!builder) {
      continue;
    }
    components[block.name] = await builder.serialize();
  }
  return {
    ok: true,
    data: { components, degraded: context.degraded },
    changes: [],
  };
}

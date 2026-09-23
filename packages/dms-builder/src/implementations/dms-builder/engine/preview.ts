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
  OpResult,
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
  return new Ctor(value.config);
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
    throw new DegradedBlockError("a resource reference cannot be previewed");
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
  const config = materialize(block.config ?? {}) as Record<string, unknown>;
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

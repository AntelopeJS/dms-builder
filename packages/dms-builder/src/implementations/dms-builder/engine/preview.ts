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
import { isPlainObject } from "./value";

const BASE_MODULE = "@antelopejs/interface-dms/base";
const TABLE_VIEW_MODULE = `${BASE_MODULE}/table-view`;
const PLACEHOLDER_TYPE = "Placeholder";
const PLACEHOLDER_HEIGHT = "96px";
const TABLE_VIEW_TYPE = "TableView";

/**
 * The blocks over a table whose factory only reads the controller, so building
 * one for the preview leaves the running app as it found it. A TableView is not
 * one: it writes its options, guards and gate flag onto the controller's own
 * metadata, which every page mounting that table shares — it previews as a
 * read-only table over the same rows instead (`tablePreview`).
 */
const READ_ONLY_CONTROLLER_BLOCKS = new Set(["ResourceForm"]);

/**
 * The options of a Table block a read-only table over its rows shows as the
 * page will: its title, its look, its search, sort, tabs and filters. Its
 * actions and forms are the page's alone.
 */
const TABLE_PREVIEW_OPTIONS = [
  "caption",
  "layout",
  "density",
  "maxHeight",
  "pageSize",
  "searchPlaceholder",
  "labelKey",
  "defaultSort",
  "emptyStates",
  "tabs",
  "quickFilters",
  "card",
  "rowIdKey",
];

/** What a column of a source table takes of a `@Column`'s options. */
const SOURCE_COLUMN_OPTIONS = [
  "name",
  "description",
  "type",
  "order",
  "isVisible",
  "filterable",
  "cellWrap",
  "size",
  "display",
];

/** What a data controller's list route handles itself: all of it. */
const LIST_ROUTE_CAPABILITIES = {
  search: true,
  sort: true,
  paginate: true,
  filter: true,
};

/** The options of a block as the draft holds them, by option name. */
type BlockOptions = NonNullable<BlockDraft["config"]>;

/** A config object whose `$dataType` names a DataType. */
type DataTypeSentinel = Record<string, unknown> & { $dataType: string };

/** A column as a table's metadata describes it to its views. */
interface DescribedColumn {
  id: string;
  listable: boolean;
  enableSorting: boolean;
}

/** What the preview reads of a table's metadata, never writes. */
interface TableMetadata {
  columns: Record<string, Record<string, unknown>>;
  config: { location: string; columns: DescribedColumn[] };
}

/** The metadata class a table's views read, as `GetMetadata` takes it. */
interface TableMetadataClass {
  new (target: ControllerClass): TableMetadata;
  key: symbol;
}

interface TableViewModule {
  TableViewMeta: TableMetadataClass;
  tableViewFromSource: (options: Record<string, unknown>) => PreviewBuilder;
}

/** The subset of `ComponentBuilder` the preview drives. */
interface PreviewBuilder {
  child(
    id: string,
    component: PreviewBuilder,
    meta?: Record<string, unknown>,
  ): this;
  serialize(): Promise<ComponentPreview>;
}

type BlockFactory = (...args: unknown[]) => PreviewBuilder;

class DegradedBlockError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

function loadModule<T = Record<string, unknown>>(specifier: string): T {
  return require(specifier) as T;
}

function isDataTypeSentinel(
  value: Record<string, unknown>,
): value is DataTypeSentinel {
  return typeof value.$dataType === "string";
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

/** Walks a dotted export path, e.g. `DefaultDataTypes.StringType`. */
function resolveExport(specifier: string, name: string): unknown {
  return name
    .split(".")
    .reduce<unknown>(
      (current, part) => (isPlainObject(current) ? current[part] : undefined),
      loadModule(specifier),
    );
}

function instantiateDataType(value: DataTypeSentinel): unknown {
  const id = value.$dataType;
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
  if (isDataTypeSentinel(value)) {
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

function isEmpty(value: unknown): value is "" | null | undefined {
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
  config: BlockOptions,
): BlockOptions {
  const kept: BlockOptions = { ...config };
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
function placeholderFor(reason: string): PreviewBuilder {
  return factoryFor(PLACEHOLDER_TYPE)({
    label: reason,
    height: PLACEHOLDER_HEIGHT,
  });
}

function childMeta(block: BlockDraft): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  if (block.slot !== undefined) meta.slot = block.slot;
  const combined = { ...meta, ...block.meta };
  return Object.keys(combined).length > 0 ? combined : undefined;
}

function buildBlock(block: BlockDraft): PreviewBuilder {
  if (block.preserve || block.lockedOptions) {
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
  const previewed =
    READ_ONLY_CONTROLLER_BLOCKS.has(descriptor.type) ||
    descriptor.type === TABLE_VIEW_TYPE;
  const controller =
    descriptor.controllerArg && previewed
      ? loadedController(block.controller)
      : undefined;
  if (descriptor.controllerArg && !controller) {
    throw new DegradedBlockError(`${label} — needs the running page`);
  }
  const config = materialize(
    withoutUnfinishedEntries(descriptor.config, block.config ?? {}),
  ) as Record<string, unknown>;
  const options = { ...descriptor.defaults, ...config };
  if (descriptor.type === TABLE_VIEW_TYPE) {
    return tablePreview(controller, options);
  }
  return controller
    ? factoryFor(descriptor.type)(controller, options)
    : factoryFor(descriptor.type)(options);
}

function picked(
  source: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

/** The columns the table lists, as a source table takes them. */
function listedColumns(meta: TableMetadata): Record<string, unknown> {
  return Object.fromEntries(
    meta.config.columns
      .filter((column) => column.listable)
      .map((column) => [
        column.id,
        {
          ...picked(meta.columns[column.id] ?? {}, SOURCE_COLUMN_OPTIONS),
          sortable: column.enableSorting,
        },
      ]),
  );
}

/**
 * A Table block as the canvas shows it: the table's columns and rows, read
 * through its own list route by a read-only table over that route.
 *
 * The block itself is not built: `TableView()` writes its options, guards and
 * forms onto the table's metadata, which every page mounting that table shares.
 * Its actions are what the saved page adds; the rows are the ones it will list.
 */
function tablePreview(
  controller: unknown,
  options: Record<string, unknown>,
): PreviewBuilder {
  const module = loadModule<TableViewModule>(TABLE_VIEW_MODULE);
  const meta = GetMetadata(controller as ControllerClass, module.TableViewMeta);
  return module.tableViewFromSource({
    ...picked(options, TABLE_PREVIEW_OPTIONS),
    columns: listedColumns(meta),
    fetchUrl: `${meta.config.location}/list`,
    capabilities: LIST_ROUTE_CAPABILITIES,
  });
}

function instantiateBlock(
  block: BlockDraft,
  path: string,
  context: PreviewContext,
): PreviewBuilder {
  let builder: PreviewBuilder;
  try {
    builder = buildBlock(block);
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
    builder.child(child.name, instance, childMeta(child));
  }
  return builder;
}

/**
 * Preview a page draft's layout. The page is looked up in the source index, not
 * on disk, because the preview runs on every edit.
 */
export async function previewLayout(
  ref: string,
  draft: PageDraft,
): Promise<OpResult<PageLayoutPreview>> {
  if (!findPageRecord(ref)) {
    return notFound<PageLayoutPreview>(ref);
  }
  const components: Record<string, ComponentPreview> = {};
  const context: PreviewContext = { degraded: [], pageRef: ref };
  for (const block of draft.blocks) {
    const builder = instantiateBlock(block, `${ref}#${block.name}`, context);
    components[block.name] = await builder.serialize();
  }
  return {
    ok: true,
    data: { components, degraded: context.degraded },
    changes: [],
  };
}

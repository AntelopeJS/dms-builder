import type {
  BlockCatalog,
  BlockTypeDescriptor,
  ConfigSchema,
  DynamicSlots,
  OptionSchema,
  SlotDescriptor,
} from "@antelopejs/interface-dms-builder";
import {
  inferBlocks,
  inferDataTypes,
  invalidateInference,
} from "./catalog-inference";
import { RESERVED_FIELD_NAMES } from "./reserved-names";

const BASE_MODULE = "@antelopejs/interface-dms/base";
const BLOCK_TYPES_MODULE = `${BASE_MODULE}/block-types`;

/** The shape `dms-base` reports for one declared block type. */
interface DeclaredBlockType {
  type: string;
  componentName: string;
  meta: { name: string; icon?: string; description?: string; group?: string };
  container?: boolean;
  allowedChildren?: string[];
  slots?: SlotDescriptor[];
  dynamicSlots?: DynamicSlots;
  controllerArg?: boolean;
  config: ConfigSchema;
  childMeta?: ConfigSchema;
  defaults: Record<string, unknown>;
  fixedOptions?: Record<string, unknown>;
}

interface BlockTypesModule {
  ListBlockTypes: () => DeclaredBlockType[];
}

let cached: BlockCatalog | undefined;

/** Read the block types `dms-base` declares. */
function loadDeclaredBlockTypes(): DeclaredBlockType[] {
  const module = require(BLOCK_TYPES_MODULE) as BlockTypesModule;
  return module.ListBlockTypes();
}

const WIDGET_MARKERS: Record<string, string> = {
  dataType: "x-dataType",
  block: "x-component",
};

/**
 * Carry the `x-` markers the emitter and consumers key on: a declared schema
 * expresses them as widgets, an inferred one as the markers themselves.
 */
function withMarkers(option: OptionSchema): OptionSchema {
  const marker = option.ui?.widget && WIDGET_MARKERS[option.ui.widget];
  const nested: OptionSchema = { ...option };
  if (option.properties) {
    nested.properties = mapOptions(option.properties);
  }
  if (option.items) {
    nested.items = withMarkers(option.items);
  }
  if (option.values) {
    nested.values = withMarkers(option.values);
  }
  if (option.oneOf) {
    nested.oneOf = option.oneOf.map(withMarkers);
  }
  // A tuple's members and an intersection's branches carry hints like any
  // other node; skipping them dropped the marker on anything nested there.
  if (option.prefixItems) {
    nested.prefixItems = option.prefixItems.map(withMarkers);
  }
  if (option.allOf) {
    nested.allOf = option.allOf.map(withMarkers);
  }
  return marker ? { ...nested, [marker]: true } : nested;
}

function mapOptions(config: ConfigSchema): ConfigSchema {
  const mapped: ConfigSchema = {};
  for (const [key, option] of Object.entries(config)) {
    mapped[key] = withMarkers(option);
  }
  return mapped;
}

function fromDeclared(declared: DeclaredBlockType): BlockTypeDescriptor {
  return {
    type: declared.type,
    import: { name: declared.type, module: BASE_MODULE },
    componentName: declared.componentName,
    label: declared.meta.name,
    icon: declared.meta.icon,
    group: declared.meta.group,
    container: declared.container === true,
    allowedChildren: declared.allowedChildren,
    slots: declared.slots,
    dynamicSlots: declared.dynamicSlots,
    config: mapOptions(declared.config),
    defaults: declared.defaults,
    fixedOptions: declared.fixedOptions,
    childMeta: declared.childMeta ? mapOptions(declared.childMeta) : undefined,
    shapeSource: "annotated",
    description: declared.meta.description,
    controllerArg: declared.controllerArg,
  };
}

/**
 * Declared block types win; inferred ones fill in for factories `dms-base` has
 * not declared yet.
 */
function mergeBlocks(
  declared: DeclaredBlockType[],
  inferred: BlockTypeDescriptor[],
): BlockTypeDescriptor[] {
  const blocks = declared.map(fromDeclared);
  const known = new Set(blocks.map((block) => block.type));
  return blocks.concat(inferred.filter((block) => !known.has(block.type)));
}

export function buildCatalog(): BlockCatalog {
  if (cached) {
    return cached;
  }
  cached = {
    blocks: mergeBlocks(loadDeclaredBlockTypes(), inferBlocks()),
    dataTypes: inferDataTypes(),
    reservedFieldNames: [...RESERVED_FIELD_NAMES],
    generatedAt: new Date().toISOString(),
  };
  return cached;
}

export function blockDescriptor(type: string): BlockTypeDescriptor | undefined {
  return buildCatalog().blocks.find((block) => block.type === type);
}

export function isControllerLeadingBlock(type: string): boolean {
  return blockDescriptor(type)?.controllerArg === true;
}

export function invalidateCatalog(): void {
  cached = undefined;
  invalidateInference();
}


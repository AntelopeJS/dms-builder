import { BLOCK_GROUP_LABELS, OPTION_GROUPS } from './constants'
import type {
	BlockCatalog,
	ComponentPreview,
	BlockDraft,
	BlockTypeDescriptor,
	OptionSchema,
} from './types'

/** The node the DMS served at a draft path, walking `.child()` ids. */
export function servedNodeAt(
	served: Record<string, ComponentPreview>,
	path: string,
): ComponentPreview | undefined {
	const [head, ...rest] = path.split('/')
	let node: ComponentPreview | undefined = served[head ?? '']
	for (const segment of rest) {
		node = node?.children?.find((child) => child.id === segment)?.component
	}
	return node
}

export interface PaletteGroup {
	id: string
	label: string
	blocks: BlockTypeDescriptor[]
}

export interface OptionEntry {
	key: string
	schema: OptionSchema
}

export interface OptionGroup {
	id: string
	label: string
	options: OptionEntry[]
}

const DEFAULT_OPTION_GROUP = 'content'
const UNGROUPED = 'other'

export function descriptorOf(
	catalog: BlockCatalog | null,
	type?: string | null,
): BlockTypeDescriptor | undefined {
	if (!catalog || !type) {
		return undefined
	}
	return catalog.blocks.find((block) => block.type === type)
}

/**
 * The types the palette leaves out: structure, not components.
 *
 * A container naming exactly one `allowedChildren` is the one case where the
 * editor writes that child itself, around whatever is dropped in — see
 * `wrapperFor`. Nobody can place such a type usefully: the only spot that takes
 * it is the container that already builds it, and a palette entry beside `Grid`
 * reads as a grid cell, so it invites the one gesture the layout refuses. The
 * rule is read off the catalog rather than listed here, so the next
 * container/row pair declared is covered without touching this file.
 *
 * The same rule answers a second question: what the canvas must not name. A
 * block of a type nobody can place is one the editor placed, and the user is
 * owed the container they did place instead.
 */
export function structuralTypes(catalog: BlockCatalog): Set<string> {
	const structural = new Set<string>()
	for (const { allowedChildren } of catalog.blocks) {
		const only = allowedChildren?.length === 1 ? allowedChildren[0] : undefined
		if (only !== undefined) {
			structural.add(only)
		}
	}
	return structural
}

/** Whether a block of this type is scaffolding the editor wrote for itself. */
export function isStructural(
	catalog: BlockCatalog | null,
	type: string | undefined,
): boolean {
	if (!catalog || type === undefined) {
		return false
	}
	return structuralTypes(catalog).has(type)
}

export function paletteGroups(
	catalog: BlockCatalog | null,
	query: string,
): PaletteGroup[] {
	if (!catalog) {
		return []
	}
	const needle = query.trim().toLowerCase()
	const structural = structuralTypes(catalog)
	const buckets = new Map<string, BlockTypeDescriptor[]>()
	for (const block of catalog.blocks) {
		if (structural.has(block.type)) {
			continue
		}
		const label = (block.label ?? block.type).toLowerCase()
		if (needle && !label.includes(needle) && !block.type.toLowerCase().includes(needle)) {
			continue
		}
		const group = block.group ?? UNGROUPED
		const bucket = buckets.get(group) ?? []
		bucket.push(block)
		buckets.set(group, bucket)
	}
	return orderedKeys(buckets, Object.keys(BLOCK_GROUP_LABELS)).map((group) => ({
		id: group,
		label: BLOCK_GROUP_LABELS[group] ?? group,
		blocks: buckets.get(group) ?? [],
	}))
}

/**
 * The known keys first, in their canonical order, then whatever else the
 * catalog declared — a group this build has never heard of still shows up.
 */
function orderedKeys<T>(buckets: Map<string, T>, known: string[]): string[] {
	const first = known.filter((key) => buckets.has(key))
	const rest = [...buckets.keys()].filter((key) => !known.includes(key)).sort()
	return [...first, ...rest]
}

/** An option the config panel shows: everything the schema does not hide. */
export function optionGroups(
	descriptor: BlockTypeDescriptor | undefined,
): OptionGroup[] {
	if (!descriptor) {
		return []
	}
	const entries = Object.entries(panelConfig(descriptor))
		.filter(([, schema]) => !schema.ui?.hidden)
		.map(([key, schema]) => ({ key, schema }))
	const buckets = new Map<string, OptionEntry[]>()
	for (const entry of entries) {
		const group = entry.schema.ui?.group ?? DEFAULT_OPTION_GROUP
		const bucket = buckets.get(group) ?? []
		bucket.push(entry)
		buckets.set(group, bucket)
	}
	return orderedKeys(buckets, [...OPTION_GROUPS]).map((group) => ({
		id: group,
		label: group.charAt(0).toUpperCase() + group.slice(1),
		options: (buckets.get(group) ?? []).sort(
			(a, b) => (a.schema.ui?.order ?? 0) - (b.schema.ui?.order ?? 0),
		),
	}))
}

export function optionLabel(key: string, schema: OptionSchema): string {
	if (schema.ui?.label) {
		return schema.ui.label
	}
	const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase()
	return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** A required option is one with no default the caller can fall back to. */
export function isRequired(schema: OptionSchema): boolean {
	return !schema.optional && schema.default === undefined
}

/**
 * The options as the panel shows them.
 *
 * A container holding its children through its own options names each region
 * twice: a title, for whoever reads the page, and an id for the children to
 * attach to. The id is the editor's — it writes it and keeps it unique, see
 * `nameSlots` — so the panel leaves it out rather than asking an author to
 * invent one, and the block's own type stops being a form to fill in.
 */
export function panelConfig(
	descriptor: BlockTypeDescriptor,
): Record<string, OptionSchema> {
	const dynamic = descriptor.dynamicSlots
	const option = dynamic ? descriptor.config[dynamic.optionPath] : undefined
	const items = option?.items
	const id = dynamic ? items?.properties?.[dynamic.idKey] : undefined
	if (!dynamic || !option || !items || !id) {
		return descriptor.config
	}
	return {
		...descriptor.config,
		[dynamic.optionPath]: {
			...option,
			items: {
				...items,
				properties: {
					...items.properties,
					[dynamic.idKey]: { ...id, ui: { ...id.ui, hidden: true } },
				},
			},
		},
	}
}

/** One setting still to fill in, addressed and named the way the panel is. */
export interface MissingSetting {
	/** The keys walked from the block's own options, array indices included. */
	path: string[]
	/** What the panel calls it: `Tabs #2 → Label` for a tab with no title. */
	label: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Walk one option against the value it holds, down to the leaf that is empty.
 *
 * A required option nested in a list — the title of the third tab — is as
 * unbuildable as a required option of the block itself, and the compiler is the
 * one that says so today, in terms of the generated source. Reading the same
 * gap off the schema is what lets the panel mark the field instead.
 */
function collectMissing(
	schema: OptionSchema,
	value: unknown,
	path: string[],
	labels: string[],
	found: MissingSetting[],
): void {
	if (value === undefined || value === null || value === '') {
		if (isRequired(schema)) {
			found.push({ path, label: labels.join(' → ') })
		}
		return
	}
	if (schema.properties && isRecord(value)) {
		for (const [key, nested] of Object.entries(schema.properties)) {
			if (nested.ui?.hidden) {
				continue
			}
			collectMissing(
				nested,
				value[key],
				[...path, key],
				[...labels, optionLabel(key, nested)],
				found,
			)
		}
		return
	}
	const items = schema.items
	if (items && Array.isArray(value)) {
		value.forEach((entry, index) => {
			collectMissing(
				items,
				entry,
				[...path, String(index)],
				[`${labels.join(' → ')} #${index + 1}`],
				found,
			)
		})
	}
}

/**
 * What still has to be filled in before the block renders: every required
 * option left empty, however deep, plus the resource a controller-leading block
 * reads from.
 */
export function missingSettings(
	descriptor: BlockTypeDescriptor | undefined,
	block: BlockDraft,
): MissingSetting[] {
	if (!descriptor || block.preserve) {
		return []
	}
	const config = block.config ?? {}
	const found: MissingSetting[] = []
	for (const [key, schema] of Object.entries(panelConfig(descriptor))) {
		if (schema.ui?.hidden) {
			continue
		}
		collectMissing(schema, config[key], [key], [optionLabel(key, schema)], found)
	}
	if (descriptor.controllerArg && !block.controller) {
		found.push({ path: ['controller'], label: 'Database table' })
	}
	return found
}

/** The same gaps, named for a sentence. */
export function missingConfig(
	descriptor: BlockTypeDescriptor | undefined,
	block: BlockDraft,
): string[] {
	return missingSettings(descriptor, block).map((entry) => entry.label)
}

export function suggestedName(type: string): string {
	return type.charAt(0).toLowerCase() + type.slice(1)
}

/** The alignment that keeps a stack's children as wide as the stack itself. */
const STRETCH = 'stretch'

/**
 * How a container the editor places lays its children out.
 *
 * A stack centres them by default, which is SwiftUI's reading of a stack and
 * not a page's: enclosing a cell in a column — what dropping a block above one
 * does — would shrink that cell, and everything else in the column with it, to
 * its own width, for a gesture that only added a block. The option is written
 * rather than assumed, so the panel shows it and an author can choose otherwise.
 */
function laidOutAcross(
	descriptor: BlockTypeDescriptor,
): Record<string, unknown> {
	const alignment = descriptor.config.alignment
	return descriptor.container && alignment?.enum?.includes(STRETCH)
		? { alignment: STRETCH }
		: {}
}

/**
 * Something readable to stand in for a required option, by what the option is.
 *
 * Never a value pretending to be data: a title the author renames, an empty
 * list to add to, the first of a fixed set. An option this cannot answer for is
 * left out and reported by the panel instead.
 */
function seedFor(
	descriptor: BlockTypeDescriptor,
	key: string,
	schema: OptionSchema,
): unknown {
	if (schema.type === 'array') {
		return []
	}
	if (schema.enum?.length) {
		return schema.enum[0]
	}
	if (schema['x-component']) {
		const type = schema.ui?.blockTypes?.[0]
		return type === undefined ? undefined : { $block: { type, config: {} } }
	}
	if (schema.type === 'string') {
		// An id is read back by other blocks, so it reads as a name, not a title.
		return key === 'id'
			? suggestedName(descriptor.type)
			: (descriptor.label ?? descriptor.type)
	}
	return undefined
}

/**
 * What a block is placed with.
 *
 * A block is placed before it is configured, and the page it lands in is
 * typechecked on every edit: an option its own type demands, left out, is a
 * page that does not compile — and the author is answered with a compiler error
 * about the block they just dropped, before they have touched anything. What is
 * seeded is what the panel then shows, ready to be changed.
 */
function placedConfig(descriptor: BlockTypeDescriptor): Record<string, unknown> {
	const config = laidOutAcross(descriptor)
	for (const [key, schema] of Object.entries(descriptor.config)) {
		if (!isRequired(schema) || config[key] !== undefined) {
			continue
		}
		const seed = seedFor(descriptor, key, schema)
		if (seed !== undefined) {
			config[key] = seed
		}
	}
	return config
}

export function newBlockDraft(descriptor: BlockTypeDescriptor): BlockDraft {
	return {
		name: suggestedName(descriptor.type),
		type: descriptor.type,
		config: placedConfig(descriptor),
		...(descriptor.container ? { children: [] } : {}),
	}
}

/**
 * An id for a region titled `title`, and one no sibling holds yet.
 *
 * Derived from the title so the generated page reads as the author wrote it —
 * a tab called “Orders” attaches its children to `orders` — and folded down to
 * letters, digits and dashes, which is what both a slot name and a property of
 * the emitted source can carry. An untitled region falls back on its rank.
 */
export function slotIdFor(
	title: unknown,
	fallback: string,
	taken: Set<string>,
): string {
	const folded =
		typeof title === 'string'
			? title
					.normalize('NFD')
					.replace(/[\u0300-\u036f]/g, '')
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-+|-+$/g, '')
			: ''
	const wanted = folded || fallback
	if (!taken.has(wanted)) {
		return wanted
	}
	let rank = 2
	while (taken.has(`${wanted}-${rank}`)) {
		rank += 1
	}
	return `${wanted}-${rank}`
}

/** The slots a container offers, fixed or read off its own options. */
export function slotsOf(
	descriptor: BlockTypeDescriptor | undefined,
	block: BlockDraft | undefined,
): Array<{ id: string; label: string }> {
	if (!descriptor) {
		return []
	}
	if (descriptor.slots?.length) {
		return descriptor.slots.map((slot) => ({
			id: slot.id,
			label: slot.label ?? slot.id,
		}))
	}
	const dynamic = descriptor.dynamicSlots
	if (!dynamic || !block) {
		return []
	}
	const source = (block.config ?? {})[dynamic.optionPath]
	if (!Array.isArray(source)) {
		return []
	}
	return source
		.map((entry) => entry as Record<string, unknown>)
		.filter((entry) => typeof entry[dynamic.idKey] === 'string')
		.map((entry) => ({
			id: entry[dynamic.idKey] as string,
			label:
				(dynamic.labelKey && (entry[dynamic.labelKey] as string)) ||
				(entry[dynamic.idKey] as string),
		}))
}

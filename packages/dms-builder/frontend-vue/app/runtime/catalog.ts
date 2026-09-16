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

export function paletteGroups(
	catalog: BlockCatalog | null,
	query: string,
): PaletteGroup[] {
	if (!catalog) {
		return []
	}
	const needle = query.trim().toLowerCase()
	const buckets = new Map<string, BlockTypeDescriptor[]>()
	for (const block of catalog.blocks) {
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
	const entries = Object.entries(descriptor.config)
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
 * What still has to be filled in before the block renders: its required
 * options, plus the resource a controller-leading block reads from.
 */
export function missingConfig(
	descriptor: BlockTypeDescriptor | undefined,
	block: BlockDraft,
): string[] {
	if (!descriptor || block.preserve) {
		return []
	}
	const config = block.config ?? {}
	const missing = Object.entries(descriptor.config)
		.filter(([key, schema]) => isRequired(schema) && config[key] === undefined)
		.map(([key]) => key)
	if (descriptor.controllerArg && !block.controller) {
		missing.push('controller')
	}
	return missing
}

export function suggestedName(type: string): string {
	return type.charAt(0).toLowerCase() + type.slice(1)
}

export function newBlockDraft(descriptor: BlockTypeDescriptor): BlockDraft {
	return {
		name: suggestedName(descriptor.type),
		type: descriptor.type,
		config: {},
		...(descriptor.container ? { children: [] } : {}),
	}
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

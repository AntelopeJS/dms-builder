import {
	IsSimpleBlockOption,
} from '@antelopejs/interface-dms/base/block-registry/presentation'
import { OPTION_GROUPS } from './constants'
import type { BlockTypeDescriptor, OptionSchema } from './types'

interface OptionEntry {
	key: string
	schema: OptionSchema
}

export interface OptionGroup {
	id: string
	label: string
	options: OptionEntry[]
}

const DEFAULT_OPTION_GROUP = 'content'
export const UNGROUPED = 'other'
/** The group a block files what only a developer sets under. */
export const ADVANCED_OPTION_GROUP = 'advanced'

/**
 * The known keys first, in their canonical order, then whatever else the
 * catalog declared — a group this build has never heard of still shows up.
 */
export function orderedKeys<T>(buckets: Map<string, T>, known: string[]): string[] {
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

/**
 * The options of a block held by another's `block` option, as the panel offers
 * them.
 *
 * Never one the holder supplies itself: a card fetches and heads the chart it
 * wraps, so a source set on that chart does nothing — and, named after the
 * card, it would replace the card's own. In the simple mode, never one a
 * developer sets either, which the panel leaves out of a block's own options
 * the same way.
 */
export function heldBlockOptions(
	holder: OptionSchema,
	config: Record<string, OptionSchema>,
	advanced: boolean,
): Array<[string, OptionSchema]> {
	const supplied = new Set(holder.ui?.supplies ?? [])
	return Object.entries(config).filter(
		([key, schema]) =>
			!schema.ui?.hidden &&
			!supplied.has(key) &&
			offeredIn(schema, advanced) &&
			(advanced || schema.ui?.group !== ADVANCED_OPTION_GROUP),
	)
}

/**
 * Whether an option is offered in this mode. The simple mode leaves out what
 * the builder writes itself — a key, following the label it is derived from —
 * and what only code reads, which the block marks advanced.
 */
export function offeredIn(schema: OptionSchema, advanced: boolean): boolean {
	return advanced || IsSimpleBlockOption(schema)
}

export function optionLabel(key: string, schema: OptionSchema): string {
	if (schema.ui?.label) {
		return schema.ui.label
	}
	// Named after what is picked, not after the class the page is handed.
	if (schema['x-controller']) {
		return 'Table'
	}
	const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase()
	return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Whether a switch reads on. Left unset, it reads what the block does without
 * it, its schema's default: a table offers deleting rows unless it is turned
 * off, and a switch showing that off tells its author the table is safe when
 * it is not. Turned off, it is written `false`, never left unset: unset is
 * whatever that default is.
 */
export function switchOn(value: unknown, schema: OptionSchema | undefined): boolean {
	return value === undefined ? schema?.default === true : value === true
}

/** A required option is one with no default the caller can fall back to. */
export function isRequired(schema: OptionSchema): boolean {
	return !schema.optional && schema.default === undefined
}

/* ---- unions ------------------------------------------------------------- */

/** The kind a branch carries, named the way `typeof` names a value's. */
export function branchKind(branch: OptionSchema): string {
	return branch.type === 'integer' ? 'number' : branch.type
}

export function valueKind(value: unknown): string {
	return Array.isArray(value) ? 'array' : typeof value
}

/**
 * How well a value fits a branch: nothing at all when the branch cannot carry
 * its kind, otherwise the properties the branch knows and the value holds,
 * docked one for each the branch requires and the value is missing.
 *
 * Kind alone settles a union of plain kinds. It settles nothing between two
 * branches that are both objects — a form field and a group of them, say —
 * where what the value holds is the only evidence of which one it is.
 */
function branchFit(branch: OptionSchema, value: unknown): number {
	if (branchKind(branch) !== valueKind(value)) {
		return Number.NEGATIVE_INFINITY
	}
	const held = value as Record<string, unknown>
	let fit = 0
	for (const [key, nested] of Object.entries(branch.properties ?? {})) {
		if (held[key] !== undefined) {
			fit += 1
		} else if (!nested.optional) {
			fit -= 1
		}
	}
	return fit
}

/**
 * How much structure a branch adds of its own: the properties that are lists
 * or objects rather than plain values.
 *
 * It settles a tie and nothing else. An entry nobody has filled in fits every
 * branch of its kind alike, and of those, the one that nests a list of its own
 * is not what adding a single entry asked for: a form's field list offers a
 * field or a group of fields, and one field is not a group.
 */
function branchNesting(branch: OptionSchema): number {
	return Object.values(branch.properties ?? {}).filter(
		(nested) => nested.type === 'array' || nested.type === 'object',
	).length
}

/** The branch a value belongs to, or -1 while no branch can carry it. */
export function branchOf(branches: OptionSchema[], value: unknown): number {
	let best = -1
	let bestFit = Number.NEGATIVE_INFINITY
	let bestNesting = Number.POSITIVE_INFINITY
	branches.forEach((branch, index) => {
		const fit = branchFit(branch, value)
		if (fit === Number.NEGATIVE_INFINITY) {
			return
		}
		const nesting = branchNesting(branch)
		if (fit > bestFit || (fit === bestFit && nesting < bestNesting)) {
			best = index
			bestFit = fit
			bestNesting = nesting
		}
	})
	return best
}

/** Whether no other branch fits the value better than this one does. */
export function fitsAsWell(
	branches: OptionSchema[],
	index: number,
	value: unknown,
): boolean {
	const branch = branches[index]
	if (!branch) {
		return false
	}
	const fit = branchFit(branch, value)
	return (
		fit !== Number.NEGATIVE_INFINITY &&
		branches.every((other) => branchFit(other, value) <= fit)
	)
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

import type {
	BlockDraft,
	BlockTypeDescriptor,
	DynamicSlots,
	OptionSchema,
} from './types'
import { isRequired } from './catalog-options'

export function suggestedName(type: string): string {
	return type.charAt(0).toLowerCase() + type.slice(1)
}

/* ---- names the page shows --------------------------------------------- */

/**
 * The options that name a block, or an entry of a list, where it is rendered.
 *
 * Distinct from the name the editor gives a block: that one is the property of
 * the generated source and is never read by anyone looking at the page.
 */
const VISIBLE_NAME_KEYS = ['title', 'label', 'caption']

/**
 * Wording the page renders that has one obvious default, by the option that
 * carries it.
 *
 * Not a name: a submit button is not called after the block it closes. The
 * runtime has a fallback of its own for these, but it is a string the panel
 * never shows, so what an author reads there is a blank they cannot tell from
 * an option nobody implemented.
 */
const VISIBLE_TEXT_DEFAULTS: Record<string, string> = {
	submitLabel: 'Submit',
}

/**
 * Whether an option takes plain text: a string, or a union one of whose kinds
 * is — a banner's title is text or a translated, composed one.
 */
function takesText(schema: OptionSchema): boolean {
	return (
		schema.type === 'string' ||
		(schema.oneOf ?? []).some((branch) => branch.type === 'string')
	)
}

/** Whether an option carries text the page renders, demanded or not. */
function showsText(key: string, schema: OptionSchema): boolean {
	return (
		takesText(schema) &&
		(VISIBLE_NAME_KEYS.includes(key) || key in VISIBLE_TEXT_DEFAULTS)
	)
}

/** The property a list entry is named by where the page shows it. */
export function visibleNameKey(schema: OptionSchema): string | undefined {
	const properties = schema.properties ?? {}
	return VISIBLE_NAME_KEYS.find((key) => properties[key]?.type === 'string')
}

/** Enough of a singular for a list's own label: “Fields” → “Field”. */
function singular(label: string): string {
	if (/ies$/i.test(label)) {
		return `${label.slice(0, -3)}y`
	}
	return /(?<!s)s$/i.test(label) ? label.slice(0, -1) : label
}

/**
 * One entry of a list, named after the list itself: “Fields” holds “Field 1”.
 *
 * `rank` is the entry's place in the list, the number the panel already heads
 * it with. It is a name to rename and not a value pretending to be data, which
 * is the same bargain the rest of the seeding strikes — but a blank is worse
 * than a placeholder here, because this one is rendered: a form whose fields
 * are all unnamed is a column of empty labels.
 */
export function entryName(listLabel: string, rank: number): string {
	return `${singular(listLabel)} ${rank}`
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
	rank: number,
): unknown {
	const worded = VISIBLE_TEXT_DEFAULTS[key]
	if (worded !== undefined && schema.type === 'string') {
		return worded
	}
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
	if (schema.type === 'string' || showsText(key, schema)) {
		// An id is read back by other blocks, so it reads as a name, not a title.
		// A title is numbered, or a page with two of a type says the same word
		// twice and neither the canvas nor the panel tells them apart.
		return key === 'id'
			? suggestedName(descriptor.type)
			: `${descriptor.label ?? descriptor.type} ${rank}`
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
function placedConfig(
	descriptor: BlockTypeDescriptor,
	rank: number,
): Record<string, unknown> {
	const config = laidOutAcross(descriptor)
	for (const [key, schema] of Object.entries(descriptor.config)) {
		if (config[key] !== undefined) {
			continue
		}
		// What the block itself asks to be placed with: an empty state says
		// something from the moment it is dropped.
		if (schema.ui?.initial !== undefined) {
			config[key] = schema.ui.initial
			continue
		}
		// Text the page shows is seeded whether or not the type demands it. Most
		// titles are optional, so what the author got for placing a block was a
		// heading rendered as nothing at all.
		if (!showsText(key, schema) && !isRequired(schema)) {
			continue
		}
		const seed = seedFor(descriptor, key, schema, rank)
		if (seed !== undefined) {
			config[key] = seed
		}
	}
	openFirstRegion(descriptor, config)
	return config
}

/**
 * A container whose regions its own options declare is placed with one.
 *
 * A tab set placed with no tab is a strip with nothing to click, and nothing
 * on the canvas to drop a block into: the first tab is what makes it a tab set
 * the moment it lands, titled for the author to rename.
 */
function openFirstRegion(
	descriptor: BlockTypeDescriptor,
	config: Record<string, unknown>,
): void {
	const dynamic = descriptor.dynamicSlots
	const declared = dynamic ? config[dynamic.optionPath] : undefined
	const empty =
		declared === undefined || (Array.isArray(declared) && declared.length === 0)
	if (!dynamic || !empty) {
		return
	}
	config[dynamic.optionPath] = [regionAfter(descriptor.type, dynamic, [])]
}

/**
 * One more region for a container of type `type`, after the `existing` ones:
 * the second tab of a tab set is “Tab 2”, its children attached to `tab2`.
 */
export function regionAfter(
	type: string,
	dynamic: DynamicSlots,
	existing: unknown[],
): Record<string, unknown> {
	const rank = existing.length + 1
	const taken = new Set(
		existing
			.map((entry) => (entry as Record<string, unknown>)?.[dynamic.idKey])
			.filter((id): id is string => typeof id === 'string'),
	)
	const entry: Record<string, unknown> = {
		[dynamic.idKey]: slotIdFor(undefined, `${suggestedName(type)}${rank}`, taken),
	}
	if (dynamic.labelKey) {
		entry[dynamic.labelKey] = `${type} ${rank}`
	}
	return entry
}

/** `rank` is which one of its type this is on the page, counting from 1. */
export function newBlockDraft(
	descriptor: BlockTypeDescriptor,
	rank = 1,
): BlockDraft {
	return {
		name: suggestedName(descriptor.type),
		type: descriptor.type,
		config: placedConfig(descriptor, rank),
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
/**
 * The region of a container a child of it attaches to, given what is on screen.
 *
 * Only a container whose regions are its own to fill: one laying its children
 * out itself renders them wherever it renders them, and a region named on a
 * child would hide it. The one on screen is the author's answer; the first is
 * only what it falls back to before anything has been opened.
 */
export function shownRegion(
	descriptor: BlockTypeDescriptor | undefined,
	block: BlockDraft | undefined,
	open: string | undefined,
): { id: string; label: string } | undefined {
	if (!block || !descriptor?.dynamicSlots) {
		return undefined
	}
	const slots = slotsOf(descriptor, block)
	return slots.find((slot) => slot.id === open) ?? slots[0]
}

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

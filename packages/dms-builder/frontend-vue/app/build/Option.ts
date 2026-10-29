import { isRequired } from '../runtime/catalog'
import type { OptionSchema } from '../runtime/types'
import { enumLabel } from '../runtime/value-labels'

/** A word the help quotes from code, drawn as code. */
export const CODE_CLASS = 'rounded bg-elevated px-1 font-mono text-[11px] text-toned'

/** An enum value under the name its block gives it, or as it is spelled. */
export function valueLabel(schema: OptionSchema, value: unknown): string {
	return schema.ui?.valueLabels?.[String(value)] ?? enumLabel(value)
}

// Emptying a text box clears it; a select, an object or a list has no such
// gesture, so those keep an explicit way to unset the option.
export const SELF_CLEARING = new Set([
	'text',
	'textarea',
	'url',
	'icon',
	'color',
	'number',
	'switch',
	'boolean',
	'keyed',
])

/**
 * The lists an entry cannot do without, opened empty.
 *
 * What makes a group a group is the list of fields it holds: an entry added as
 * one and seeded without it would read as a field the moment it was drawn.
 */
export function seededLists(entry: OptionSchema): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(entry.properties ?? {})
			.filter(([, schema]) => schema.type === 'array' && isRequired(schema))
			.map(([key]) => [key, []]),
	)
}

/* ---- unions and raw JSON ------------------------------------------------ */

/** What a kind is called to someone who does not write the type down. */
export const BRANCH_NAMES: Record<string, string> = {
	string: 'Text',
	number: 'Number',
	integer: 'Number',
	boolean: 'Yes or no',
	array: 'List',
	object: 'Details',
}

/** The props Option takes. */
export interface Props {
	name: string
	schema: OptionSchema
	modelValue: unknown
	/** The resource a `field` widget resolves its choices against. */
	resource?: string
	/** The block being configured, so a data source can name its query. */
	blockName?: string
	/** Rule the row off from the switch above it, as a list of features reads. */
	separated?: boolean
	/**
	 * Leave the label row out: an entry of a list is already headed by its rank,
	 * and a second name for it — the option's own, with an index stuck to it —
	 * reads as another setting.
	 */
	hideLabel?: boolean
	/**
	 * The data type a sibling option holds, for an option typed by it: a form
	 * field's default takes the input the field's own type calls for.
	 */
	typedAs?: unknown
	/**
	 * Whether the object holding this option is itself left unset: a bound of a
	 * range nobody asked for is not one the page is missing.
	 */
	parentUnset?: boolean
}

/** The events Option emits. */
export interface Emits {
	'update:modelValue': [unknown]
	/**
	 * Several of the block's options at once.
	 *
	 * A data source writes both the URL it produced and the period scope the block
	 * follows: writing one without the other leaves a chart asking for bounds
	 * nobody sends, so they travel as one patch.
	 */
	patch: [Record<string, unknown>]
}

/** The emit function Option's parts are handed. */
export type EmitFn = <Event extends keyof Emits>(
	event: Event,
	...payload: Emits[Event]
) => void

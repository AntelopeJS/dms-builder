/**
 * The input a value takes when its kind is another option's data type.
 *
 * A form field's default is one of the field's own values: a number for a
 * number, a choice among the choices of a list. Asked for as JSON, a text
 * default had to be typed in quotes, and anything else was dropped without a
 * word. The data types the builder has an input for get that input; the others
 * keep the JSON box.
 */

export type TypedKind =
	| 'text'
	| 'longText'
	| 'number'
	| 'switch'
	| 'date'
	| 'time'
	| 'select'

export interface TypedEditor {
	kind: TypedKind
	/** The choices of a list, for `select`. */
	items?: Array<{ label: string; value: string | number }>
	/** Whether a list takes several of its choices at once. */
	multiple?: boolean
}

const KIND_OF: Record<string, TypedKind> = {
	string: 'text',
	email: 'text',
	phone: 'text',
	url: 'text',
	color: 'text',
	rich_text: 'longText',
	number: 'number',
	price: 'number',
	percentage: 'number',
	boolean: 'switch',
	date: 'date',
	string_time: 'time',
	select: 'select',
	status: 'select',
}

const DATE = /^\d{4}-\d{2}-\d{2}/
const TIME = /^\d{2}:\d{2}/

/**
 * The input for a value of the data type `typed` holds, a `$dataType` as the
 * draft carries it — or nothing, for a type with no input of its own.
 */
export function typedEditor(typed: unknown): TypedEditor | undefined {
	if (!isRecord(typed) || typeof typed.$dataType !== 'string') {
		return undefined
	}
	const kind = KIND_OF[typed.$dataType]
	const config = isRecord(typed.config) ? typed.config : {}
	if (!kind) {
		return undefined
	}
	// A date field taking a range or several dates holds a list of them, which
	// one date input cannot say.
	if (kind === 'date' && (config.range || config.multiple)) {
		return undefined
	}
	if (kind === 'select') {
		return {
			kind,
			items: choicesOf(config.items),
			multiple: config.multiple === true,
		}
	}
	return { kind }
}

/** Whether a value is one the input can show, rather than one it would lose. */
export function fitsEditor(value: unknown, editor: TypedEditor): boolean {
	switch (editor.kind) {
		case 'number':
			return typeof value === 'number'
		case 'switch':
			return typeof value === 'boolean'
		case 'date':
			return typeof value === 'string' && DATE.test(value)
		case 'time':
			return typeof value === 'string' && TIME.test(value)
		case 'select': {
			const known = (editor.items ?? []).map((item) => item.value)
			return editor.multiple
				? Array.isArray(value) && value.every((entry) => known.includes(entry))
				: known.includes(value as string | number)
		}
		default:
			return typeof value === 'string'
	}
}

function choicesOf(items: unknown): Array<{ label: string; value: string | number }> {
	if (!Array.isArray(items)) {
		return []
	}
	return items.filter(isRecord).flatMap((item) => {
		const value = item.value
		if (typeof value !== 'string' && typeof value !== 'number') {
			return []
		}
		const label = typeof item.label === 'string' && item.label ? item.label : String(value)
		return [{ label, value }]
	})
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

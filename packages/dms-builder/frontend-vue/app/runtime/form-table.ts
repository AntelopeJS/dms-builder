/**
 * A form that saves into a table, as the simple mode builds one.
 *
 * Someone building a page does not type an endpoint: they pick the table the
 * form fills. The form then submits to that table's create route, and each
 * column a row is written with is a field of the form — sent under the
 * column's name, with the column's label and type. The fields are the table's:
 * they are changed where the table is.
 *
 * Nothing records the choice but the form itself: the table is the one whose
 * create route the form submits to, and a column is asked for when a field of
 * the form is sent under its name.
 */
import { optionLabel } from './catalog'
import type {
	ResourceFieldStructure,
	ResourceStructure,
	ResourceSummary,
} from './types'

/** Where a form hands its values to a table, which creates a row of them. */
const CREATE_SEGMENT = '/new'
/** The method that route takes, as the DMS spells it. */
const CREATE_METHOD = 'POST'

type Entry = Record<string, unknown>

/** The address a form submits to, to create a row of `table`. */
export function createUrlOf(table: Pick<ResourceSummary, 'route'>): string {
	return `${table.route}${CREATE_SEGMENT}`
}

/** The table a form saves into, read off where it submits. */
export function formTableOf(
	config: Record<string, unknown> | undefined,
	tables: ResourceSummary[],
): ResourceSummary | undefined {
	const submitUrl = config?.submitUrl
	return typeof submitUrl === 'string'
		? tables.find((table) => createUrlOf(table) === submitUrl)
		: undefined
}

/** Where a form hands what it is filled with, as the simple mode tells it. */
export type FormDestination =
	| { kind: 'table'; table: ResourceSummary }
	| { kind: 'address'; url: string; method?: string }
	| { kind: 'none' }

/**
 * Where a form sends its values: a table's create route, an address someone
 * typed in the advanced view or in the code, or nowhere yet.
 */
export function destinationOf(
	config: Record<string, unknown> | undefined,
	tables: ResourceSummary[],
): FormDestination {
	const table = formTableOf(config, tables)
	if (table) {
		return { kind: 'table', table }
	}
	const url = config?.submitUrl
	if (typeof url === 'string' && url !== '') {
		const method = config?.submitUrlMethod
		return typeof method === 'string'
			? { kind: 'address', url, method }
			: { kind: 'address', url }
	}
	return { kind: 'none' }
}

/** The columns a form can ask for: those a row is written with. */
export function fillableColumns(
	table: ResourceStructure | undefined,
): ResourceFieldStructure[] {
	return (table?.fields ?? []).filter(
		(field) => !field.opaque && field.access === 'readwrite' && !!field.dataType,
	)
}

/** The field of a form that asks for one column. */
export function fieldFor(column: ResourceFieldStructure): Entry {
	return {
		id: column.name,
		label: column.label ?? optionLabel(column.name, { type: 'string' }),
		type: { config: {}, ...column.dataType },
		...(column.required ? { required: true } : {}),
	}
}

/**
 * The options a form takes to save into `table`, asking for `columns`.
 *
 * Loading is left out: a form that creates rows starts empty, and an address
 * it loaded from would only fill it with a row it is not editing.
 */
export function boundTo(
	table: ResourceSummary,
	columns: ResourceFieldStructure[],
): Record<string, unknown> {
	return {
		submitUrl: createUrlOf(table),
		submitUrlMethod: CREATE_METHOD,
		fetchUrl: undefined,
		fetchUrlMethod: undefined,
		fields: columns.map(fieldFor),
	}
}

/** The columns a form asks for: the names its fields are sent under. */
export function askedColumns(fields: unknown): Set<string> {
	const names = new Set<string>()
	for (const entry of entries(fields)) {
		if (typeof entry.id === 'string') {
			names.add(entry.id)
		}
		for (const nested of entries(entry.fields)) {
			if (typeof nested.id === 'string') {
				names.add(nested.id)
			}
		}
	}
	return names
}

function entries(value: unknown): Entry[] {
	return Array.isArray(value)
		? value.filter(
				(entry): entry is Entry =>
					typeof entry === 'object' && entry !== null && !Array.isArray(entry),
			)
		: []
}

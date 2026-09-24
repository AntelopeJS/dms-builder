/**
 * A form that saves into a table, as the simple mode builds one.
 *
 * Someone building a page does not type an endpoint: they pick the table the
 * form fills and tick the columns it asks for. The form then submits to that
 * table's create route, and each ticked column is a field of the form — sent
 * under the column's name, with the column's label and type.
 *
 * Nothing records the choice but the form itself: the table is the one whose
 * create route the form submits to, and a column is ticked when a field of the
 * form is sent under its name.
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
/** The route a table offers for creating a row, as the module lists it. */
const CREATE_ROUTE = 'create'

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

/**
 * Whether a table can take a row from a form. One whose routes the module
 * could not read is given the benefit of the doubt.
 */
export function takesRows(table: ResourceStructure): boolean {
	return !table.routes || table.routes.includes(CREATE_ROUTE)
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

/** The form's fields with the one asking for `column` added at the end. */
export function withColumn(fields: unknown, column: ResourceFieldStructure): Entry[] {
	return [...entries(fields), fieldFor(column)]
}

/** The form's fields without the one asking for `name`, groups included. */
export function withoutColumn(fields: unknown, name: string): Entry[] {
	return entries(fields)
		.filter((entry) => entry.id !== name || Array.isArray(entry.fields))
		.map((entry) =>
			Array.isArray(entry.fields)
				? { ...entry, fields: entries(entry.fields).filter((nested) => nested.id !== name) }
				: entry,
		)
}

function entries(value: unknown): Entry[] {
	return Array.isArray(value)
		? value.filter(
				(entry): entry is Entry =>
					typeof entry === 'object' && entry !== null && !Array.isArray(entry),
			)
		: []
}

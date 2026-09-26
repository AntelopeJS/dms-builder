/**
 * A block's data source as the builder writes it: a query on the page, named
 * after the block, that measures a table and splits what it measured.
 *
 * Read in two places — the source editor, and a panel that folds it away behind
 * one line saying what it measures — so both say it in the same words.
 */
import type {
	AddQueryInput,
	PageDraft,
	PageStructure,
	QueryResponseShape,
	ResourceFieldStructure,
} from './types'

/** How a query sums up what it measured, as an author picks it. */
export const MEASURE_WORDS: Record<string, string> = {
	count: 'Count of rows',
	sum: 'Sum',
	avg: 'Average',
	min: 'Minimum',
	max: 'Maximum',
}

/** How a filter compares, in the words of a sentence. */
export const FILTER_WORDS: Record<string, string> = {
	eq: 'is',
	ne: 'is not',
	gt: 'is more than',
	ge: 'is at least',
	lt: 'is less than',
	le: 'is at most',
}

/**
 * The arrangements that can carry the period before: the card's and the
 * figure's helpers take it, a bare series has nowhere to put it.
 */
export const COMPARED_SHAPES: QueryResponseShape[] = ['card', 'value']

/** The column types a period is read along. */
export const DATE_TYPES = ['date']

/** A query as read back, or as a draft holds it: the parts both share. */
export interface SourceQuery {
	name: string
	resource?: string
	template?: string
	params?: Record<string, unknown>
	response?: QueryResponseShape
	compare?: boolean
	endpoint?: string
}

interface Filter {
	field: string
	op: string
	value: unknown
}

/** A value the route is handed per request: how a period's bounds are written. */
export function isBound(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { $param?: unknown }).$param !== undefined
	)
}

export function filtersOf(params: Record<string, unknown> | undefined): Filter[] {
	return Array.isArray(params?.where) ? (params.where as Filter[]) : []
}

/**
 * The source a block reads, by the block's name: the draft's first, which is
 * where an unsaved edit lives, then what the page serves.
 */
export function sourceQuery(
	draft: PageDraft | null,
	structure: PageStructure | null,
	name: string,
): SourceQuery | undefined {
	const drafted = draft?.queries?.find((query) => query.name === name)
	if (drafted) {
		return drafted as AddQueryInput
	}
	return structure?.queries?.find(
		(query) => query.name === name && !query.opaque,
	) as SourceQuery | undefined
}

function labelOf(fields: ResourceFieldStructure[], name: unknown): string {
	const field = fields.find((entry) => entry.name === name)
	return field?.label || String(name)
}

function isDate(fields: ResourceFieldStructure[], name: unknown): boolean {
	const field = fields.find((entry) => entry.name === name)
	return DATE_TYPES.includes(field?.dataType?.$dataType ?? '')
}

/**
 * What a source measures, in one line: "Count of order rows, by Status", "Sum
 * of Amount by month, only where Status is paid, on the page's period".
 */
export function describeSource(
	query: SourceQuery | undefined,
	fields: ResourceFieldStructure[],
): string | undefined {
	if (!query?.resource) {
		return undefined
	}
	const params = query.params ?? {}
	const op = typeof params.op === 'string' ? params.op : 'count'
	let measure =
		op === 'count' || !params.field
			? `Count of ${query.resource} rows`
			: `${MEASURE_WORDS[op] ?? op} of ${labelOf(fields, params.field)}`
	if (params.groupBy) {
		measure += isDate(fields, params.groupBy)
			? ` by ${typeof params.bucket === 'string' ? params.bucket : 'day'}`
			: `, by ${labelOf(fields, params.groupBy)}`
	}
	const parts = [measure]
	const filters = filtersOf(params)
	const literal = filters.filter((filter) => !isBound(filter.value))
	if (literal.length === 1) {
		const [filter] = literal
		parts.push(
			`only where ${labelOf(fields, filter!.field)} ${FILTER_WORDS[filter!.op] ?? filter!.op} ${String(filter!.value)}`,
		)
	} else if (literal.length > 1) {
		parts.push(`${literal.length} conditions`)
	}
	if (filters.some((filter) => isBound(filter.value))) {
		parts.push(
			query.compare
				? "on the page's period, against the one before"
				: "on the page's period",
		)
	}
	return parts.join(', ')
}

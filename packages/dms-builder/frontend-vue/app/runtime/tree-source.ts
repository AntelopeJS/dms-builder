/**
 * A tree read from tables, as the simple mode's panel builds one: rows ranked
 * by their columns, nested under the row a column of theirs names, or the rows
 * of tables linked one under the other. The page's code answers it with one
 * call to the DMS, which reads the levels as they are written here.
 */
import type {
	AddTreeInput,
	PageDraft,
	PageStructure,
	ResourceFieldStructure,
	ResourceStructure,
	TreeLevelSpec,
	TreePeriod,
	TreeSourceSpec,
} from './types'

export type { TreeLevelSpec, TreePeriod, TreeSourceSpec }

/** How a tree read from tables branches, as the panel offers it. */
export type TreeBranching = 'columns' | 'parent' | 'linked'

export const TREE_PERIODS: readonly TreePeriod[] = ['day', 'month', 'quarter', 'year']

const RELATION_TYPES = new Set(['relation', 'cascader_relation'])

const DATE_TYPES = new Set(['date'])

/** The column a table's rows are told apart by. */
export const ROW_KEY = '_id'

/** How a tree written as `spec` branches, as the panel shows it. */
export function branchingOf(spec: TreeSourceSpec): TreeBranching {
	if (spec.levels.some((level) => level.by !== undefined)) {
		return 'columns'
	}
	if (spec.levels.length === 1 && spec.levels[0]?.parent) {
		return 'parent'
	}
	return spec.levels.length > 1 ? 'linked' : 'columns'
}

/** The table a column's rows point at, for a column holding another row. */
export function relationTarget(field: ResourceFieldStructure): string | undefined {
	const type = field.dataType
	if (!type || !RELATION_TYPES.has(type.$dataType)) {
		return undefined
	}
	const controller = type.config?.dataApiController as { $ref?: { resource?: unknown } } | undefined
	const target = controller?.$ref?.resource
	return typeof target === 'string' ? target : undefined
}

export function isDateField(field: ResourceFieldStructure | undefined): boolean {
	return !!field?.dataType && DATE_TYPES.has(field.dataType.$dataType)
}

/** The columns a person picks among: the row key is the table's, not theirs. */
export function pickableFields(table: ResourceStructure | undefined): ResourceFieldStructure[] {
	return (table?.fields ?? []).filter((field) => field.name !== ROW_KEY && !field.opaque)
}

/** The column of a table pointing at another row of the same table, if one does. */
export function selfRelation(table: ResourceStructure | undefined): string | undefined {
	return pickableFields(table).find((field) => relationTarget(field) === table?.ref)?.name
}

/** A column of one table pointing at the rows of another. */
export interface TableLink {
	resource: string
	field: string
}

/** The columns of every other table pointing at the rows of `target`. */
export function linksTo(tables: ResourceStructure[], target: string): TableLink[] {
	return tables.flatMap((table) =>
		table.ref === target
			? []
			: pickableFields(table)
					.filter((field) => relationTarget(field) === target)
					.map((field) => ({ resource: table.ref, field: field.name })),
	)
}

const NUMBER_TYPES = new Set(['number', 'price', 'percentage'])

/**
 * The columns a row can be named by: any but one holding another row, which
 * would name it by that row's key.
 */
export function labelFields(table: ResourceStructure | undefined): ResourceFieldStructure[] {
	return pickableFields(table).filter((field) => !relationTarget(field))
}

/**
 * The columns a row is best named by when nobody chose: its first text column,
 * or, with none, when it happened and how much — "Sep 12, 2026 · 120".
 */
export function defaultLabel(
	table: ResourceStructure | undefined,
	taken: readonly string[] = [],
): string[] {
	const fields = labelFields(table).filter((field) => !taken.includes(field.name))
	const typed = (types: Set<string>) =>
		fields.find((field) => types.has(field.dataType?.$dataType ?? ''))
	const text = typed(new Set(['string']))
	if (text) {
		return [text.name]
	}
	const when = typed(DATE_TYPES)
	const much = typed(NUMBER_TYPES)
	const named = when || much ? [when, much] : [fields[0]]
	return named.filter((field) => field !== undefined).map((field) => field.name)
}

/** The column types rows are best ranked by: values many rows share. */
const RANKING_TYPES = ['status', 'select', 'boolean', 'relation', 'string', 'date']

/**
 * The column a new ranking level starts on: one not ranked by yet, of a type
 * many rows share a value of — a status before a text, a text before a date,
 * and a number last, since each row tends to hold its own.
 */
export function nextRanking(
	table: ResourceStructure | undefined,
	taken: readonly string[],
): string | undefined {
	const free = pickableFields(table).filter((field) => !taken.includes(field.name))
	const rank = (type: string | undefined) => {
		const at = RANKING_TYPES.indexOf(type ?? '')
		return at === -1 ? RANKING_TYPES.length : at
	}
	return [...free].sort((a, b) => rank(a.dataType?.$dataType) - rank(b.dataType?.$dataType))[0]
		?.name
}

/** A tree of a table's rows, ranked by `by` and named by its first text column. */
export function columnsTree(table: ResourceStructure, by: string[] = []): TreeSourceSpec {
	return {
		levels: [
			...by.map((column) => ({ resource: table.ref, by: column })),
			{ resource: table.ref, label: defaultLabel(table) },
		],
	}
}

/**
 * A tree of a table's rows, each under the row its `parent` column names: the
 * column pointing at the table itself when one does, left to pick otherwise.
 */
export function parentTree(table: ResourceStructure): TreeSourceSpec {
	return {
		levels: [
			{ resource: table.ref, label: defaultLabel(table), parent: selfRelation(table) ?? '' },
		],
	}
}

/** A tree of a table's rows, with nothing linked under them yet. */
export function linkedTree(table: ResourceStructure): TreeSourceSpec {
	return { levels: [{ resource: table.ref, label: defaultLabel(table) }] }
}

/** The tree `spec` read the way `branching` reads it, from the same top table. */
export function withBranching(
	spec: TreeSourceSpec,
	branching: TreeBranching,
	table: ResourceStructure,
): TreeSourceSpec {
	const fresh =
		branching === 'columns'
			? columnsTree(table)
			: branching === 'parent'
				? parentTree(table)
				: linkedTree(table)
	return spec.lazy ? { ...fresh, lazy: true } : fresh
}

/** The levels grouping the rows, the ones a tree by columns ranks them by. */
export function rankingLevels(spec: TreeSourceSpec): TreeLevelSpec[] {
	return spec.levels.filter((level) => level.by !== undefined)
}

/** The level listing the rows at the end of each branch, when there is one. */
export function rowsLevel(spec: TreeSourceSpec): TreeLevelSpec | undefined {
	return spec.levels.find((level) => level.by === undefined)
}

/**
 * A tree by columns whose rankings are `by`, and whose branches end on the rows
 * named by `label` — or on a count, with none.
 */
export function withRanking(
	spec: TreeSourceSpec,
	ranking: Array<Pick<TreeLevelSpec, 'by' | 'every'>>,
	rows: Pick<TreeLevelSpec, 'label' | 'icon'> | undefined,
): TreeSourceSpec {
	const resource = spec.levels[0]?.resource ?? ''
	const levels: TreeLevelSpec[] = ranking.map((level) => ({
		resource,
		by: level.by,
		...(level.every ? { every: level.every } : {}),
	}))
	if (rows) {
		levels.push({ resource, ...rows })
	}
	return { ...spec, levels }
}

/** Whether `spec` is one the DMS can read: every level knowing what to do. */
export function treeProblem(spec: TreeSourceSpec): string | undefined {
	if (!spec.levels.length || !spec.levels[0]?.resource) {
		return 'Pick the table it reads.'
	}
	const firstRows = spec.levels.findIndex((level) => level.by === undefined)
	for (const [at, level] of spec.levels.entries()) {
		if (level.by === '') {
			return `Pick the column level ${at + 1} ranks by.`
		}
		if (level.by === undefined && firstRows !== -1 && at > firstRows && !level.link) {
			return `Pick how level ${at + 1} links to the one above.`
		}
	}
	if (spec.levels.length === 1 && firstRows === 0 && spec.levels[0]?.parent === '') {
		return 'Pick the column naming the row each sits under.'
	}
	return undefined
}

/**
 * The tree a block reads from tables, by the block's name: the draft's first,
 * where an unsaved edit lives, then what the page serves.
 */
export function treeSource(
	draft: PageDraft | null,
	structure: PageStructure | null,
	name: string,
): AddTreeInput | undefined {
	const drafted = draft?.trees?.find((tree) => tree.name === name)
	if (drafted || draft?.trees) {
		return drafted
	}
	const served = structure?.trees?.find((tree) => tree.name === name && !tree.opaque)
	return served?.levels?.length
		? { name: served.name, levels: served.levels, ...(served.lazy ? { lazy: true } : {}) }
		: undefined
}

/** The address a tree's route will answer at, which is what its block reads. */
export function treeEndpoint(pageRef: string, name: string): string {
	return `${pageRef}/tree/${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`
}

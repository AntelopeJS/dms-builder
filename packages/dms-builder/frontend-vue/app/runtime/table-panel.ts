/**
 * A table block, as the simple mode's panel edits it.
 *
 * The panel is split in parts — the table it lists and that table's columns,
 * how its rows come and are named, what people can do with them — and each
 * reads the same block: which table it lists, and what that table serves.
 */
import { computed } from 'vue'
import { descriptorOf } from './catalog'
import { findNode } from './draft'
import { mergePatch } from './object'
import { useBuilder } from './session'
import type {
	OptionSchema,
	ResourceFieldStructure,
	ResourceStructure,
} from './types'

/** The block the simple mode edits with a panel of its own. */
export const TABLE_BLOCK = 'TableView'

/**
 * The options that panel edits. Whatever else the block declares is still
 * offered the way any block's options are.
 */
export const TABLE_PANEL_OPTIONS = new Set([
	'caption',
	'labelKey',
	'defaultSort',
	'rowActions',
	'archiveMode',
])

/**
 * The route of the table's API each action goes through. An action the API
 * does not serve is still offered, and refused on every use.
 */
export const ACTION_ROUTES: Record<string, string> = {
	add: 'create',
	duplicate: 'create',
	edit: 'edit',
	delete: 'delete',
	details: 'get',
	archive: 'archive',
}

/**
 * Whether a table offers an action. Left unset, it does what the block does
 * without it; set under a rule, it is on wherever the rule lets it be.
 */
export function actionOn(value: unknown, offered: boolean): boolean {
	if (value === undefined) {
		return offered
	}
	if (typeof value === 'object' && value !== null) {
		return (value as { isEnabled?: unknown }).isEnabled !== false
	}
	return value === true
}

/**
 * The value turning an action on or off. One under a rule keeps its rule; a
 * plain one going back to what the block does anyway is left unset.
 */
export function actionTurned(
	value: unknown,
	on: boolean,
	offered: boolean,
): unknown {
	if (typeof value === 'object' && value !== null) {
		return { ...value, isEnabled: on }
	}
	return on === offered ? undefined : on
}

/** An action set under a rule: on only for the rows the rule lets through. */
export function ruled(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { rule?: unknown }).rule !== undefined
	)
}

/** A table's columns left to right, the way the block lays them out. */
export function columnsInOrder(
	fields: ResourceFieldStructure[] | undefined,
): ResourceFieldStructure[] {
	return [...(fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** Whether the table's API serves a route; one that says nothing serves all. */
export function serves(
	table: ResourceStructure | undefined,
	route: string,
): boolean {
	return !table?.routes || table.routes.includes(route)
}

export function useTableBlock(path: () => string) {
	const builder = useBuilder()
	const session = builder.session

	const block = computed(() =>
		session.value.draft ? findNode(session.value.draft, path()) : undefined,
	)
	const config = computed<Record<string, unknown>>(() => block.value?.config ?? {})
	const options = computed<Record<string, OptionSchema>>(
		() => descriptorOf(session.value.catalog, block.value?.type)?.config ?? {},
	)
	const table = computed(() => block.value?.controller)
	const structure = computed(() =>
		table.value ? session.value.resourceStructures[table.value] : undefined,
	)
	const columns = computed(() => columnsInOrder(structure.value?.fields))
	/** The column that marks a row archived, which archiving needs. */
	const archiveColumn = computed(() =>
		structure.value?.fields.find((field) => field.archiveField),
	)
	const actions = computed(() => options.value.rowActions?.properties ?? {})

	function has(key: string): boolean {
		return key in options.value
	}

	function patch(values: Record<string, unknown>): void {
		builder.patchConfig(path(), values)
	}

	function rowActions(): Record<string, unknown> {
		const value = config.value.rowActions
		return typeof value === 'object' && value !== null
			? (value as Record<string, unknown>)
			: {}
	}

	function offered(key: string): boolean {
		return actions.value[key]?.default === true
	}

	function action(key: string): unknown {
		return rowActions()[key]
	}

	function isOn(key: string): boolean {
		return actionOn(action(key), offered(key))
	}

	/** Every other action is kept as it is; none left leaves no empty object. */
	function setAction(key: string, on: boolean): void {
		const next = mergePatch(rowActions(), {
			[key]: actionTurned(action(key), on, offered(key)),
		})
		patch({ rowActions: Object.keys(next).length ? next : undefined })
	}

	/**
	 * List another table. What named this one's columns — the row's name, the
	 * sort — means nothing to the next one.
	 */
	async function list(ref: string): Promise<void> {
		const at = path()
		if (ref === table.value) {
			return
		}
		builder.setController(at, ref)
		builder.patchConfig(at, { labelKey: undefined, defaultSort: undefined })
		await builder.loadResource(ref)
	}

	return {
		block,
		config,
		options,
		table,
		structure,
		columns,
		archiveColumn,
		actions,
		has,
		patch,
		isOn,
		action,
		setAction,
		list,
	}
}

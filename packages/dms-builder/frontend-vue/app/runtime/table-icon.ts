/**
 * A table's icon, as the builder draws it: the one its DataController declares
 * with `@TableIcon` — which the DMS draws its table views with too — else the
 * generic one of the place it is drawn in. The icon is optional, and a DMS
 * that predates it draws every table with the generic one.
 */
import { lineIcon } from './catalog'
import { TABLE_BLOCK } from './constants'
import type { BlockCatalog, BlockDraft, ResourceSummary } from './types'

/** A table where its data is edited: the Tables tab. */
export const TABLE_DATA_ICON = 'i-ph-database'

/** A table a block lists, as the DMS draws one that declares no icon. */
export const TABLE_BLOCK_ICON = 'i-ph-table'

/** Anything naming a table's icon: its summary, its structure. */
interface WithIcon {
	icon?: string
}

/** The table's icon on a line, else `fallback`. */
export function tableIcon(
	table: WithIcon | undefined,
	fallback: string = TABLE_DATA_ICON,
): string {
	return lineIcon(table?.icon || fallback)
}

/** Whether the DMS takes a table icon, for the builder to offer one. */
export function takesTableIcons(catalog: BlockCatalog | null): boolean {
	return catalog?.tableIcons === true
}

/**
 * A block's icon on a line — the layers, the inspector's heading. A table
 * block over a table that declares an icon takes that one, as the DMS draws
 * it; any other block, its type's.
 */
export function blockLineIcon(
	block: BlockDraft,
	typeIcon: string | undefined,
	tables: ResourceSummary[],
): string {
	const table =
		block.type === TABLE_BLOCK && block.controller
			? tables.find((entry) => entry.ref === block.controller)
			: undefined
	return lineIcon(table?.icon ?? typeIcon)
}

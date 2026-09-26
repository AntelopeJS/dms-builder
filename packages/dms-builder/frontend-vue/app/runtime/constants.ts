import type { TypedKind } from './typed-values'
import type { FieldFlag } from './types'

// State keys owned by the host DMS. Declared here rather than imported so this
// layer carries no build-time dependency on the core layers; the key and the
// shape are the whole contract.
export const HEADER_ACTIONS_STATE_KEY = 'dms:header-actions'
export const APP_OVERLAYS_STATE_KEY = 'dms-app-overlays'

export const OVERLAY_COMPONENT_NAME = 'DmsBuilderOverlay'
export const SESSION_STATE_KEY = 'dms-builder:session'

export const ACTION_ID = 'dms-builder-edit'
// The DMS renders this action on its own builder button, keyed by id; the
// icon is only a fallback for a host that lays it out generically.
export const ACTION_ICON = 'i-ph-hammer-light'
export const ACTION_LABEL = 'Builder — edit this page'
export const ACTION_ORDER = 90

export const API_PREFIX = '/api/builder'
// The DMS's own layout endpoint, not the builder's.
export const PAGE_LAYOUT_PATH = '/dms/pagelayout'
export const PREVIEW_DEBOUNCE_MS = 150

// The frontend bundles these two Iconify collections; anything else resolves to
// an empty icon, so both the picker and its search stay inside them.
export const ICON_PREFIXES = ['ph', 'lucide'] as const
export const ICON_SEARCH_URL = 'https://api.iconify.design/search'
export const ICON_SEARCH_LIMIT = 48
export const HISTORY_LIMIT = 50
export const TOAST_MS = 2600

export const OPTION_GROUPS = [
	'content',
	'features',
	'data',
	'appearance',
	'layout',
	'behavior',
	'advanced',
] as const

/**
 * The colours every theme defines, offered as swatches: a name follows the
 * theme where a hex code stays put.
 */
export const THEME_COLORS = [
	'primary',
	'secondary',
	'success',
	'info',
	'warning',
	'error',
	'neutral',
] as const

/**
 * The containers that lay their children out side by side.
 *
 * The catalog states no axis, and everything about aiming at a block turns on
 * it: which of its sides name its neighbours, which way the insertion line
 * runs, and whether "below this one" is a place its container already has.
 */
export const ROW_CONTAINERS = new Set(['HStack', 'GridRow'])

/**
 * The blocks pinned across the whole width of their container.
 *
 * A `GridRow` sets `gridColumn: 1 / -1` on itself, so two of them can never end
 * up side by side however a drop is aimed at them. The editor has to say so
 * instead of accepting a gesture the layout will not honour.
 */
export const FULL_WIDTH_BLOCKS = new Set(['GridRow'])

/**
 * The blocks that only lay other blocks out.
 *
 * The page is a grid its author never sees: they put one block beside or under
 * another, and the editor writes whatever rows, columns and stacks that takes.
 * None of these is offered in the palette or named on the canvas, whoever wrote
 * them — someone building a page composes it from what it shows, not from the
 * boxes that hold it.
 */
export const LAYOUT_BLOCKS = new Set(['Grid', 'GridRow', 'HStack', 'VStack'])

/**
 * The container the editor builds to put two blocks side by side where nothing
 * lays them out in columns yet: a grid of one row, the row holding them both.
 */
export const ROW_WRAPPER = 'Grid'

/**
 * The container the editor builds to stack two blocks inside one column.
 *
 * A row lays its children out side by side and nothing else, so it is the only
 * way "below this cell" can mean anything other than a new full-width row.
 */
export const COLUMN_CONTAINER = 'VStack'

export const BLOCK_GROUP_LABELS: Record<string, string> = {
	layout: 'Layout',
	content: 'Content',
	data: 'Data',
	visualization: 'Visualization',
	other: 'Other',
}

/**
 * The yes-or-nos of a table's field, as every view setting them names them:
 * the grid of a table's fields, a field opened, a new field, the columns of a
 * table block. Each view shows the ones it sets — `fieldFlags` — so a flag
 * reads the same wherever it is set.
 */
const FIELD_FLAGS: Record<FieldFlag, { label: string; help: string }> = {
	listable: { label: 'Shown', help: 'Shown in the table on first load.' },
	selectable: {
		label: 'In option lists',
		help: 'Offered when another table points at a row of this one.',
	},
	searchable: { label: 'Search', help: "Read by the table's search bar." },
	sortable: { label: 'Sort', help: 'Usable to sort the table.' },
	filterable: { label: 'Filter', help: "Usable in the table's filters." },
	required: { label: 'Required', help: 'A row cannot be saved without it.' },
	exported: { label: 'In export', help: "Carried by the table's CSV export." },
}

export function fieldFlags(
	...keys: FieldFlag[]
): { key: FieldFlag; label: string; help: string }[] {
	return keys.map((key) => ({ key, ...FIELD_FLAGS[key] }))
}

/** The DataType a form's field starts as, until the author picks another: Text. */
export const DEFAULT_DATA_TYPE = 'string'

/**
 * The HTTP routes a table can serve, as its API tab switches them: the ones
 * that read rows, then the ones that write them.
 */
export const TABLE_ROUTES = [
	{
		key: 'list',
		label: 'List',
		help: 'Rows of the table, paged, sorted and filtered.',
		writes: false,
	},
	{ key: 'get', label: 'Read', help: 'One row, by its id.', writes: false },
	{
		key: 'select',
		label: 'Option lists',
		help: 'Rows offered when another table points at this one.',
		writes: false,
	},
	{ key: 'export', label: 'Export', help: 'Rows as a CSV file.', writes: false },
	{ key: 'create', label: 'Create', help: 'Add a row.', writes: true },
	{ key: 'edit', label: 'Update', help: 'Change a row.', writes: true },
	{ key: 'delete', label: 'Delete', help: 'Remove a row for good.', writes: true },
	{
		key: 'archive',
		label: 'Archive',
		help: 'Set a row aside without deleting it.',
		writes: true,
	},
] as const

/**
 * The families a new field's type is picked from. Twenty-odd types in one
 * list read as a wall; grouped by what the column holds, the one wanted is
 * found by where it would be. A type no family names lands in the last one.
 */
export const DATA_TYPE_FAMILIES = [
	{ id: 'text', label: 'Text' },
	{ id: 'numbers', label: 'Numbers and time' },
	{ id: 'choices', label: 'Choices' },
	{ id: 'links', label: 'Links to other tables' },
	{ id: 'other', label: 'Other' },
] as const

export interface DataTypeInfo {
	/** What it is called in a Type menu. */
	label: string
	icon: string
	family: (typeof DATA_TYPE_FAMILIES)[number]['id']
	/** The input a value of it takes, for the ones the builder has one for. */
	input?: TypedKind
}

/**
 * The built-in DataTypes, as the builder shows them, in the order a Type menu
 * offers them. The id is how the source spells a type — `cascader_relation`,
 * `string_time` — which says little to someone choosing what a column holds;
 * a type a project registered itself is spelled out from its id.
 */
export const DATA_TYPES: Record<string, DataTypeInfo> = {
	string: { label: 'Text', icon: 'i-ph-text-t', family: 'text', input: 'text' },
	rich_text: {
		label: 'Rich text',
		icon: 'i-ph-text-align-left',
		family: 'text',
		input: 'longText',
	},
	number: { label: 'Number', icon: 'i-ph-hash', family: 'numbers', input: 'number' },
	price: {
		label: 'Price',
		icon: 'i-ph-currency-circle-dollar',
		family: 'numbers',
		input: 'number',
	},
	percentage: {
		label: 'Percentage',
		icon: 'i-ph-percent',
		family: 'numbers',
		input: 'number',
	},
	date: { label: 'Date', icon: 'i-ph-calendar-blank', family: 'numbers', input: 'date' },
	string_time: {
		label: 'Time of day',
		icon: 'i-ph-clock',
		family: 'numbers',
		input: 'time',
	},
	boolean: {
		label: 'Yes / no',
		icon: 'i-ph-toggle-right',
		family: 'choices',
		input: 'switch',
	},
	status: { label: 'Status', icon: 'i-ph-tag', family: 'choices', input: 'select' },
	select: {
		label: 'Choice list',
		icon: 'i-ph-list-checks',
		family: 'choices',
		input: 'select',
	},
	email: {
		label: 'Email',
		icon: 'i-ph-envelope-simple',
		family: 'text',
		input: 'text',
	},
	phone: { label: 'Phone number', icon: 'i-ph-phone', family: 'text', input: 'text' },
	url: { label: 'Link', icon: 'i-ph-globe-simple', family: 'text', input: 'text' },
	color: { label: 'Colour', icon: 'i-ph-palette', family: 'choices', input: 'text' },
	password: { label: 'Password', icon: 'i-ph-key', family: 'text' },
	relation: {
		label: 'Row of another table',
		icon: 'i-ph-link-simple',
		family: 'links',
	},
	cascader_relation: {
		label: 'Row of a nested table',
		icon: 'i-ph-stack',
		family: 'links',
	},
	tree: { label: 'Tree', icon: 'i-ph-tree-structure', family: 'links' },
	address: { label: 'Postal address', icon: 'i-ph-map-pin', family: 'other' },
	permissions: { label: 'Permissions', icon: 'i-ph-shield-check', family: 'other' },
	file: { label: 'File', icon: 'i-ph-file', family: 'other' },
	image: { label: 'Image', icon: 'i-ph-image', family: 'other' },
}

/** The icon of a DataType a project registered itself. */
export const OTHER_DATA_TYPE_ICON = 'i-ph-dots-three-circle'

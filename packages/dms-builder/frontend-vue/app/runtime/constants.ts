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

/** The DataType a form's field starts as, until the author picks another: Text. */
export const DEFAULT_DATA_TYPE = 'string'

/**
 * What each built-in DataType is called in a Type menu. The id is how the
 * source spells it — `cascader_relation`, `string_time` — which says little to
 * someone choosing what a column holds.
 */
export const DATA_TYPE_LABELS: Record<string, string> = {
	string: 'Text',
	rich_text: 'Rich text',
	number: 'Number',
	price: 'Price',
	percentage: 'Percentage',
	date: 'Date',
	string_time: 'Time of day',
	boolean: 'Yes / no',
	status: 'Status',
	select: 'Choice list',
	email: 'Email',
	phone: 'Phone number',
	url: 'Link',
	color: 'Colour',
	password: 'Password',
	relation: 'Row of another table',
	cascader_relation: 'Row of a nested table',
	tree: 'Tree',
	address: 'Postal address',
	permissions: 'Permissions',
	file: 'File',
	image: 'Image',
}

/**
 * The HTTP routes a table can serve, as its API tab switches them: the ones
 * that read rows, then the ones that write them.
 */
export const TABLE_ROUTES: {
	key: string
	label: string
	help: string
	writes: boolean
}[] = [
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
]

/** The icon a DataType is shown with, beside its name or on its own. */
export const DATA_TYPE_ICONS: Record<string, string> = {
	string: 'i-ph-text-t',
	rich_text: 'i-ph-text-align-left',
	number: 'i-ph-hash',
	price: 'i-ph-currency-circle-dollar',
	percentage: 'i-ph-percent',
	date: 'i-ph-calendar-blank',
	string_time: 'i-ph-clock',
	boolean: 'i-ph-toggle-right',
	status: 'i-ph-tag',
	select: 'i-ph-list-checks',
	email: 'i-ph-envelope-simple',
	phone: 'i-ph-phone',
	url: 'i-ph-globe-simple',
	color: 'i-ph-palette',
	password: 'i-ph-key',
	relation: 'i-ph-link-simple',
	cascader_relation: 'i-ph-stack',
	tree: 'i-ph-tree-structure',
	address: 'i-ph-map-pin',
	permissions: 'i-ph-shield-check',
	file: 'i-ph-file',
	image: 'i-ph-image',
}

/** The icon of a DataType a project registered itself. */
export const OTHER_DATA_TYPE_ICON = 'i-ph-dots-three-circle'

/**
 * The families a new field's type is picked from. Twenty-odd types in one
 * list read as a wall; grouped by what the column holds, the one wanted is
 * found by where it would be. A type no family names lands in the last one.
 */
export const DATA_TYPE_GROUPS: { label: string; types: string[] }[] = [
	{
		label: 'Text',
		types: ['string', 'rich_text', 'email', 'phone', 'url', 'password'],
	},
	{
		label: 'Numbers and time',
		types: ['number', 'price', 'percentage', 'date', 'string_time'],
	},
	{ label: 'Choices', types: ['boolean', 'status', 'select', 'color'] },
	{
		label: 'Links to other tables',
		types: ['relation', 'cascader_relation', 'tree'],
	},
	{ label: 'Other', types: ['address', 'file', 'image', 'permissions'] },
]

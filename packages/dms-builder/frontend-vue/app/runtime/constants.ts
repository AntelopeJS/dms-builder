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

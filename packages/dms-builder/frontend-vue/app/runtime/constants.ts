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

export const BLOCK_GROUP_LABELS: Record<string, string> = {
	layout: 'Layout',
	content: 'Content',
	data: 'Data',
	visualization: 'Visualization',
	other: 'Other',
}

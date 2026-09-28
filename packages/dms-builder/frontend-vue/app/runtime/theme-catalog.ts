import type { LogoSlot } from './types'

/** A variable the editor offers by name, with what it changes on screen. */
export interface ThemeVariableEntry {
	name: string
	label: string
	hint: string
	/** Whether the value is a color, which gets a picker beside its text. */
	color: boolean
}

export interface ThemeVariableGroup {
	label: string
	variables: ThemeVariableEntry[]
}

/** A logo slot the dashboard shows today, with where. */
export interface ThemeLogoEntry {
	slot: LogoSlot
	label: string
	hint: string
}

/**
 * The variables the editor lists before any is touched: the tokens the DMS
 * itself declares a light and a dark default for, named after what they
 * paint. Any other custom property can still be added by name.
 */
export const THEME_VARIABLE_GROUPS: ThemeVariableGroup[] = [
	{
		label: 'Colors',
		variables: [
			{ name: '--ui-primary', label: 'Primary', hint: 'Buttons, links, the active menu entry, focus rings', color: true },
			{ name: '--ui-bg', label: 'Surface', hint: 'Sidebar, panels, inputs', color: true },
			{ name: '--ui-bg-muted', label: 'Canvas', hint: 'The page behind the cards', color: true },
			{ name: '--ui-bg-elevated', label: 'Raised surface', hint: 'Table headers, hovered rows, tiles', color: true },
			{ name: '--dms-surface-card', label: 'Cards', hint: 'The frame around each component', color: true },
			{ name: '--ui-border', label: 'Borders', hint: 'Hairlines between surfaces', color: true },
			{ name: '--ui-text', label: 'Text', hint: 'Body text', color: true },
			{ name: '--ui-text-muted', label: 'Secondary text', hint: 'Descriptions and hints', color: true },
		],
	},
	{
		label: 'Shape and type',
		variables: [
			{ name: '--ui-radius', label: 'Corner radius', hint: 'Buttons, inputs, cards, menus', color: false },
			{ name: '--font-sans', label: 'Font', hint: 'Every text of the dashboard', color: false },
		],
	},
]

/**
 * The slots the DMS draws today. The email logo and the favicon are part of
 * the theme's files already, and join this list once the DMS reads them.
 */
export const THEME_LOGO_SLOTS: ThemeLogoEntry[] = [
	{ slot: 'default', label: 'Logo', hint: 'Expanded sidebar, sign-in and error pages' },
	{ slot: 'collapsed', label: 'Collapsed logo', hint: 'Sidebar folded to its icons' },
]

const CATALOG_NAMES = new Set(
	THEME_VARIABLE_GROUPS.flatMap((group) => group.variables.map((entry) => entry.name)),
)

/** The variables a theme sets that the catalog does not list, in name order. */
export function otherVariables(names: Iterable<string>): string[] {
	return [...new Set(names)].filter((name) => !CATALOG_NAMES.has(name)).sort()
}

/** Whether a string can name a CSS custom property. */
export function isVariableName(name: string): boolean {
	return /^--[A-Za-z0-9_-]+$/.test(name)
}

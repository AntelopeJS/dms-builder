import type { LogoSlot } from './types'

/**
 * What a variable's value has to be, named after a CSS property it would be a
 * valid value of: the browser is what knows every color, length and font
 * syntax, so the value is checked against that property.
 */
export type ThemeValueKind = 'color' | 'border-radius' | 'font-family'

/** A variable the editor offers by name, with what it changes on screen. */
export interface ThemeVariableEntry {
	name: string
	label: string
	hint: string
	/** A color gets a picker beside its text. */
	kind: ThemeValueKind
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
			{ name: '--ui-primary', label: 'Primary', hint: 'Buttons, links, the active menu entry, focus rings', kind: 'color' },
			{ name: '--ui-bg', label: 'Surface', hint: 'Sidebar, panels, inputs', kind: 'color' },
			{ name: '--ui-bg-muted', label: 'Canvas', hint: 'The page behind the cards', kind: 'color' },
			{ name: '--ui-bg-elevated', label: 'Raised surface', hint: 'Table headers, hovered rows, tiles', kind: 'color' },
			{ name: '--dms-surface-card', label: 'Cards', hint: 'The frame around each component', kind: 'color' },
			{ name: '--ui-border', label: 'Borders', hint: 'Hairlines between surfaces', kind: 'color' },
			{ name: '--ui-text', label: 'Text', hint: 'Body text', kind: 'color' },
			{ name: '--ui-text-muted', label: 'Secondary text', hint: 'Descriptions and hints', kind: 'color' },
		],
	},
	{
		label: 'Shape and type',
		variables: [
			{ name: '--ui-radius', label: 'Corner radius', hint: 'Buttons, inputs, cards, menus', kind: 'border-radius' },
			{ name: '--font-sans', label: 'Font', hint: 'Every text of the dashboard', kind: 'font-family' },
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

const CATALOG = new Map(
	THEME_VARIABLE_GROUPS.flatMap((group) => group.variables.map((entry) => [entry.name, entry] as const)),
)
const CATALOG_NAMES = new Set(CATALOG.keys())

/** The catalog's entry for a variable, if the catalog lists it. */
export function catalogEntry(name: string): ThemeVariableEntry | undefined {
	return CATALOG.get(name)
}

/** The variables a theme sets that the catalog does not list, in name order. */
export function otherVariables(names: Iterable<string>): string[] {
	return [...new Set(names)].filter((name) => !CATALOG_NAMES.has(name)).sort()
}

/** Whether a string can name a CSS custom property. */
export function isVariableName(name: string): boolean {
	return /^--[A-Za-z0-9_-]+$/.test(name)
}

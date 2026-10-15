import tailwindColors from 'tailwindcss/colors'
import type { LogoSlot, ThemeColorRole, ThemeMode } from './types'

/** The palettes whose swatches go last: grays, for a neutral more than an accent. */
const GRAYS = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone', 'mauve', 'olive', 'mist', 'taupe'])

/** What a variable holds, as the browser checks a value of it. */
export type ThemeValueKind = 'color' | 'border-radius' | 'font-family'

/**
 * Whether a variable takes a value per mode or one both modes share. The font
 * and the corners have no reason to differ between light and dark, so they
 * are set once.
 */
export type ThemeVariableScope = 'modes' | 'shared'

export interface ThemeVariableEntry {
	name: string
	label: string
	/** What it paints, in the words of the dashboard rather than the token's. */
	hint: string
	kind: ThemeValueKind
	scope: ThemeVariableScope
	/** Shown in the simple mode too; the rest is the developer's. */
	simple?: boolean
}

export interface ThemeVariableGroup {
	id: string
	label: string
	icon: string
	variables: ThemeVariableEntry[]
}

function color(
	name: string,
	label: string,
	hint: string,
	simple = false,
): ThemeVariableEntry {
	return { name, label, hint, kind: 'color', scope: 'modes', simple }
}

/**
 * The DMS tokens the editor names, grouped by what they paint
 * (`layers/dms-layout/app/assets/css/main.css` in the DMS). Each has a light
 * and a dark default there, but the shape and type ones, set once.
 */
export const THEME_VARIABLE_GROUPS: ThemeVariableGroup[] = [
	{
		id: 'surfaces',
		label: 'Backgrounds',
		icon: 'i-ph-squares-four-light',
		variables: [
			color('--ui-bg-muted', 'Page', 'The page behind the cards', true),
			color('--ui-bg', 'Cards and panels', 'Cards, menus, dialogs and the header', true),
			color('--dms-bg-sidebar', 'Sidebar', 'The navigation down the side', true),
			color('--dms-bg-field', 'Fields', 'Inputs, selects and text areas', true),
			color('--dms-surface-card', 'Card frame', 'The card itself, when it differs from the panels'),
			color('--ui-bg-elevated', 'Raised', 'Table headers, hovered rows, tiles'),
			color('--ui-bg-accented', 'Pressed', 'Selected rows and pressed controls'),
			color('--dms-bg-muted', 'Bands', 'The header, filter and footer bands of a card'),
		],
	},
	{
		id: 'text',
		label: 'Text',
		icon: 'i-ph-text-aa-light',
		variables: [
			color('--ui-text-highlighted', 'Titles', 'Headings and values that stand out'),
			color('--ui-text', 'Body', 'Most of the text'),
			color('--ui-text-toned', 'Toned', 'Labels and table cells'),
			color('--ui-text-muted', 'Secondary', 'Descriptions and hints'),
			color('--ui-text-dimmed', 'Dimmed', 'Placeholders and the least of the text'),
		],
	},
	{
		id: 'borders',
		label: 'Borders',
		icon: 'i-ph-bounding-box-light',
		variables: [
			color('--ui-border', 'Borders', 'Hairlines between surfaces'),
			color('--ui-border-muted', 'Light borders', 'Rows inside a table'),
			color('--ui-border-accented', 'Strong borders', 'Hovered fields and dividers that lead'),
			color('--dms-border-top', 'Strongest borders', 'Unchecked boxes and drop zones'),
		],
	},
	{
		id: 'accent',
		label: 'Accent, one by one',
		icon: 'i-ph-drop-half-light',
		variables: [
			color('--ui-primary', 'Accent ink', 'Links, icons and lines in the accent'),
			color('--dms-accent-fill', 'Accent fill', 'Solid buttons and badges'),
			color('--dms-accent-fill-hover', 'Accent fill, hovered', 'A solid button under the pointer'),
			color('--dms-accent-on-fill', 'On the accent fill', 'Text and icons on a solid button'),
		],
	},
	{
		id: 'shape',
		label: 'Shape and type',
		icon: 'i-ph-text-t-light',
		variables: [
			{
				name: '--ui-radius',
				label: 'Corners',
				hint: 'Buttons, inputs and menus; Nuxt UI scales it',
				kind: 'border-radius',
				scope: 'shared',
			},
			{
				name: '--dms-radius-card',
				label: 'Card corners',
				hint: 'The frame of each card',
				kind: 'border-radius',
				scope: 'shared',
			},
			{
				name: '--font-sans',
				label: 'Font',
				hint: 'Every text of the dashboard',
				kind: 'font-family',
				scope: 'shared',
			},
			{
				name: '--font-mono',
				label: 'Monospace font',
				hint: 'Codes, keys and small labels',
				kind: 'font-family',
				scope: 'shared',
			},
		],
	},
]

const ENTRIES = new Map(
	THEME_VARIABLE_GROUPS.flatMap((group) => group.variables).map((entry) => [entry.name, entry]),
)

export function catalogEntry(name: string): ThemeVariableEntry | undefined {
	return ENTRIES.get(name)
}

/** Every variable the catalog names. */
export function catalogNames(): string[] {
	return [...ENTRIES.keys()]
}

const VARIABLE_NAME = /^--[A-Za-z0-9_-]+$/

export function isVariableName(name: string): boolean {
	return VARIABLE_NAME.test(name)
}

/** The variables a theme sets that the catalog does not name, sorted and once each. */
export function otherVariables(names: Iterable<string>): string[] {
	return [...new Set(names)].filter((name) => !ENTRIES.has(name)).sort()
}

/**
 * A choice of corners, setting the controls' radius and the cards' together:
 * the simple mode's one setting for both. `null` hands both back to the DMS.
 */
export interface CornerPreset {
	id: string
	label: string
	values: { radius: string; card: string } | null
}

export const CORNER_PRESETS: CornerPreset[] = [
	{ id: 'square', label: 'Square', values: { radius: '0rem', card: '0rem' } },
	{ id: 'soft', label: 'Soft', values: { radius: '0.2rem', card: '0.5rem' } },
	{ id: 'default', label: 'Default', values: null },
	{ id: 'round', label: 'Round', values: { radius: '0.5rem', card: '1.25rem' } },
]

/** A font the simple mode offers: stacks every system has, so none is fetched. */
export interface FontPreset {
	id: string
	label: string
	stack: string | null
}

export const FONT_PRESETS: FontPreset[] = [
	{ id: 'default', label: 'Default', stack: null },
	{ id: 'system', label: 'System', stack: 'ui-sans-serif, system-ui, sans-serif' },
	{ id: 'serif', label: 'Serif', stack: 'ui-serif, Georgia, serif' },
	{ id: 'rounded', label: 'Rounded', stack: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' },
]

export const THEME_MODE_ENTRIES: { label: string; value: ThemeMode; icon: string }[] = [
	{ label: 'Light', value: 'light', icon: 'i-ph-sun-light' },
	{ label: 'Dark', value: 'dark', icon: 'i-ph-moon-light' },
]

/** What each color role paints, as the editor lists them. */
export const THEME_COLOR_ROLES: { role: ThemeColorRole; label: string; hint: string }[] = [
	{ role: 'primary', label: 'Accent', hint: 'Buttons, links, the active menu entry and focus rings' },
	{ role: 'success', label: 'Success', hint: 'Confirmations and positive figures' },
	{ role: 'warning', label: 'Warning', hint: 'Alerts that ask for attention' },
	{ role: 'error', label: 'Error', hint: 'Refusals, required fields and deletions' },
	{ role: 'info', label: 'Information', hint: 'Notes and neutral alerts' },
]

/**
 * The palettes a role can take: the DMS's own, then Tailwind's, chromatic ones
 * first — the grays make a poor accent but a fine neutral. A palette the
 * project declares itself can still be typed in the developer mode.
 */
export const THEME_PALETTES: string[] = [
	'dms',
	...Object.entries(tailwindColors)
		.filter(([, value]) => typeof value === 'object')
		.map(([name]) => name)
		.sort((left, right) => Number(GRAYS.has(left)) - Number(GRAYS.has(right))),
]

/**
 * The value Nuxt UI falls back on for a shade of a Tailwind palette, as its
 * colors plugin writes it: the page only declares the `--color-*` shades its
 * own classes use, so most palettes reach it through this fallback alone.
 */
export function paletteShade(palette: string, shade: number): string | undefined {
	const value = (tailwindColors as Record<string, unknown>)[palette]
	return typeof value === 'object' && value !== null
		? (value as Record<number, string>)[shade]
		: undefined
}

/** The shades of a palette, as Nuxt UI maps a role onto one. */
export const PALETTE_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

/** The logo slots the developer mode sets one by one. */
export const THEME_LOGO_SLOTS: { slot: LogoSlot; label: string; hint: string }[] = [
	{ slot: 'default', label: 'Logo', hint: 'The sidebar, the sign-in and error pages' },
	{ slot: 'collapsed', label: 'Collapsed logo', hint: 'The folded sidebar: a square icon' },
	{ slot: 'email', label: 'Email logo', hint: 'The header of every email: a PNG, as mail clients refuse SVG' },
	{ slot: 'favicon', label: 'Favicon', hint: "The browser tab: it follows the system's light or dark" },
]

/** The slots the simple mode's logo goes to, and those its square icon does. */
export const WIDE_LOGO_SLOTS: LogoSlot[] = ['default', 'email']
export const SQUARE_LOGO_SLOTS: LogoSlot[] = ['collapsed', 'favicon']

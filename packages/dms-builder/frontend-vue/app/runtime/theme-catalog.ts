import tailwindColors from 'tailwindcss/colors'
import type { LogoSlot, ThemeColorRole, ThemeMode } from './types'

/** Gray palettes, listed last: they make a poor accent. */
const GRAYS = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone', 'mauve', 'olive', 'mist', 'taupe'])

/** The CSS property a value is checked against with `CSS.supports`. */
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
	/** What it paints, in dashboard terms rather than token names. */
	hint: string
	kind: ThemeValueKind
	scope: ThemeVariableScope
	inSimpleMode?: boolean
}

export interface ThemeVariableGroup {
	id: string
	label: string
	icon: string
	variables: ThemeVariableEntry[]
}

function colorVariable(
	name: string,
	label: string,
	hint: string,
	inSimpleMode = false,
): ThemeVariableEntry {
	return { name, label, hint, kind: 'color', scope: 'modes', inSimpleMode }
}

/** The dashboard's font, which the editor offers a font of its catalog for. */
export const FONT_VARIABLE = '--font-sans'

/**
 * The DMS tokens the editor lists, grouped by what they paint
 * (`layers/dms-layout/app/assets/css/main.css` in the DMS). Each has a light
 * and a dark default there, except the shape and type ones, set once.
 */
export const THEME_VARIABLE_GROUPS: ThemeVariableGroup[] = [
	{
		id: 'surfaces',
		label: 'Backgrounds',
		icon: 'i-ph-squares-four-light',
		variables: [
			colorVariable('--ui-bg-muted', 'Page', 'The page behind the cards', true),
			colorVariable('--ui-bg', 'Cards and panels', 'Cards, menus, dialogs and the header', true),
			colorVariable('--dms-bg-sidebar', 'Sidebar', 'The navigation down the side', true),
			colorVariable('--dms-bg-field', 'Fields', 'Inputs, selects and text areas', true),
			colorVariable('--dms-surface-card', 'Card frame', 'The card itself, when it differs from the panels'),
			colorVariable('--ui-bg-elevated', 'Raised', 'Table headers, hovered rows, tiles'),
			colorVariable('--ui-bg-accented', 'Pressed', 'Selected rows and pressed controls'),
			colorVariable('--dms-bg-muted', 'Bands', 'The header, filter and footer bands of a card'),
		],
	},
	{
		id: 'text',
		label: 'Text',
		icon: 'i-ph-text-aa-light',
		variables: [
			colorVariable('--ui-text-highlighted', 'Titles', 'Headings and values that stand out'),
			colorVariable('--ui-text', 'Body', 'Most of the text'),
			colorVariable('--ui-text-toned', 'Toned', 'Labels and table cells'),
			colorVariable('--ui-text-muted', 'Secondary', 'Descriptions and hints'),
			colorVariable('--ui-text-dimmed', 'Dimmed', 'Placeholders and the least of the text'),
		],
	},
	{
		id: 'borders',
		label: 'Borders',
		icon: 'i-ph-bounding-box-light',
		variables: [
			colorVariable('--ui-border', 'Borders', 'Hairlines between surfaces'),
			colorVariable('--ui-border-muted', 'Light borders', 'Rows inside a table'),
			colorVariable('--ui-border-accented', 'Strong borders', 'Hovered fields and dividers that lead'),
			colorVariable('--dms-border-top', 'Strongest borders', 'Unchecked boxes and drop zones'),
		],
	},
	{
		id: 'accent',
		label: 'Accent, one by one',
		icon: 'i-ph-drop-half-light',
		variables: [
			colorVariable('--ui-primary', 'Accent ink', 'Links, icons and lines in the accent'),
			colorVariable('--dms-accent-fill', 'Accent fill', 'Solid buttons and badges'),
			colorVariable('--dms-accent-fill-hover', 'Accent fill, hovered', 'A solid button under the pointer'),
			colorVariable('--dms-accent-on-fill', 'On the accent fill', 'Text and icons on a solid button'),
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
				name: FONT_VARIABLE,
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

const VARIABLES_BY_NAME = new Map(
	THEME_VARIABLE_GROUPS.flatMap((group) => group.variables).map((entry) => [entry.name, entry]),
)

export function catalogEntry(name: string): ThemeVariableEntry | undefined {
	return VARIABLES_BY_NAME.get(name)
}

export function catalogNames(): string[] {
	return [...VARIABLES_BY_NAME.keys()]
}

const VARIABLE_NAME = /^--[A-Za-z0-9_-]+$/

export function isVariableName(name: string): boolean {
	return VARIABLE_NAME.test(name)
}

export function uncatalogedVariableNames(names: Iterable<string>): string[] {
	return [...new Set(names)].filter((name) => !VARIABLES_BY_NAME.has(name)).sort()
}

/** A color the DMS paints some of a group's variables with, named by what they paint. */
export interface DmsTone {
	value: string
	label: string
}

/**
 * The DMS's own colors for a group, one per color in each mode: what a row of
 * the group offers to pick from, so that the page can take the cards' color
 * without anyone reading a code.
 */
export function dmsTones(
	group: ThemeVariableGroup,
	dmsDefaultValues: Record<ThemeMode, Record<string, string>>,
): Record<ThemeMode, DmsTone[]> {
	const tonesIn = (mode: ThemeMode): DmsTone[] => {
		const labelsByValue = new Map<string, string[]>()
		for (const entry of group.variables) {
			const value = dmsDefaultValues[mode][entry.name]
			if (value) {
				labelsByValue.set(value, [...(labelsByValue.get(value) ?? []), entry.label])
			}
		}
		return [...labelsByValue].map(([value, labels]) => ({ value, label: labels.join(', ') }))
	}
	return { light: tonesIn('light'), dark: tonesIn('dark') }
}

/**
 * A simple-mode corner preset, setting the controls' and the cards' radius
 * together. `null` resets both to the DMS defaults.
 */
export interface CornerPreset {
	id: string
	label: string
	values: { radius: string; cardRadius: string } | null
}

export const CORNER_PRESETS: CornerPreset[] = [
	{ id: 'square', label: 'Square', values: { radius: '0rem', cardRadius: '0rem' } },
	{ id: 'soft', label: 'Soft', values: { radius: '0.2rem', cardRadius: '0.5rem' } },
	{ id: 'default', label: 'Default', values: null },
	{ id: 'round', label: 'Round', values: { radius: '0.5rem', cardRadius: '1.25rem' } },
]

export const THEME_MODE_OPTIONS: { label: string; value: ThemeMode; icon: string }[] = [
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
 * The palettes a role can take: the DMS's own, then Tailwind's, grays last. A
 * palette the project declares itself can still be typed in the developer mode.
 */
export const THEME_PALETTES: string[] = [
	'dms',
	...Object.entries(tailwindColors)
		.filter(([, value]) => typeof value === 'object')
		.map(([name]) => name)
		.sort((left, right) => Number(GRAYS.has(left)) - Number(GRAYS.has(right))),
]

/** A Tailwind palette's color at one shade; `undefined` for a palette Tailwind does not ship. */
export function paletteShade(palette: string, shade: number): string | undefined {
	const value = (tailwindColors as Record<string, unknown>)[palette]
	return typeof value === 'object' && value !== null
		? (value as Record<number, string>)[shade]
		: undefined
}

/** The shades Nuxt UI declares for each color role. */
export const PALETTE_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

/** The logo slots the developer mode sets one by one. */
export const THEME_LOGO_SLOTS: { slot: LogoSlot; label: string; hint: string; emptyLogoLabel?: string }[] = [
	{ slot: 'default', label: 'Logo', hint: 'The sidebar, the sign-in and error pages' },
	{ slot: 'collapsed', label: 'Collapsed logo', hint: 'The folded sidebar: a square icon' },
	{
		slot: 'email',
		label: 'Email logo',
		hint: 'The header of every email: a PNG or a JPEG, which mail clients show — any other file is drawn as a PNG',
		// The DMS has no email logo: when unset, emails show the main logo if it
		// is a PNG or a JPEG.
		emptyLogoLabel: 'main logo if PNG or JPEG',
	},
	{ slot: 'favicon', label: 'Favicon', hint: "The browser tab: it follows the system's light or dark" },
]

/** Slots the simple mode's logo always fills. */
export const WIDE_LOGO_SLOTS: LogoSlot[] = ['default', 'email']
/** Slots the simple mode's square icon fills, or its logo when there is no icon. */
export const SQUARE_LOGO_SLOTS: LogoSlot[] = ['collapsed', 'favicon']

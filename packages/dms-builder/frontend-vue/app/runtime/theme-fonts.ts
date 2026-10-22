import { THEME_FONTS_STYLE_ID } from './constants'

/**
 * The fonts a theme can take, as the module hosts them: the save downloads the
 * one picked into the project, and until then the page shows it from the CDN
 * the save downloads it from. Mirrors the module's
 * `src/implementations/dms-builder/engine/theme-font-catalog.ts`, which a test
 * keeps this equal to, with what the editor says of each.
 */
export interface ThemeFont {
	family: string
	/** Published as `@fontsource-variable/<packageName>`. */
	packageName: string
	version: string
	/** The range of the variable `wght` axis the files carry. */
	weights: [number, number]
	italic: boolean
	/** What it reads like, for someone choosing by eye. */
	character: string
	/** The generic family its stack ends on, shown while the file loads. */
	generic: 'sans-serif' | 'serif'
}

export const THEME_FONTS: ThemeFont[] = [
	{
		family: 'Inter',
		packageName: 'inter',
		version: '5.3.0',
		weights: [100, 900],
		italic: true,
		character: 'Neutral, drawn for screens',
		generic: 'sans-serif',
	},
	{
		family: 'IBM Plex Sans',
		packageName: 'ibm-plex-sans',
		version: '5.3.0',
		weights: [100, 700],
		italic: true,
		character: 'Technical, a little corporate',
		generic: 'sans-serif',
	},
	{
		family: 'Public Sans',
		packageName: 'public-sans',
		version: '5.3.0',
		weights: [100, 900],
		italic: true,
		character: 'Plain and sober',
		generic: 'sans-serif',
	},
	{
		family: 'DM Sans',
		packageName: 'dm-sans',
		version: '5.3.0',
		weights: [100, 1000],
		italic: true,
		character: 'Geometric and soft',
		generic: 'sans-serif',
	},
	{
		family: 'Manrope',
		packageName: 'manrope',
		version: '5.3.0',
		weights: [200, 800],
		italic: false,
		character: 'Modern and compact',
		generic: 'sans-serif',
	},
	{
		family: 'Plus Jakarta Sans',
		packageName: 'plus-jakarta-sans',
		version: '5.3.0',
		weights: [200, 800],
		italic: true,
		character: 'Modern, with open curves',
		generic: 'sans-serif',
	},
	{
		family: 'Figtree',
		packageName: 'figtree',
		version: '5.3.0',
		weights: [300, 900],
		italic: true,
		character: 'Friendly and clear',
		generic: 'sans-serif',
	},
	{
		family: 'Atkinson Hyperlegible Next',
		packageName: 'atkinson-hyperlegible-next',
		version: '5.3.0',
		weights: [200, 800],
		italic: true,
		character: 'Made to be told apart: no two letters alike',
		generic: 'sans-serif',
	},
	{
		family: 'Nunito',
		packageName: 'nunito',
		version: '5.3.0',
		weights: [200, 1000],
		italic: true,
		character: 'Rounded ends, warm',
		generic: 'sans-serif',
	},
	{
		family: 'Source Serif 4',
		packageName: 'source-serif-4',
		version: '5.3.1',
		weights: [200, 900],
		italic: true,
		character: 'A serif, for a classic tone',
		generic: 'serif',
	},
]

/** The characters each file covers: every language written in the Latin alphabet. */
export const FONT_SUBSETS = {
	'latin-ext':
		'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
	latin:
		'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
} as const

export const FONT_PACKAGES_URL = 'https://cdn.jsdelivr.net/npm/@fontsource-variable'

/** What the DMS shows without a theme font: Geist, which it hosts itself. */
export const DMS_FONT_FAMILY = 'Geist'

const GENERIC_STACKS: Record<ThemeFont['generic'], string> = {
	'sans-serif': 'ui-sans-serif, system-ui, sans-serif',
	serif: 'ui-serif, Georgia, serif',
}

/** The value `--font-sans` takes for a font: the font, then the system's while it loads. */
export function fontStack(font: Pick<ThemeFont, 'family' | 'generic'>): string {
	return `"${font.family}", ${GENERIC_STACKS[font.generic]}`
}

function unquoted(name: string): string {
	const quote = name[0]
	return (quote === '"' || quote === "'") && name.endsWith(quote) ? name.slice(1, -1) : name
}

/** The family a stack starts with, the one the text shows in. */
export function leadingFamily(stack: string): string {
	return unquoted(stack.split(',')[0]?.trim() ?? '')
}

/** The font of the catalog a stack starts with, as the module tells which font to host. */
export function themeFontOf(stack: string | undefined): ThemeFont | undefined {
	const leading = leadingFamily(stack ?? '').toLowerCase()
	return THEME_FONTS.find((font) => font.family.toLowerCase() === leading)
}

/**
 * Every catalog font declared from the CDN, so that the picker shows each in
 * its own letters and the page the one picked before the save. A browser
 * fetches a face only once some text uses it.
 */
export function catalogFontFaces(): string {
	return THEME_FONTS.flatMap((font) =>
		(font.italic ? ['normal', 'italic'] : ['normal']).flatMap((style) =>
			(Object.keys(FONT_SUBSETS) as (keyof typeof FONT_SUBSETS)[]).map(
				(subset) =>
					`@font-face { font-family: "${font.family}"; font-style: ${style}; font-weight: ${font.weights[0]} ${font.weights[1]}; font-display: swap; src: url("${FONT_PACKAGES_URL}/${font.packageName}@${font.version}/files/${font.packageName}-${subset}-wght-${style}.woff2") format("woff2"); unicode-range: ${FONT_SUBSETS[subset]}; }`,
			),
		),
	).join('\n')
}

/** False without a browser, or with a test stub lacking the DOM APIs used here. */
function hasDom(): boolean {
	return typeof document !== 'undefined' && typeof document.getElementById === 'function'
}

/** Declare the catalog fonts on the page, once: declaring them again would make the page fetch them again. */
export function declareCatalogFonts(): void {
	if (!hasDom() || document.getElementById(THEME_FONTS_STYLE_ID)) {
		return
	}
	const element = document.createElement('style')
	element.id = THEME_FONTS_STYLE_ID
	element.textContent = catalogFontFaces()
	document.head.appendChild(element)
}

export function forgetCatalogFonts(): void {
	if (hasDom()) {
		document.getElementById(THEME_FONTS_STYLE_ID)?.remove()
	}
}

import {
	CHROME_ATTRIBUTE,
	THEME_CHROME_STYLE_ID,
	THEME_PREVIEW_STYLE_ID,
} from './constants'
import { PALETTE_SHADES, paletteShade } from './theme-catalog'
import { DARK_CLASS, ModeMirror } from './theme-mirror'
import type {
	ThemeColorRole,
	ThemeColors,
	ThemeMode,
	ThemeVariableSets,
} from './types'

export const THEME_MODES: ThemeMode[] = ['light', 'dark']

/**
 * The selectors the preview declares each mode at, the ones the module writes
 * a mode's own values under. The shared values are folded into each mode
 * here, so the preview never has to win over a mode rule with a weaker one.
 */
const MODE_SELECTORS: Record<ThemeMode, string> = {
	light: ':root:not(.dark)',
	dark: '.dark',
}

/**
 * The value that hands a variable back to the DMS default. The DMS declares its
 * defaults in a cascade layer and the theme overrides them unlayered, so
 * rolling the cascade back one layer skips the saved override, whatever
 * stylesheet holds it.
 */
const DMS_DEFAULT = 'revert-layer'

/** The stylesheet of the project's theme, as the dev server names the module it serves. */
const THEME_STYLESHEET = /\/app\/assets\/css\/theme\.css(?:[?#].*)?$/

/** The tokens the builder's frame draws with, which it keeps on the DMS look. */
const CHROME_TOKEN = /^--(?:ui|dms|font|shadow|default)-/

/**
 * Whether there is a page to paint: there is none where the editor's logic
 * runs alone, and only a stand-in document where its components are mounted
 * without a browser.
 */
function onPage(): boolean {
	return (
		typeof document !== 'undefined' &&
		typeof document.getElementById === 'function' &&
		document.documentElement?.classList !== undefined
	)
}

/** One declaration of the preview: a custom property and the value it shows. */
export type PreviewDeclaration = [name: string, value: string]

/** The value a mode shows for a variable in a theme: its own, else the shared one. */
export function effectiveValue(
	variables: ThemeVariableSets,
	mode: ThemeMode,
	name: string,
): string | undefined {
	return variables[mode][name] ?? variables.shared[name]
}

/**
 * What the preview declares in one mode: the draft's values, and the DMS
 * default back for every saved override the draft dropped. A value the theme
 * could not be saved with is left out, so the page keeps showing the saved one.
 */
export function previewDeclarations(
	draft: ThemeVariableSets,
	saved: ThemeVariableSets,
	mode: ThemeMode,
	isValid: (name: string, value: string) => boolean,
): PreviewDeclaration[] {
	const names = new Set(
		[draft, saved].flatMap((variables) => [
			...Object.keys(variables.shared),
			...Object.keys(variables[mode]),
		]),
	)
	return [...names].flatMap((name): PreviewDeclaration[] => {
		const value = effectiveValue(draft, mode, name)
		if (value !== undefined) {
			return isValid(name, value) ? [[name, value]] : []
		}
		return effectiveValue(saved, mode, name) === undefined ? [] : [[name, DMS_DEFAULT]]
	})
}

/**
 * How a role takes a palette: each shade of the role is that palette's shade,
 * written the way Nuxt UI's colors plugin writes it — `neutral` named
 * `old-neutral`, and a Tailwind palette with its value to fall back on, as the
 * page declares none of its shades but those it uses.
 */
export function paletteDeclarations(role: ThemeColorRole, palette: string): PreviewDeclaration[] {
	const name = palette === 'neutral' ? 'old-neutral' : palette
	return PALETTE_SHADES.map((shade) => {
		const fallback = paletteShade(palette, shade)
		return [
			`--ui-color-${role}-${shade}`,
			fallback ? `var(--color-${name}-${shade}, ${fallback})` : `var(--color-${name}-${shade})`,
		]
	})
}

/**
 * The palettes the preview maps each role onto: the draft's, and the DMS's
 * own for a role the draft hands back. Without the DMS's defaults to name, a
 * dropped role keeps showing the saved palette until the save.
 */
export function previewPalettes(
	draft: ThemeColors,
	saved: ThemeColors,
	defaults: ThemeColors | undefined,
): PreviewDeclaration[] {
	const roles = new Set([...Object.keys(draft), ...Object.keys(saved)] as ThemeColorRole[])
	return [...roles].flatMap((role) => {
		const palette = draft[role] ?? defaults?.[role]
		return palette && palette !== saved[role] ? paletteDeclarations(role, palette) : []
	})
}

/** The draft as the preview shows it. */
export interface PreviewInput {
	draft: { variables: ThemeVariableSets; colors: ThemeColors }
	saved: { variables: ThemeVariableSets; colors: ThemeColors }
	defaults: ThemeColors | undefined
	isValid: (name: string, value: string) => boolean
}

function addRule(sheet: CSSStyleSheet, selector: string, declarations: PreviewDeclaration[]): void {
	if (declarations.length === 0) {
		return
	}
	const rule = sheet.cssRules[sheet.insertRule(`${selector} {}`, sheet.cssRules.length)]
	if (!(rule instanceof CSSStyleRule)) {
		return
	}
	for (const [name, value] of declarations) {
		rule.style.setProperty(name, value)
	}
}

/** A style element of the builder's own, made anew last in `<head>`. */
function freshStyle(id: string): HTMLStyleElement {
	document.getElementById(id)?.remove()
	const element = document.createElement('style')
	element.id = id
	document.head.appendChild(element)
	return element
}

/**
 * Show a draft on the live page, through a style element kept last in
 * `<head>`: unlayered, it wins over the saved theme without replacing it.
 * The values go in through the CSSOM rather than as text, so no value can
 * close its rule and open another.
 */
export function writePreview(input: PreviewInput): void {
	if (!onPage()) {
		return
	}
	const sheet = freshStyle(THEME_PREVIEW_STYLE_ID).sheet
	if (!sheet) {
		return
	}
	addRule(sheet, ':root', previewPalettes(input.draft.colors, input.saved.colors, input.defaults))
	for (const mode of THEME_MODES) {
		addRule(
			sheet,
			MODE_SELECTORS[mode],
			previewDeclarations(input.draft.variables, input.saved.variables, mode, input.isValid),
		)
	}
}

export function removePreview(): void {
	if (!onPage()) {
		return
	}
	document.getElementById(THEME_PREVIEW_STYLE_ID)?.remove()
}

/** The mode the page was in before the editor showed it in another, while it does. */
let shownOver: ThemeMode | null = null

function pageMode(): ThemeMode {
	return document.documentElement.classList.contains(DARK_CLASS) ? 'dark' : 'light'
}

/**
 * The mode the viewer chose, whatever the editor shows the page in: their
 * preference, which the editor never writes.
 */
export function chosenMode(): ThemeMode {
	return shownOver ?? pageMode()
}

/**
 * Show the page in one mode, for the preview alone: the root's class changes,
 * the viewer's preference does not, and `null` puts the page back in the mode
 * it was in.
 */
export function showPageIn(mode: ThemeMode | null): void {
	if (!onPage()) {
		return
	}
	if (mode === null) {
		if (shownOver !== null) {
			document.documentElement.classList.toggle(DARK_CLASS, shownOver === 'dark')
			shownOver = null
		}
		return
	}
	shownOver ??= pageMode()
	document.documentElement.classList.toggle(DARK_CLASS, mode === 'dark')
}

/** Whether a stylesheet is one the theme paints the page with: the saved one, the preview. */
function isThemeSheet(sheet: CSSStyleSheet): boolean {
	const owner = sheet.ownerNode as Element | null
	if (!owner) {
		return false
	}
	if (owner.id === THEME_PREVIEW_STYLE_ID || owner.id === THEME_CHROME_STYLE_ID) {
		return true
	}
	const source =
		owner.getAttribute('data-vite-dev-id') ??
		owner.getAttribute('data-dms-dev-style') ??
		(owner as HTMLLinkElement).href ??
		''
	return THEME_STYLESHEET.test(source)
}

/** The rules that put every role back on the DMS's palette. */
function defaultPalettes(defaults: ThemeColors | undefined): string {
	const declarations = Object.entries(defaults ?? {}).flatMap(([role, palette]) =>
		palette ? paletteDeclarations(role as ThemeColorRole, palette) : [],
	)
	return declarations.length
		? `:root { ${declarations.map(([name, value]) => `${name}: ${value};`).join(' ')} }`
		: ''
}

/**
 * Keep the builder's own frame on the DMS look, whatever the theme being
 * edited or saved does: an unreadable pair of colors in the draft must not
 * make the editor unreadable too. The DMS's tokens are read as they compute
 * without the theme's stylesheets and with the DMS's palettes, in the mode
 * the viewer chose, and declared on every element of the frame. The canvas,
 * where the page is drawn, is not part of the frame and shows the theme.
 */
export function isolateChrome(defaults: ThemeColors | undefined): void {
	if (!onPage()) {
		return
	}
	const mirror = new ModeMirror({
		skip: isThemeSheet,
		extra: () => defaultPalettes(defaults),
	})
	try {
		const names = mirror.declared((name) => CHROME_TOKEN.test(name))
		const values = mirror.read(names)[chosenMode()]
		const sheet = freshStyle(THEME_CHROME_STYLE_ID).sheet
		if (sheet) {
			addRule(
				sheet,
				`[${CHROME_ATTRIBUTE}]`,
				Object.entries(values).filter(([, value]) => value !== ''),
			)
		}
	} finally {
		mirror.dispose()
	}
}

export function releaseChrome(): void {
	if (!onPage()) {
		return
	}
	document.getElementById(THEME_CHROME_STYLE_ID)?.remove()
}

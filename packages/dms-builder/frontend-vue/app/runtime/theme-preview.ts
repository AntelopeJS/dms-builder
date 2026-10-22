import {
	CHROME_ATTRIBUTE,
	CHROME_CLASS,
	THEME_CHROME_STYLE_ID,
	THEME_FONTS_STYLE_ID,
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
 * The selectors the module writes each mode under in theme.css. Shared values
 * are folded into each mode's rule, so the preview never loses to a more
 * specific saved mode rule.
 */
const MODE_SELECTORS: Record<ThemeMode, string> = {
	light: ':root:not(.dark)',
	dark: '.dark',
}

/**
 * The DMS declares its defaults in a cascade layer and the saved theme
 * overrides them unlayered, so `revert-layer` skips the saved override,
 * whichever stylesheet holds it.
 */
const DMS_DEFAULT = 'revert-layer'

const THEME_STYLESHEET_PATH = /\/app\/assets\/css\/theme\.css(?:[?#].*)?$/

/** The DMS tokens the builder's chrome uses; `isolateChrome` pins them to their DMS values. */
const CHROME_TOKEN = /^--(?:ui|dms|font|shadow|default)-/

/**
 * Properties the chrome inherits as computed values, not tokens: Tailwind's
 * preflight sets the font on the root, Nuxt UI sets color and color-scheme on
 * the body, both computed with the theme. The chrome declares their DMS
 * values again.
 */
const INHERITED_PROPERTIES = ['font-family', 'color', 'color-scheme']

/**
 * Tailwind's base layer, where the chrome's inherited properties go: below the
 * utilities, so a utility class on a chrome element still wins.
 */
const BASE_LAYER = 'base'

/**
 * The builder's chrome: elements with the chrome attribute, and Nuxt UI
 * overlays given the chrome class because they are teleported out of it.
 */
const CHROME_SELECTOR = `[${CHROME_ATTRIBUTE}], .${CHROME_CLASS}`

/** The element the DMS frontend loader teleports Nuxt UI's overlays into. */
const OVERLAY_PORTAL_ID = 'dms-overlays'

/** The interactions an overlay opens from: a press or a key, never a focus the overlay moved itself. */
const OPENING_EVENTS = ['pointerdown', 'keydown'] as const

/** False without a browser: no `document`, or a test stub lacking the DOM APIs used here. */
function hasDom(): boolean {
	return (
		typeof document !== 'undefined' &&
		typeof document.getElementById === 'function' &&
		document.documentElement?.classList !== undefined
	)
}

export type PropertyDeclaration = [name: string, value: string]

export function effectiveValue(
	variables: ThemeVariableSets,
	mode: ThemeMode,
	name: string,
): string | undefined {
	return variables[mode][name] ?? variables.shared[name]
}

/**
 * Declarations for one mode: each value the draft changes, or `revert-layer`
 * where the draft removes a saved override. Unchanged values are not declared,
 * so the saved stylesheet, and any edit made to it outside the builder, shows
 * through. Invalid values are skipped, so the page keeps the saved one.
 */
export function previewDeclarations(
	draft: ThemeVariableSets,
	saved: ThemeVariableSets,
	mode: ThemeMode,
	isValid: (name: string, value: string) => boolean,
): PropertyDeclaration[] {
	const names = new Set(
		[draft, saved].flatMap((variables) => [
			...Object.keys(variables.shared),
			...Object.keys(variables[mode]),
		]),
	)
	return [...names].flatMap((name): PropertyDeclaration[] => {
		const draftValue = effectiveValue(draft, mode, name)
		const savedValue = effectiveValue(saved, mode, name)
		// Compared trimmed, as the save writes them.
		if (draftValue?.trim() === savedValue?.trim()) {
			return []
		}
		if (draftValue !== undefined) {
			return isValid(name, draftValue) ? [[name, draftValue]] : []
		}
		return [[name, DMS_DEFAULT]]
	})
}

/**
 * Declarations pointing every shade of a role at a palette, written as Nuxt
 * UI's colors plugin writes them: `neutral` is named `old-neutral`, and a
 * Tailwind palette carries its value as a fallback, since the page only
 * declares the shades its classes use.
 */
export function paletteDeclarations(role: ThemeColorRole, palette: string): PropertyDeclaration[] {
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
 * Declarations for each role whose palette differs from the saved one: the
 * draft's palette, or the DMS's for a role the draft removed. Without
 * `dmsColors`, a removed role keeps the saved palette until the save.
 */
export function previewPaletteDeclarations(
	draft: ThemeColors,
	saved: ThemeColors,
	dmsColors: ThemeColors | undefined,
): PropertyDeclaration[] {
	const roles = new Set([...Object.keys(draft), ...Object.keys(saved)] as ThemeColorRole[])
	return [...roles].flatMap((role) => {
		const palette = draft[role] ?? dmsColors?.[role]
		return palette && palette !== saved[role] ? paletteDeclarations(role, palette) : []
	})
}

export interface PreviewInput {
	draft: { variables: ThemeVariableSets; colors: ThemeColors }
	saved: { variables: ThemeVariableSets; colors: ThemeColors }
	dmsColors: ThemeColors | undefined
	isValid: (name: string, value: string) => boolean
}

function addRule(
	sheet: CSSStyleSheet | CSSGroupingRule,
	selector: string,
	declarations: PropertyDeclaration[],
): void {
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

function recreateStyleElement(id: string): HTMLStyleElement {
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
	if (!hasDom()) {
		return
	}
	const sheet = recreateStyleElement(THEME_PREVIEW_STYLE_ID).sheet
	if (!sheet) {
		return
	}
	addRule(
		sheet,
		':root',
		previewPaletteDeclarations(input.draft.colors, input.saved.colors, input.dmsColors),
	)
	for (const mode of THEME_MODES) {
		addRule(
			sheet,
			MODE_SELECTORS[mode],
			previewDeclarations(input.draft.variables, input.saved.variables, mode, input.isValid),
		)
	}
}

export function removePreview(): void {
	if (!hasDom()) {
		return
	}
	document.getElementById(THEME_PREVIEW_STYLE_ID)?.remove()
}

let modeBeforePreview: ThemeMode | null = null

function pageMode(): ThemeMode {
	return document.documentElement.classList.contains(DARK_CLASS) ? 'dark' : 'light'
}

export function viewerMode(): ThemeMode {
	return modeBeforePreview ?? pageMode()
}

/**
 * Show the page in one mode for the preview: only the root's class changes,
 * not the viewer's preference. `null` restores the viewer's mode.
 */
export function showPageIn(mode: ThemeMode | null): void {
	if (!hasDom()) {
		return
	}
	if (mode === null) {
		if (modeBeforePreview !== null) {
			document.documentElement.classList.toggle(DARK_CLASS, modeBeforePreview === 'dark')
			modeBeforePreview = null
		}
		return
	}
	modeBeforePreview ??= pageMode()
	document.documentElement.classList.toggle(DARK_CLASS, mode === 'dark')
}

/** The builder's own style elements, which hold no DMS default. */
const THEME_STYLE_IDS = new Set([THEME_PREVIEW_STYLE_ID, THEME_CHROME_STYLE_ID, THEME_FONTS_STYLE_ID])

/**
 * Whether an element holds a stylesheet the DMS defaults are read without:
 * the saved theme.css, the preview, the chrome's or the catalog fonts'.
 */
function isThemeElement(element: Element): boolean {
	if (THEME_STYLE_IDS.has(element.id)) {
		return true
	}
	const stylesheetPath =
		element.getAttribute('data-vite-dev-id') ??
		element.getAttribute('data-dms-dev-style') ??
		(element as HTMLLinkElement).href ??
		''
	return THEME_STYLESHEET_PATH.test(stylesheetPath)
}

function isThemeSheet(sheet: CSSStyleSheet): boolean {
	const owner = sheet.ownerNode as Element | null
	return !!owner && isThemeElement(owner)
}

/**
 * The node if it is an element, else its parent: a `<style>` whose text
 * changed reports its text node.
 */
function elementOf(node: Node | null): Element | null {
	if (!node) {
		return null
	}
	return 'tagName' in node ? (node as Element) : (node.parentNode as Element | null)
}

const STYLESHEET_REL = /\bstylesheet\b/i

/**
 * Whether a node is, or is the text of, a `<style>` or stylesheet `<link>`
 * other than the theme's: the stylesheets the DMS defaults are read from.
 */
function holdsDefaults(node: Node | null): boolean {
	const element = elementOf(node)
	if (!element || isThemeElement(element)) {
		return false
	}
	return (
		element.tagName === 'STYLE' ||
		(element.tagName === 'LINK' && STYLESHEET_REL.test(element.getAttribute('rel') ?? ''))
	)
}

export type HeadMutation = Pick<MutationRecord, 'target' | 'addedNodes' | 'removedNodes'>

/**
 * Only a `<style>` or stylesheet `<link>` added, removed or rewritten counts.
 * The theme's own (preview, saved theme, chrome) are ignored, since the
 * defaults are read without them.
 */
export function affectsDmsDefaults(records: HeadMutation[]): boolean {
	return records.some(
		(record) =>
			holdsDefaults(record.target) ||
			[...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(holdsDefaults),
	)
}

function dmsPaletteCss(dmsColors: ThemeColors | undefined): string {
	const declarations = Object.entries(dmsColors ?? {}).flatMap(([role, palette]) =>
		palette ? paletteDeclarations(role as ThemeColorRole, palette) : [],
	)
	return declarations.length
		? `:root { ${declarations.map(([name, value]) => `${name}: ${value};`).join(' ')} }`
		: ''
}

let dmsMirrorCache: { mirror: ModeMirror; paletteCss: string } | undefined

/**
 * The mirror the DMS defaults are read from: the page's stylesheets minus the
 * theme's (saved, preview, chrome), with every role on its DMS palette.
 * Reused between reads and re-parsed only when one of the copied stylesheets
 * changes; the draft is not one of them, so editing it costs no re-parse.
 */
function dmsMirror(dmsColors: ThemeColors | undefined): ModeMirror {
	const paletteCss = dmsPaletteCss(dmsColors)
	if (dmsMirrorCache?.paletteCss !== paletteCss) {
		dmsMirrorCache?.mirror.dispose()
		dmsMirrorCache = {
			mirror: new ModeMirror({ skip: isThemeSheet, overrideCss: () => paletteCss }),
			paletteCss,
		}
	}
	return dmsMirrorCache.mirror
}

/**
 * Each variable's DMS default in each mode, computed without the theme: what
 * an empty editor cell falls back to.
 */
export function dmsDefaults(
	names: string[],
	dmsColors: ThemeColors | undefined,
): Record<ThemeMode, Record<string, string>> {
	if (!hasDom()) {
		return { light: {}, dark: {} }
	}
	return dmsMirror(dmsColors).read(names)
}

/**
 * The chrome while the page shows `mode`. `:where` keeps the rule as weak as
 * the chrome selector alone, so a utility class on a chrome element still wins.
 */
export function chromeSelectorIn(mode: ThemeMode): string {
	return `:where(${MODE_SELECTORS[mode]}) :is(${CHROME_SELECTOR})`
}

/**
 * Pin the builder's chrome to the DMS tokens, so a draft with unreadable
 * colors cannot make the editor unreadable too. The tokens are computed
 * without the theme's stylesheets, and declared on every chrome element for
 * each mode: the chrome follows the mode the page shows, the preview's as
 * the viewer's, so it never sits dark around a light page, nor gets its
 * `dark:` classes switched off over dark tokens. The canvas is not chrome and
 * keeps showing the theme.
 */
export function isolateChrome(dmsColors: ThemeColors | undefined): void {
	if (!hasDom()) {
		return
	}
	const mirror = dmsMirror(dmsColors)
	const names = mirror.declaredCustomProperties((name) => CHROME_TOKEN.test(name))
	const nonEmptyDeclarations = (values: Record<string, string>): PropertyDeclaration[] =>
		Object.entries(values).filter(([, value]) => value !== '')
	const sheet = recreateStyleElement(THEME_CHROME_STYLE_ID).sheet
	if (sheet) {
		const tokens = mirror.read(names)
		for (const mode of THEME_MODES) {
			addRule(sheet, chromeSelectorIn(mode), nonEmptyDeclarations(tokens[mode]))
		}
		const layer = sheet.cssRules[sheet.insertRule(`@layer ${BASE_LAYER} {}`, sheet.cssRules.length)]
		for (const mode of THEME_MODES) {
			addRule(
				layer instanceof CSSGroupingRule ? layer : sheet,
				chromeSelectorIn(mode),
				nonEmptyDeclarations(mirror.inheritedValues(mode, INHERITED_PROPERTIES)),
			)
		}
	}
	adoptOverlays()
}

export function isInChrome(target: EventTarget | null): boolean {
	const element = target as Element | null
	return typeof element?.closest === 'function' && element.closest(CHROME_SELECTOR) !== null
}

let stopOverlayWatch: (() => void) | undefined

/**
 * Where an overlay is teleported to: the element the DMS frontend loader gives
 * Nuxt UI as its portal, and the body for any other teleport.
 */
function overlayHosts(): Element[] {
	const portal = document.getElementById(OVERLAY_PORTAL_ID)
	return portal ? [portal, document.body] : [document.body]
}

/**
 * Mark overlays opened from the chrome as chrome too. Selects, menus and
 * dialogs (the DMS's confirmation included, which takes no class from the
 * builder) are teleported to the overlay portal or the body. Each element
 * added there while the last press or key came from the chrome gets the
 * chrome attribute.
 */
function adoptOverlays(): void {
	if (stopOverlayWatch) {
		return
	}
	let lastEventInChrome = false
	const trackEventOrigin = (event: Event): void => {
		lastEventInChrome = isInChrome(event.target)
	}
	const observer = new MutationObserver((records) => {
		if (!lastEventInChrome) {
			return
		}
		for (const record of records) {
			for (const node of Array.from(record.addedNodes)) {
				if (node instanceof Element) {
					node.setAttribute(CHROME_ATTRIBUTE, '')
				}
			}
		}
	})
	for (const host of overlayHosts()) {
		observer.observe(host, { childList: true })
	}
	for (const type of OPENING_EVENTS) {
		document.addEventListener(type, trackEventOrigin, true)
	}
	stopOverlayWatch = () => {
		observer.disconnect()
		for (const type of OPENING_EVENTS) {
			document.removeEventListener(type, trackEventOrigin, true)
		}
	}
}

/** Remove the chrome's stylesheet, dispose of the DMS mirror and stop marking overlays. */
export function releaseChrome(): void {
	dmsMirrorCache?.mirror.dispose()
	dmsMirrorCache = undefined
	stopOverlayWatch?.()
	stopOverlayWatch = undefined
	if (!hasDom()) {
		return
	}
	document.getElementById(THEME_CHROME_STYLE_ID)?.remove()
}

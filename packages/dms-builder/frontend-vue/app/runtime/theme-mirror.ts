import type { ThemeMode, ThemeVariables } from './types'

/** The class on the root element that turns on the DMS's dark mode. */
export const DARK_CLASS = 'dark'

/**
 * Rendered (not `display: none`) so its styles compute, but takes no room and
 * cannot be seen or clicked.
 */
const HIDDEN_FRAME_STYLE =
	'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none'

/**
 * Constructed stylesheets reject `@import`, so the rule is dropped, and the
 * imported sheet's rules are not copied.
 */
const IMPORT_RULE = /^@import\b/i

export interface MirroredSheet {
	media: Pick<MediaList, 'mediaText'>
	cssRules: ArrayLike<Pick<CSSRule, 'cssText'>>
}

export interface MirrorOptions {
	/** Leave a stylesheet of the page out of the copy. */
	skip?: (sheet: CSSStyleSheet) => boolean
	overrideCss?: () => string
}

/** A stylesheet's text, reused while its rule count is unchanged. */
interface CachedSheet {
	ruleCount: number
	text: string
}

/** The stylesheet adopted by the iframe's document, and the text it holds. */
interface AdoptedSheet {
	document: Document
	sheet: CSSStyleSheet
	text: string
}

/** A stylesheet's rules as text, or '' for one the page cannot read. */
export function sheetText(sheet: MirroredSheet): string {
	let rules: string
	try {
		rules = Array.from(sheet.cssRules, (rule) => rule.cssText)
			.filter((text) => !IMPORT_RULE.test(text))
			.join('\n')
	} catch {
		// A stylesheet from another origin cannot be read, and none of the
		// DMS's tokens live in one.
		return ''
	}
	const media = sheet.media.mediaText
	return media ? `@media ${media} {\n${rules}\n}` : rules
}

/** How many rules a stylesheet holds, or -1 for one the page cannot read. */
function ruleCount(sheet: CSSStyleSheet): number {
	try {
		return sheet.cssRules.length
	} catch {
		return -1
	}
}

/** Copy the page root's attributes onto `target`, then set its dark class for `mode`. */
function matchRoot(target: HTMLElement, mode: ThemeMode): void {
	const source = document.documentElement
	for (const name of target.getAttributeNames()) {
		target.removeAttribute(name)
	}
	for (const attribute of Array.from(source.attributes)) {
		target.setAttribute(attribute.name, attribute.value)
	}
	target.classList.toggle(DARK_CLASS, mode === 'dark')
}

/**
 * A copy of the page's stylesheets in a hidden iframe, whose root can switch
 * between light and dark without touching the page.
 *
 * It needs a root of its own: the DMS declares light on `:root` and dark on
 * `.dark`, so a `.dark` element inside a light page still inherits the root's
 * light values for what dark leaves unset, and a page in dark mode has no
 * element in light mode. The copy is a constructed stylesheet because no
 * content security policy blocks one.
 */
export class ModeMirror {
	private readonly frame: HTMLIFrameElement
	private readonly texts = new WeakMap<CSSStyleSheet, CachedSheet>()
	private adopted: AdoptedSheet | undefined

	public constructor(private readonly options: MirrorOptions = {}) {
		this.frame = document.createElement('iframe')
		this.frame.setAttribute('aria-hidden', 'true')
		this.frame.tabIndex = -1
		this.frame.style.cssText = HIDDEN_FRAME_STYLE
		document.body.appendChild(this.frame)
	}

	/** What each variable computes to on the root, in each mode. */
	public read(names: string[]): Record<ThemeMode, ThemeVariables> {
		const target = this.syncDocument()
		if (!target) {
			return { light: {}, dark: {} }
		}
		return {
			light: this.readMode(target, 'light', names),
			dark: this.readMode(target, 'dark', names),
		}
	}

	/**
	 * Computed values of `properties` on the body in one mode: what page
	 * elements inherit when nothing closer sets them.
	 */
	public inheritedValues(mode: ThemeMode, properties: string[]): Record<string, string> {
		const target = this.syncDocument()
		const body = target?.body
		if (!target || !body) {
			return {}
		}
		matchRoot(target.documentElement, mode)
		const style = target.defaultView?.getComputedStyle(body)
		return Object.fromEntries(
			properties.map((property) => [property, style?.getPropertyValue(property).trim() ?? '']),
		)
	}

	public declaredCustomProperties(keep: (name: string) => boolean): string[] {
		const target = this.syncDocument()
		const sheet = this.adopted?.sheet
		if (!target || !sheet) {
			return []
		}
		const names = new Set<string>()
		collectNames(sheet.cssRules, names)
		return [...names].filter(keep)
	}

	public dispose(): void {
		this.frame.remove()
	}

	private syncDocument(): Document | undefined {
		const target = this.frame.contentDocument
		// `adoptedStyleSheets` only accepts a sheet built by the iframe's own
		// `CSSStyleSheet` constructor.
		const view = this.frame.contentWindow as (Window & typeof globalThis) | null
		if (!target || !view) {
			return undefined
		}
		if (this.adopted?.document !== target) {
			const sheet = new view.CSSStyleSheet()
			target.adoptedStyleSheets = [sheet]
			this.adopted = { document: target, sheet, text: '' }
		}
		const copied = Array.from(document.styleSheets)
			.filter((sheet) => !sheet.disabled && !this.options.skip?.(sheet))
			.map((sheet) => this.textOf(sheet))
		const text = [...copied, this.options.overrideCss?.() ?? ''].join('\n')
		if (text !== this.adopted.text) {
			this.adopted.sheet.replaceSync(text)
			this.adopted.text = text
		}
		return target
	}

	private textOf(sheet: CSSStyleSheet): string {
		const cached = this.texts.get(sheet)
		const count = ruleCount(sheet)
		if (cached?.ruleCount === count) {
			return cached.text
		}
		const text = sheetText(sheet)
		this.texts.set(sheet, { ruleCount: count, text })
		return text
	}

	private readMode(target: Document, mode: ThemeMode, names: string[]): ThemeVariables {
		matchRoot(target.documentElement, mode)
		const style = target.defaultView?.getComputedStyle(target.documentElement)
		return Object.fromEntries(
			names.map((name) => [name, style?.getPropertyValue(name).trim() ?? '']),
		)
	}
}

/** Add the custom properties `rules` declare to `names`, nested rules included. */
function collectNames(rules: CSSRuleList, names: Set<string>): void {
	for (const rule of Array.from(rules)) {
		if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
			collectNames((rule as CSSGroupingRule).cssRules, names)
		}
		const style = (rule as CSSStyleRule).style
		if (!style) {
			continue
		}
		for (const property of Array.from(style)) {
			if (property.startsWith('--')) {
				names.add(property)
			}
		}
	}
}

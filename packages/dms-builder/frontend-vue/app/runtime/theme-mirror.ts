import type { ThemeMode, ThemeVariables } from './types'

/** The class the DMS keys dark mode on, on the root element. */
export const DARK_CLASS = 'dark'

/** Rendered, so its styles compute, but taking no room and never seen or reached. */
const HIDDEN_FRAME_STYLE =
	'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none'

/** An `@import` rule, which a constructed stylesheet refuses and the page already resolved. */
const IMPORT_RULE = /^@import\b/i

/** The slice of a stylesheet the mirror reads: its rules and the media it is for. */
export interface MirroredSheet {
	media: Pick<MediaList, 'mediaText'>
	cssRules: ArrayLike<Pick<CSSRule, 'cssText'>>
}

/** A stylesheet's text, kept until its rule count says it changed. */
interface CachedSheet {
	length: number
	text: string
}

/** The one stylesheet the mirror's document holds, and the text it was given. */
interface AdoptedSheet {
	document: Document
	sheet: CSSStyleSheet
	text: string
}

/** A stylesheet's rules as text, or nothing for one the page may not read. */
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

/** How many rules a stylesheet holds, or -1 for one the page may not read. */
function ruleCount(sheet: CSSStyleSheet): number {
	try {
		return sheet.cssRules.length
	} catch {
		return -1
	}
}

/** Put a root in the page root's state, then in one mode. */
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
 * A copy of the page's stylesheets in a document of its own, whose root can be
 * put in either mode without touching the page.
 *
 * Only a root shows what a mode holds: the DMS declares light on `:root` and
 * dark on `.dark`, and a variable a mode leaves alone is inherited from the
 * root. An element of the page carrying `.dark` inherits the root's light value
 * for those, and nothing on a page in dark mode shows the light ones. The copy
 * is a constructed stylesheet, which no content security policy stands in the
 * way of.
 */
export class ModeMirror {
	private readonly frame: HTMLIFrameElement
	private readonly texts = new WeakMap<CSSStyleSheet, CachedSheet>()
	private adopted: AdoptedSheet | undefined

	public constructor() {
		this.frame = document.createElement('iframe')
		this.frame.setAttribute('aria-hidden', 'true')
		this.frame.tabIndex = -1
		this.frame.style.cssText = HIDDEN_FRAME_STYLE
		document.body.appendChild(this.frame)
	}

	/** What each variable computes to on the root, in each mode. */
	public read(names: string[]): Record<ThemeMode, ThemeVariables> {
		const target = this.synced()
		if (!target) {
			return { light: {}, dark: {} }
		}
		return {
			light: this.readMode(target, 'light', names),
			dark: this.readMode(target, 'dark', names),
		}
	}

	public dispose(): void {
		this.frame.remove()
	}

	/** The frame's document, holding the page's rules as they stand now. */
	private synced(): Document | undefined {
		const target = this.frame.contentDocument
		// A frame's window carries its own constructors, as `window` does.
		const view = this.frame.contentWindow as (Window & typeof globalThis) | null
		if (!target || !view) {
			return undefined
		}
		if (this.adopted?.document !== target) {
			const sheet = new view.CSSStyleSheet()
			target.adoptedStyleSheets = [sheet]
			this.adopted = { document: target, sheet, text: '' }
		}
		const text = Array.from(document.styleSheets)
			.filter((sheet) => !sheet.disabled)
			.map((sheet) => this.textOf(sheet))
			.join('\n')
		if (text !== this.adopted.text) {
			this.adopted.sheet.replaceSync(text)
			this.adopted.text = text
		}
		return target
	}

	private textOf(sheet: CSSStyleSheet): string {
		const cached = this.texts.get(sheet)
		const length = ruleCount(sheet)
		if (cached?.length === length) {
			return cached.text
		}
		const text = sheetText(sheet)
		this.texts.set(sheet, { length, text })
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

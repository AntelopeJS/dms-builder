import { THEME_SAVE_MARKER_KEY, THEME_SAVE_MARKER_MS } from './constants'
import type { FileChange } from './types'

/**
 * The layer's entry, which nothing accepts a hot update of: the module loader
 * imports it, and the page reloads when it changes.
 */
const ENTRY = /(?:^|[\\/])dms\.frontend\.ts$/

/** A theme save, remembered by the tab it started in. */
export interface ThemeSaveMarker {
	/** The page the builder was open on. */
	route: string
	/** What the builder says once the save is through. */
	message: string
	at: number
}

/** The tab's session storage, unless the browser refuses to open it. */
function tabStorage(): Storage | undefined {
	try {
		return globalThis.sessionStorage
	} catch {
		// Storage switched off for the site: nothing is remembered.
		return undefined
	}
}

/**
 * Remember that a theme save starts from a page. A save that rewrites the
 * layer's entry — the first one, which imports the stylesheet there — makes
 * the dev server reload the page, often before the builder hears back from
 * the save: the page that loads next reads this to open the theme again and
 * say the save went through.
 */
export function rememberThemeSave(route: string, message: string, now = Date.now()): void {
	const marker: ThemeSaveMarker = { route, message, at: now }
	try {
		tabStorage()?.setItem(THEME_SAVE_MARKER_KEY, JSON.stringify(marker))
	} catch {
		// A full or refused storage only costs the reopening.
	}
}

export function forgetThemeSave(): void {
	try {
		tabStorage()?.removeItem(THEME_SAVE_MARKER_KEY)
	} catch {
		// Nothing was remembered where nothing can be written.
	}
}

function isMarker(value: unknown): value is ThemeSaveMarker {
	const marker = value as Partial<ThemeSaveMarker> | null
	return (
		typeof marker?.route === 'string' &&
		typeof marker.message === 'string' &&
		typeof marker.at === 'number'
	)
}

/** The save this page load follows, if it follows one closely; read once. */
export function takeThemeSave(now = Date.now()): ThemeSaveMarker | undefined {
	let raw: string | null | undefined
	try {
		raw = tabStorage()?.getItem(THEME_SAVE_MARKER_KEY)
	} catch {
		return undefined
	}
	forgetThemeSave()
	try {
		const marker: unknown = raw ? JSON.parse(raw) : undefined
		return isMarker(marker) && now - marker.at <= THEME_SAVE_MARKER_MS ? marker : undefined
	} catch {
		return undefined
	}
}

/**
 * Whether what a theme save wrote makes the dev server reload the page. The
 * stylesheet is swapped in place, the loader applies an app config and serves
 * a new logo without a reload; the entry is the one module it cannot.
 */
export function reloadsPage(changes: FileChange[]): boolean {
	return changes.some((change) => ENTRY.test(change.path))
}

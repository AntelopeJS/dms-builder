import { THEME_SAVE_MARKER_KEY, THEME_SAVE_MARKER_MAX_AGE_MS } from './constants'
import type { FileChange } from './types'

const ENTRY_FILE = /(?:^|[\\/])dms\.frontend\.ts$/

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
 * layer's entry — the first one, which imports the stylesheet there — or
 * removes a logo it replaced makes the dev server reload the page, often
 * before the builder hears back from the save: the page that loads next reads
 * this to open the theme again and say the save went through.
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
		// Storage unavailable: nothing to remove.
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

/** Reads and clears the marker; returns it only if at most THEME_SAVE_MARKER_MAX_AGE_MS old. */
export function takeThemeSaveMarker(now = Date.now()): ThemeSaveMarker | undefined {
	let raw: string | null | undefined
	try {
		raw = tabStorage()?.getItem(THEME_SAVE_MARKER_KEY)
	} catch {
		return undefined
	}
	forgetThemeSave()
	try {
		const marker: unknown = raw ? JSON.parse(raw) : undefined
		return isMarker(marker) && now - marker.at <= THEME_SAVE_MARKER_MAX_AGE_MS ? marker : undefined
	} catch {
		return undefined
	}
}

/** A file the layer serves as it is, from its `public/` directory. */
const PUBLIC_FILE = /(?:^|[\\/])public[\\/]/

/**
 * Whether what a theme save wrote makes the dev server reload the page. The
 * stylesheet is swapped in place, the loader applies an app config and serves
 * a new logo without a reload; it cannot for the entry, which nothing accepts
 * a hot update of, nor for a logo the save replaced and removed: Vite reloads
 * a page that loaded a file once that file is gone.
 */
export function reloadsPage(changes: FileChange[]): boolean {
	return changes.some(
		(change) => ENTRY_FILE.test(change.path) || (change.kind === 'delete' && PUBLIC_FILE.test(change.path)),
	)
}

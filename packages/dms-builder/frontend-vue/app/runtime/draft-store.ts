/**
 * The draft kept in the viewer's browser, page by page, so that a reload, a
 * closed tab or a navigation does not throw unsaved work away. It is the
 * viewer's own copy and nobody else's: it is never sent anywhere until they
 * save, and it is forgotten once saved, discarded, or a week old.
 */
import type { PageDraft } from './types'

const PREFIX = 'dms-builder:draft:'
/** How long a draft nobody came back to is kept. */
export const KEEP_DRAFT_MS = 7 * 24 * 60 * 60 * 1000

export interface StoredDraft {
	draft: PageDraft
	/** The version of the page the draft was made on. */
	version: string | null
	/** When the draft started to differ from the page. */
	at: number
}

function storage(): Storage | undefined {
	try {
		return globalThis.localStorage ?? undefined
	} catch {
		return undefined
	}
}

export function storeDraft(pageRef: string, value: StoredDraft): void {
	try {
		storage()?.setItem(`${PREFIX}${pageRef}`, JSON.stringify(value))
	} catch {
		// A browser refusing storage, or full: the draft still lives in the
		// editor, it only does not outlive it.
	}
}

export function forgetDraft(pageRef: string): void {
	try {
		storage()?.removeItem(`${PREFIX}${pageRef}`)
	} catch {
		// Nothing kept, nothing to forget.
	}
}

/** The draft kept for a page, unless there is none or it is too old to trust. */
export function storedDraft(pageRef: string, now = Date.now()): StoredDraft | undefined {
	let raw: string | null | undefined
	try {
		raw = storage()?.getItem(`${PREFIX}${pageRef}`)
	} catch {
		return undefined
	}
	if (!raw) {
		return undefined
	}
	try {
		const value = JSON.parse(raw) as StoredDraft
		if (!Array.isArray(value?.draft?.blocks) || now - value.at > KEEP_DRAFT_MS) {
			forgetDraft(pageRef)
			return undefined
		}
		return value
	} catch {
		forgetDraft(pageRef)
		return undefined
	}
}

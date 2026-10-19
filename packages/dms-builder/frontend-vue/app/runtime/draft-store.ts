/**
 * The draft kept in the viewer's browser, page by page, so that a reload, a
 * closed tab or a navigation does not throw unsaved work away. It is the
 * viewer's own copy and nobody else's: it is never sent anywhere until they
 * save, and it is forgotten once saved, discarded, or a week old.
 *
 * The theme draft is stored the same way, once for the whole project. Its
 * pending logo files go to IndexedDB instead: a few of them would fill the few
 * megabytes `localStorage` has per site, page drafts included, and each is
 * written once rather than with every change of the draft that names it.
 */
import type { PageDraft, ThemeDraft } from './types'

const PREFIX = 'dms-builder:draft:'
const THEME_DRAFT_KEY = 'dms-builder:theme-draft'
const LOGO_DATABASE_NAME = 'dms-builder'
const LOGO_STORE_NAME = 'theme-logos'
/** How long a draft nobody came back to is kept. */
export const KEEP_DRAFT_MS = 7 * 24 * 60 * 60 * 1000

export interface StoredDraft {
	draft: PageDraft
	/** The version of the page the draft was made on. */
	version: string | null
	/** When the draft started to differ from the page. */
	at: number
}

/** A pending logo of a stored theme draft; its bytes are stored separately under `fileName`. */
export interface StoredLogo {
	fileName: string
	contentType: string
}

/** A theme draft stored on this device, with the baseline it was made on so it can be rebased at the next visit. */
export interface StoredThemeDraft {
	draft: ThemeDraft
	/** The theme as saved when the draft was made. */
	baseline: ThemeDraft
	/** The version of the theme the draft was made on. */
	version: string | null
	/** By `slot:mode`; their files are stored separately. */
	pendingLogos: Record<string, StoredLogo>
	/** When it was stored. */
	at: number
}

function storage(): Storage | undefined {
	try {
		return globalThis.localStorage ?? undefined
	} catch {
		return undefined
	}
}

/** Store a value as JSON under a key; returns whether it was stored. */
function write(key: string, value: unknown): boolean {
	try {
		const store = storage()
		store?.setItem(key, JSON.stringify(value))
		return store !== undefined
	} catch {
		// Storage refused or full: the value still lives in the editor, it just
		// does not outlive it.
		return false
	}
}

function remove(key: string): void {
	try {
		storage()?.removeItem(key)
	} catch {
		// Nothing kept, nothing to forget.
	}
}

/**
 * The value stored under a key, unless there is none, `isValid` rejects it, or
 * it is too old to trust. A value that is stored but rejected is removed.
 */
function read<T extends { at: number }>(key: string, isValid: (value: T) => boolean, now: number): T | undefined {
	let raw: string | null | undefined
	try {
		raw = storage()?.getItem(key)
	} catch {
		return undefined
	}
	if (!raw) {
		return undefined
	}
	try {
		const value = JSON.parse(raw) as T
		if (isValid(value) && now - value.at <= KEEP_DRAFT_MS) {
			return value
		}
	} catch {
		// Not JSON: nothing to trust either.
	}
	remove(key)
	return undefined
}

/** Returns whether the draft was stored. */
export function storeDraft(pageRef: string, value: StoredDraft): boolean {
	return write(`${PREFIX}${pageRef}`, value)
}

export function forgetDraft(pageRef: string): void {
	remove(`${PREFIX}${pageRef}`)
}

/** The draft kept for a page, unless there is none or it is too old to trust. */
export function storedDraft(pageRef: string, now = Date.now()): StoredDraft | undefined {
	return read<StoredDraft>(`${PREFIX}${pageRef}`, (value) => Array.isArray(value?.draft?.blocks), now)
}

/**
 * A name derived from a logo's base64 content: its length and a 53-bit hash
 * (cyrb53), so a file picked for several slots is stored once. Synchronous,
 * unlike Web Crypto digests, which a page served over plain HTTP from a host
 * other than localhost does not have.
 */
export function logoFileName(base64Content: string): string {
	let first = 0xdeadbeef ^ base64Content.length
	let second = 0x41c6ce57 ^ base64Content.length
	for (let index = 0; index < base64Content.length; index++) {
		const code = base64Content.charCodeAt(index)
		first = Math.imul(first ^ code, 2654435761)
		second = Math.imul(second ^ code, 1597334677)
	}
	first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909)
	second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909)
	const hash = 4294967296 * (2097151 & second) + (first >>> 0)
	return `${base64Content.length.toString(36)}-${hash.toString(36)}`
}

/** By file name: this tab writes each logo file once. A file read back counts as written. */
const logoFileWrites = new Map<string, Promise<boolean>>()

let logoDatabase: Promise<IDBDatabase | undefined> | undefined

/** undefined where IndexedDB is unavailable, as in some private windows. */
function openLogoDatabase(): Promise<IDBDatabase | undefined> {
	logoDatabase ??= new Promise((resolve) => {
		try {
			const request = globalThis.indexedDB.open(LOGO_DATABASE_NAME, 1)
			request.onupgradeneeded = () => request.result.createObjectStore(LOGO_STORE_NAME)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => resolve(undefined)
		} catch {
			resolve(undefined)
		}
	})
	return logoDatabase
}

/** Resolves to the request's result once its transaction completes, or to undefined if it fails. */
async function runLogoRequest<T>(
	transactionMode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<{ result: T } | undefined> {
	const database = await openLogoDatabase()
	if (!database) {
		return undefined
	}
	return new Promise((resolve) => {
		try {
			const transaction = database.transaction(LOGO_STORE_NAME, transactionMode)
			const request = run(transaction.objectStore(LOGO_STORE_NAME))
			transaction.oncomplete = () => resolve({ result: request.result })
			transaction.onerror = () => resolve(undefined)
			transaction.onabort = () => resolve(undefined)
		} catch {
			resolve(undefined)
		}
	})
}

/**
 * Store a logo file's base64 content under its name; resolves to whether it
 * was stored. A file already stored is not written again; a failed one is
 * retried on the next call.
 */
export function storeLogoFile(name: string, base64Content: string): Promise<boolean> {
	const existingWrite = logoFileWrites.get(name)
	if (existingWrite) {
		return existingWrite
	}
	const fileWrite = runLogoRequest('readwrite', (store) => store.put(base64Content, name)).then((response) => {
		if (!response) {
			logoFileWrites.delete(name)
		}
		return response !== undefined
	})
	logoFileWrites.set(name, fileWrite)
	return fileWrite
}

/** Delete the logo files this tab knows of that `names` leaves out. */
export function forgetLogoFilesExcept(names: Set<string>): void {
	for (const name of logoFileWrites.keys()) {
		if (!names.has(name)) {
			logoFileWrites.delete(name)
			void runLogoRequest('readwrite', (store) => store.delete(name))
		}
	}
}

/** The base64 content of the stored logo files of these names, by name; a missing file is left out. */
export async function storedLogoFiles(names: string[]): Promise<Record<string, string>> {
	const entries = await Promise.all(
		names.map(async (name) => [name, (await runLogoRequest('readonly', (store) => store.get(name)))?.result] as const),
	)
	const files: Record<string, string> = {}
	for (const [name, base64Content] of entries) {
		if (typeof base64Content === 'string') {
			files[name] = base64Content
			logoFileWrites.set(name, Promise.resolve(true))
		}
	}
	return files
}

/** Returns whether the draft was stored. Its logo files are stored by `storeLogoFile`. */
export function storeThemeDraft(value: StoredThemeDraft): boolean {
	return write(THEME_DRAFT_KEY, value)
}

/** Also deletes every stored logo file. */
export function forgetThemeDraft(): void {
	remove(THEME_DRAFT_KEY)
	logoFileWrites.clear()
	void runLogoRequest('readwrite', (store) => store.clear())
}

/** The theme draft stored on this device, unless there is none, it is malformed, or it is too old to trust. */
export function storedThemeDraft(now = Date.now()): StoredThemeDraft | undefined {
	return read<StoredThemeDraft>(
		THEME_DRAFT_KEY,
		(value) =>
			typeof value?.draft?.variables === 'object' &&
			typeof value.baseline?.variables === 'object' &&
			typeof value.pendingLogos === 'object' &&
			value.pendingLogos !== null,
		now,
	)
}

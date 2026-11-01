import { forgetDraft, storedDraft, type StoredDraft } from './draft-store'
import { cloneDraft } from './draft'
import type { OpResult } from './types'
import { emptySession, sessionState, type SessionCore } from './session-model'
import type { createDerived } from './session-derived'
import type { createHistory } from './session-history'
import type { createLoaders } from './session-loaders'
import type { createNavigation } from './session-navigation'
import type { createBlocks } from './session-blocks'

export function createLifecycle(scope: SessionCore & ReturnType<typeof createDerived> & ReturnType<typeof createHistory> & ReturnType<typeof createLoaders> & ReturnType<typeof createNavigation> & ReturnType<typeof createBlocks>) {
	const { session, api, dirty, gaps, noteDirty, newStep, keepDraft, notify, mutate, cancel, loadAccess, refreshPreview, schedulePreview, loadServedLayout, loadStructure, loadTableUsage, loadSiteTree, select, applyLayout } = scope
	const consumeRefusal = useReadOnlyRefusal()

	async function open(pageRef: string): Promise<void> {
		const start =
			session.value.startLayout?.ref === pageRef
				? session.value.startLayout.layout
				: undefined
		const kept = storedDraft(pageRef)
		session.value = { ...emptySession(), active: true, loading: true, pageRef }
		try {
			const [catalog, resources] = await Promise.all([
				api.catalog(),
				api.resources(),
			])
			session.value.catalog = catalog
			session.value.resources = resources
			// Not waited for: the page opens without its menu, which only the
			// pages panel lists. A failure is still said, inside the call.
			void loadSiteTree()
			void loadTableUsage()
			if (await loadStructure(pageRef)) {
				if (start && !session.value.draft?.blocks.length) {
					applyLayout(start)
				}
				restoreKept(kept)
				void loadAccess()
				await Promise.all([refreshPreview(), loadServedLayout(pageRef)])
			}
		} catch (error) {
			if (consumeRefusal(error)) return
			session.value.error = {
				code: 'unsupported',
				detail: error instanceof Error ? error.message : String(error),
			}
		} finally {
			session.value.loading = false
		}
	}

	function close(): void {
		clearTimeout(sessionState.previewTimer)
		session.value = emptySession()
	}

	/**
	 * Leave the editor, asking first when that would drop unsaved work.
	 *
	 * `close` is the teardown itself and stays unconditional; every way out an
	 * author has goes through here, so none of them can lose a draft without
	 * saying so.
	 */
	function leave(): void {
		if (dirty.value) {
			session.value.pendingClose = true
			return
		}
		close()
	}

	/**
	 * Answer that question: `keep` saves the draft first; else it is dropped, or
	 * — `onDevice` — left kept on this device for the next visit.
	 */
	async function resolveClose(keep: boolean, onDevice = false): Promise<void> {
		if (!keep && !onDevice && session.value.pageRef) {
			forgetDraft(session.value.pageRef)
		}
		if (keep) {
			await save()
			// A save the module — or the panel — turned down leaves the editor
			// open on the very thing it refused.
			if (session.value.error || session.value.lastSave?.outcome === 'failed') {
				session.value.pendingClose = false
				return
			}
		}
		close()
	}

	function stayOpen(): void {
		session.value.pendingClose = false
	}

	/** Start again from the page as it is on disk, dropping the draft. */
	async function reload(): Promise<void> {
		if (!session.value.pageRef) {
			return
		}
		session.value.loading = true
		try {
			if (await loadStructure(session.value.pageRef)) {
				await refreshPreview()
			}
		} finally {
			// Or a failed read leaves the editor on its spinner for good.
			session.value.loading = false
		}
	}

	/**
	 * Read the page again after a write that went straight to its file — a
	 * move to another category — keeping whatever the draft holds.
	 *
	 * Such a write leaves the blocks alone, so an unsaved draft still stands on
	 * the page as it now is: only what was read off it, and the version the next
	 * save is checked against, have to catch up. Starting again from the page
	 * here is what used to drop every unsaved edit, with no undo to get it back.
	 */
	async function refresh(): Promise<void> {
		const pageRef = session.value.pageRef
		if (!pageRef) {
			return
		}
		const result = await api.structure(pageRef)
		if (!result.ok) {
			if (!result.noticeConsumed) session.value.error = result.error
			return
		}
		session.value.structure = result.data
		session.value.version = result.data.version
		schedulePreview()
	}

	/**
	 * The builder is a mode on the page being looked at, so it follows the
	 * router. An unsaved draft is not dropped on the way out: the move waits
	 * until it is saved or discarded.
	 */
	function followRoute(path: string): void {
		if (!session.value.active || session.value.pageRef === path) {
			return
		}
		if (dirty.value) {
			session.value.pendingRoute = path
			return
		}
		void open(path)
	}

	/**
	 * Answer the pending move with "stay": nothing is saved or dropped, and the
	 * router is taken back to the page being edited — it had already moved
	 * on behind the editor. Answers that page, for the caller to navigate to.
	 */
	function stayOnPage(): string | null {
		session.value.pendingRoute = null
		return session.value.pageRef
	}

	/** Answer the pending move: `keep` saves the draft first, else it is dropped. */
	async function resolvePending(keep: boolean): Promise<void> {
		const target = session.value.pendingRoute
		if (!target) {
			return
		}
		if (keep) {
			await save()
			if (session.value.error || session.value.lastSave?.outcome === 'failed') {
				return
			}
		} else if (session.value.pageRef) {
			forgetDraft(session.value.pageRef)
		}
		session.value.pendingRoute = null
		await open(target)
	}

	/** Lay a kept draft on the page, as one edit Undo takes back. */
	function layKept(kept: StoredDraft): void {
		mutate((draft) => {
			draft.blocks = cloneDraft(kept.draft.blocks)
			if (kept.draft.page) {
				draft.page = cloneDraft(kept.draft.page)
			}
			if (kept.draft.queries) {
				draft.queries = cloneDraft(kept.draft.queries)
			}
		})
		session.value.dirtySince = kept.at
		keepDraft()
	}

	/**
	 * Put back the draft kept from an earlier visit. Made on the page as it still
	 * is, it is laid on it and said so; made on a version that has moved since,
	 * laying it would quietly undo what changed — so it is only offered.
	 */
	function restoreKept(kept: StoredDraft | undefined): void {
		const pageRef = session.value.pageRef
		if (!kept || !pageRef) {
			return
		}
		if (JSON.stringify(kept.draft) === JSON.stringify(session.value.baseline)) {
			forgetDraft(pageRef)
			return
		}
		if (kept.version === session.value.version) {
			layKept(kept)
			session.value.restored = { at: kept.at, stale: false }
			return
		}
		session.value.restored = { at: kept.at, stale: true, kept }
	}

	async function keepMine(): Promise<void> {
		const pageRef = session.value.pageRef
		if (!pageRef) {
			return
		}
		const result = await api.structure(pageRef)
		if (!result.ok) {
			if (!result.noticeConsumed) session.value.error = result.error
			return
		}
		session.value.structure = result.data
		session.value.version = result.data.version
		session.value.conflict = false
		session.value.error = null
		keepDraft()
		schedulePreview()
	}

	/** Lay a kept draft made on an older version of the page, all the same. */
	function restoreAnyway(): void {
		const kept = session.value.restored?.kept
		if (kept) {
			layKept(kept)
			session.value.restored = { at: kept.at, stale: false }
		}
	}

	/** Throw away the draft kept from an earlier visit. */
	function dropRestored(): void {
		const restored = session.value.restored
		session.value.restored = null
		if (!restored) {
			return
		}
		if (restored.stale) {
			if (session.value.pageRef) {
				forgetDraft(session.value.pageRef)
			}
			return
		}
		cancel()
	}

	async function save(): Promise<void> {
		const { pageRef, draft, version } = session.value
		if (!pageRef || !draft) {
			return
		}
		const gap = gaps.value[0]
		if (gap) {
			// The block is selected so the panel opens on the very field this
			// names, marked. `unsupported` is the code the session already carries
			// its own refusals under; nothing of this one comes from the module.
			select(gap.path)
			session.value.error = {
				code: 'unsupported',
				detail: `${gap.settings[0]?.label ?? 'A setting'} is still empty. Fill in the settings marked in the panel, then save.`,
			}
			return
		}
		session.value.saving = true
		session.value.error = null
		try {
			const result = await api.save({
				page: pageRef,
				draft,
				expectedVersion: version ?? undefined,
			})
			if (!result.ok) {
				if (!result.noticeConsumed) session.value.error = result.error
				session.value.conflict = result.error.code === 'stale'
				session.value.lastSave = { outcome: 'failed', at: Date.now(), noticeConsumed: result.noticeConsumed }
				return
			}
			session.value.version = result.data.version
			session.value.changes = result.changes
			session.value.baseline = cloneDraft(draft)
			session.value.history = []
			session.value.future = []
			newStep()
			session.value.lastSave = { outcome: 'saved', at: Date.now() }
			noteDirty()
			keepDraft()
			// What reads each table may have changed with the page, and the
			// actions the DMS registered for the blocks it now holds.
			void loadTableUsage()
			void loadAccess()
			report(result, 'Page saved')
		} finally {
			session.value.saving = false
		}
	}

	/**
	 * Say how a write went: its error, or its message and whatever the module
	 * warned about on the way. Every write-through operation answers here, so a
	 * warning any of them returns reaches the author instead of the wire alone.
	 *
	 * Warnings pile up until dismissed: the next write succeeding says nothing
	 * about the column the previous one had to store as a string.
	 */
	function report(
		result: OpResult<unknown>,
		message: string,
		applied?: { title: string; scope?: string },
	): boolean {
		if (!result.ok) {
			if (!result.noticeConsumed) session.value.error = result.error
			return false
		}
		if (applied) {
			session.value.applied = [
				...session.value.applied,
				{ id: session.value.applied.length + 1, at: Date.now(), ...applied },
			]
		}
		const known = new Set(session.value.warnings.map((entry) => entry.message))
		const fresh = (result.warnings ?? []).filter(
			(entry) => !known.has(entry.message),
		)
		if (fresh.length) {
			session.value.warnings = [...session.value.warnings, ...fresh]
		}
		notify(message)
		return true
	}
	return {
		open,
		close,
		leave,
		resolveClose,
		stayOpen,
		reload,
		refresh,
		followRoute,
		stayOnPage,
		resolvePending,
		layKept,
		restoreKept,
		keepMine,
		restoreAnyway,
		dropRestored,
		save,
		report,
	}
}

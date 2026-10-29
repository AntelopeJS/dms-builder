import { TOAST_MS, UNDO_GROUP_MS } from './constants'
import { revertChange, type DraftChange } from './changes'
import { formTableOf } from './form-table'
import { deriveKeys } from './keys'
import { t } from './i18n'
import { fitSpacerColumns, tidyLayout } from './layout'
import { tidyWrappers } from './wrappers'
import { ensurePeriodSelector, setPageLive } from './page-controls'
import { useBuilderMode } from './mode'
import { mergePatch } from './object'
import { cloneDraft, findNode, nameSlots, respectsSourceLocks } from './draft'
import type { AddQueryInput, PageDraft, QueryPreview } from './types'
import { sessionState, type SessionCore } from './session-model'
import type { createLoaders } from './session-loaders'
import type { createDerived } from './session-derived'

export function createHistory(scope: SessionCore & ReturnType<typeof createLoaders> & ReturnType<typeof createDerived>) {
	const { session, api, loadAccess, schedulePreview, noteDirty, newStep, pushHistory, followedBlocks, refollow, keepDraft, draftQueries, servedQueries, reselect } = scope

	/**
	 * Say what just happened, where the author is looking. `undo` offers to take
	 * it back from the toast itself, for a change that is one edit of the draft.
	 */
	function notify(message: string, options: { undo?: boolean } = {}): void {
		session.value.toast = message
		session.value.toastUndo = options.undo === true
		clearTimeout(sessionState.toastTimer)
		sessionState.toastTimer = setTimeout(
			() => {
				session.value.toast = null
				session.value.toastUndo = false
			},
			// An offer to undo stays long enough to be taken up.
			options.undo ? TOAST_MS * 2 : TOAST_MS,
		)
	}

	/** Put one change of the list back, as one edit the author can undo. */
	function revert(change: DraftChange): void {
		mutate((draft) => revertChange(draft, change.revert, servedQueries()))
		reselect()
	}

	/**
	 * Apply an edit to the draft, and answer whether it changed anything.
	 *
	 * The draft refuses some edits of its own — a block moved into its own
	 * subtree, a path that is no longer there — and history is pushed only once
	 * one has landed: an entry for an edit that did not happen lights up Undo
	 * with nothing to undo.
	 */
	function mutate(apply: (draft: PageDraft) => void): boolean {
		const current = session.value.draft
		if (!current) {
			return false
		}
		const next = cloneDraft(current)
		apply(next)
		// Every edit goes through here, so this is the one place where a region
		// the author added by hand can be given the id its children attach to
		// before the draft is anything the engine is asked to build.
		nameSlots(next, session.value.catalog)
		if (JSON.stringify(next) === JSON.stringify(current)) {
			return false
		}
		// The keys the simple mode hides are the builder's to write, from the
		// labels they follow.
		if (!useBuilderMode().advanced.value) {
			deriveKeys(next, current, session.value.catalog, {
				saved: session.value.baseline,
				locked: (block) =>
					formTableOf(block.config, session.value.resources) !== undefined,
			})
		}
		// And the one place the layout the editor wrote is taken back to what
		// the page still needs. That can move a block up a level, so whatever
		// the editor holds by path follows the block rather than the path.
		const followed = followedBlocks(next)
		tidyLayout(next, session.value.catalog, current)
		// And the wrappers it writes around a block: a section's rows, a
		// container's guard, which the blocks arriving in them go into.
		tidyWrappers(next, session.value.catalog, current)
		// And the period the cards bound to the page's period follow.
		const periodPlaced = ensurePeriodSelector(next, session.value.catalog, current)
		fitSpacerColumns(next)
		if (!respectsSourceLocks(current, next)) {
			notify(t('toasts.locked'))
			return false
		}
		// Edits of one thing in quick succession are one step to undo: picking
		// a table, a measure and a grouping is building one data source.
		const now = Date.now()
		if (
			sessionState.editGroup !== null &&
			sessionState.lastStep.group === sessionState.editGroup &&
			now - sessionState.lastStep.at < UNDO_GROUP_MS
		) {
			session.value.future = []
		} else {
			pushHistory()
		}
		sessionState.lastStep = { group: sessionState.editGroup, at: now }
		session.value.draft = next
		session.value.lastSave = null
		noteDirty()
		keepDraft()
		refollow(next, followed)
		schedulePreview()
		if (periodPlaced) {
			notify(t('toasts.period_added'))
		}
		return true
	}

	function patchConfig(path: string, patch: Record<string, unknown>): void {
		mutate((draft) => {
			const block = findNode(draft, path)
			if (!block) {
				return
			}
			block.config = mergePatch(block.config ?? {}, patch)
		})
	}

	function setDraftQuery(input: AddQueryInput): void {
		mutate((draft) => {
			const queries = draftQueries(draft).filter(
				(query) => query.name !== input.name,
			)
			draft.queries = [...queries, input]
		})
	}

	function removeDraftQuery(name: string): void {
		mutate((draft) => {
			draft.queries = draftQueries(draft).filter((query) => query.name !== name)
		})
	}

	async function previewQuery(
		input: AddQueryInput,
		args?: Record<string, unknown>,
	): Promise<QueryPreview | null> {
		const result = await api.previewQuery(input, args)
		return result.ok ? result.data : null
	}

	function patchMeta(path: string, patch: Record<string, unknown>): void {
		mutate((draft) => {
			const block = findNode(draft, path)
			if (!block) {
				return
			}
			const meta = mergePatch(block.meta ?? {}, patch)
			block.meta = Object.keys(meta).length > 0 ? meta : undefined
		})
	}

	/** The resource a controller-leading block reads from — a factory argument,
	 * not part of the `.child()` metadata. */
	function setController(path: string, resource: string | undefined): void {
		mutate((draft) => {
			const block = findNode(draft, path)
			if (block) {
				block.controller = resource
			}
		})
	}

	/** The named region of its parent a child renders into. */
	function setSlot(path: string, slot: string | undefined): void {
		mutate((draft) => {
			const block = findNode(draft, path)
			if (block) {
				block.slot = slot
			}
		})
	}

	/**
	 * Make the page live, its Live / Pause switch placed at its top, or not,
	 * every switch taken off: one edit, saved with the page.
	 */
	function setLive(live: Record<string, unknown> | null): void {
		mutate((draft) => setPageLive(draft, session.value.catalog, live))
	}

	function patchPage(patch: Record<string, unknown>): void {
		mutate((draft) => {
			draft.page = { ...(draft.page ?? {}), ...patch }
		})
		// Who holds the permission the page is given now is read with it.
		if ('permission' in patch) {
			void loadAccess()
		}
	}

	function setDraft(draft: PageDraft): void {
		mutate((current) => {
			current.blocks = cloneDraft(draft.blocks)
			if (draft.page) {
				current.page = cloneDraft(draft.page)
			}
		})
	}

	function undo(): void {
		const previous = session.value.history.at(-1)
		if (!previous || !session.value.draft) {
			return
		}
		session.value.future = [cloneDraft(session.value.draft), ...session.value.future]
		session.value.history = session.value.history.slice(0, -1)
		session.value.draft = previous
		newStep()
		noteDirty()
		keepDraft()
		reselect()
		schedulePreview()
	}

	function redo(): void {
		const next = session.value.future[0]
		if (!next || !session.value.draft) {
			return
		}
		session.value.history = [...session.value.history, cloneDraft(session.value.draft)]
		session.value.future = session.value.future.slice(1)
		session.value.draft = next
		newStep()
		noteDirty()
		keepDraft()
		reselect()
		schedulePreview()
	}

	function cancel(): void {
		if (!session.value.baseline) {
			return
		}
		pushHistory()
		session.value.draft = cloneDraft(session.value.baseline)
		session.value.selection = null
		session.value.error = null
		noteDirty()
		keepDraft()
		schedulePreview()
		notify(t('toasts.changes_discarded'), { undo: true })
	}
	return {
		notify,
		revert,
		mutate,
		patchConfig,
		setDraftQuery,
		removeDraftQuery,
		previewQuery,
		patchMeta,
		setController,
		setSlot,
		setLive,
		patchPage,
		setDraft,
		undo,
		redo,
		cancel,
	}
}

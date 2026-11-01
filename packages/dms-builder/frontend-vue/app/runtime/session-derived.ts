import { computed } from 'vue'
import {
	descriptorOf,
	missingSettings,
	regionAfter,
	shownRegion,
	type MissingSetting,
} from './catalog'
import { GUARD_BLOCK, HISTORY_LIMIT, WRAPPER_BLOCKS } from './constants'
import {
	accessWarnings as warnAccess,
	draftPermission,
	veilsFor,
	type BlockVeil,
} from './access'
import { draftChanges } from './changes'
import { forgetDraft, storeDraft } from './draft-store'
import { FORM_BLOCK, formTableOf, unaskedRequired } from './form-table'
import { displayText } from './i18n'
import { pathOfNode } from './layout'
import { ownerOf } from './wrappers'
import {
	linesHeight,
	SPACER_BLOCK,
	spacerAxis,
	spacerGrow,
} from './spacer-panel'
import {
	cloneDraft,
	countBlocks,
	findNode,
	parentPath,
	pathForPointer,
	uniqueName,
	walkDraft,
} from './draft'
import type {
	AddQueryInput,
	BlockDraft,
	PageDraft,
	DynamicSlots,
	TableReader,
} from './types'
import { sessionState, type BlockGap, type SessionCore } from './session-model'

export interface FollowedBlocks {
	selection?: BlockDraft
	regions: Array<[BlockDraft, string]>
}

export function createDerived(scope: SessionCore) {
	const { session } = scope
	const consumeRefusal = useReadOnlyRefusal()

	const dirty = computed(
		() =>
			!!session.value.draft &&
			JSON.stringify(session.value.draft) !== JSON.stringify(session.value.baseline),
	)
	const blockCount = computed(() =>
		session.value.draft
			? countBlocks(session.value.draft, session.value.catalog)
			: 0,
	)
	/**
	 * Every required setting the draft still leaves empty, block by block.
	 *
	 * Read off the schema rather than waited for from the engine: the engine
	 * answers a page that does not build with a compiler error about generated
	 * source, which is no help to whoever left a field empty. Knowing the gaps
	 * here is what lets the panel mark the field and Save say which one.
	 */
	const gaps = computed<BlockGap[]>(() => {
		const draft = session.value.draft
		if (!draft) {
			return []
		}
		const found: BlockGap[] = []
		walkDraft(draft.blocks, (block, path) => {
			const descriptor = descriptorOf(session.value.catalog, block.type)
			const settings = [...missingSettings(descriptor, block), ...unaskedOf(block)]
			if (settings.length === 0) {
				return
			}
			// A guard's settings are its container's, under the line naming them.
			if (block.type === GUARD_BLOCK) {
				found.push({
					path: ownerOf(draft, path) ?? path,
					settings: settings.map((setting) => ({
						...setting,
						label: `When there's nothing to show · ${setting.label}`,
					})),
				})
				return
			}
			found.push({ path, settings })
		})
		return found
	})

	/**
	 * A form saving into a table that does not ask for a column the table
	 * requires: every submit would be refused, so it is a gap like an empty
	 * required setting. Known once the table has been read.
	 */
	function unaskedOf(block: BlockDraft): MissingSetting[] {
		if (block.type !== FORM_BLOCK) {
			return []
		}
		const table = formTableOf(block.config, session.value.resources)
		const structure = table ? session.value.resourceStructures[table.ref] : undefined
		return unaskedRequired(block.config, structure).map((column) => ({
			path: ['fields'],
			label: `${column.label ?? column.name}, which the table requires`,
		}))
	}
	/**
	 * The blocks standing between the draft and a page that saves: the ones with
	 * a required option still empty, plus the ones the last preview refused.
	 *
	 * The structural half is the module's answer rather than a second
	 * implementation of its rules here — an issue whose block is gone no longer
	 * resolves, and drops out on its own.
	 */
	const problems = computed(() => {
		const draft = session.value.draft
		if (!draft) {
			return []
		}
		const paths = new Set<string>(gaps.value.map((gap) => gap.path))
		for (const issue of session.value.previewIssues) {
			const path = pathForPointer(draft, issue.pointer)
			if (path) {
				paths.add(path)
			}
		}
		return [...paths]
	})
	const selected = computed(() =>
		session.value.draft && session.value.selection
			? findNode(session.value.draft, session.value.selection)
			: undefined,
	)
	const selectedDescriptor = computed(() =>
		descriptorOf(session.value.catalog, selected.value?.type),
	)
	/**
	 * Adding from the palette lands in the container the user is working in.
	 *
	 * The selection is often a block inside one — they clicked the text they were
	 * editing, then the palette — so the walk climbs to the nearest container
	 * rather than sending the block to the bottom of the page.
	 */
	const paletteTarget = computed(() => {
		const draft = session.value.draft
		let path = session.value.selection
		while (draft && path) {
			const type = findNode(draft, path)?.type
			// A row or a guard the editor wrote is not where anything is added:
			// the section or the container holding it is, and wraps what comes.
			if (descriptorOf(session.value.catalog, type)?.container && !WRAPPER_BLOCKS.has(type ?? '')) {
				return path
			}
			path = parentPath(path)
		}
		return null
	})

	/**
	 * Every unsaved change of the draft, in the terms of the page: what the
	 * bar counts, and the list it opens.
	 */
	const unsaved = computed(() =>
		draftChanges(
			session.value.baseline,
			session.value.draft,
			session.value.catalog,
			(session.value.structure?.page ?? {}) as Record<string, unknown>,
			servedQueries(),
		),
	)

	const pagePermission = computed(() => {
		const access = session.value.access
		return access ? draftPermission(access, session.value.draft?.page) : null
	})

	const accessWarnings = computed(() =>
		warnAccess(
			session.value.access,
			session.value.baseline,
			session.value.draft,
			session.value.catalog,
		),
	)

	const viewedAs = computed(() => {
		const id = session.value.viewAs
		return id ? session.value.access?.roles?.find((role) => role.id === id) : undefined
	})

	const veils = computed<Record<string, BlockVeil>>(() => {
		const access = session.value.access
		const role = viewedAs.value
		const draft = session.value.draft
		return access && role && draft && pagePermission.value
			? veilsFor(access, role, draft, pagePermission.value)
			: {}
	})

	function setViewAs(role: string | null): void {
		session.value.viewAs = role
	}

	function readersOf(table: string): TableReader[] | undefined {
		const usage = session.value.tableUsage
		return usage ? (usage.readers[table] ?? []) : undefined
	}

	/** Keep track of when the draft started to differ from the page. */
	function noteDirty(): void {
		if (!dirty.value) {
			session.value.dirtySince = null
			return
		}
		session.value.dirtySince ??= Date.now()
	}

	/** Start the next edit on a step of its own, whatever it is about. */
	function newStep(): void {
		sessionState.lastStep = { group: null, at: 0 }
	}

	/**
	 * Make the edits `run` makes count, with those made about `key` just before,
	 * as one step of undo.
	 */
	function grouped(key: string, run: () => void): void {
		const previous = sessionState.editGroup
		sessionState.editGroup = key
		try {
			run()
		} finally {
			sessionState.editGroup = previous
		}
	}

	function pushHistory(): void {
		if (!session.value.draft) {
			return
		}
		session.value.history = [
			...session.value.history.slice(-HISTORY_LIMIT + 1),
			cloneDraft(session.value.draft),
		]
		session.value.future = []
	}

	/** The blocks the editor holds by path: the one selected, the tabs left open. */
	function followedBlocks(draft: PageDraft): FollowedBlocks {
		const selection = session.value.selection
		const regions: Array<[BlockDraft, string]> = []
		for (const [path, region] of Object.entries(session.value.openRegions)) {
			const block = findNode(draft, path)
			if (block) {
				regions.push([block, region])
			}
		}
		return {
			selection: selection ? findNode(draft, selection) : undefined,
			regions,
		}
	}

	function refollow(draft: PageDraft, followed: FollowedBlocks): void {
		if (followed.selection) {
			session.value.selection =
				pathOfNode(draft, followed.selection) ?? session.value.selection
		}
		const regions: Record<string, string> = {}
		for (const [block, region] of followed.regions) {
			const path = pathOfNode(draft, block)
			if (path) {
				regions[path] = region
			}
		}
		session.value.openRegions = regions
	}

	/**
	 * Declare one slot on a container that offers none yet.
	 *
	 * Appended rather than written over: what is already in that option is the
	 * user's, even when it is half filled in and names no slot of its own.
	 */
	function openSlot(
		container: BlockDraft,
		dynamic: DynamicSlots,
	): { id: string } {
		const option = (container.config ?? {})[dynamic.optionPath]
		const existing = Array.isArray(option) ? option : []
		const entry = regionAfter(container.type ?? 'slot', dynamic, existing)
		container.config = {
			...(container.config ?? {}),
			[dynamic.optionPath]: [...existing, entry],
		}
		return { id: entry[dynamic.idKey] as string }
	}

	/** Where a block was placed is the container's to hold, once it holds the block. */
	function handOverPlacement(enclosed: BlockDraft, container: BlockDraft): void {
		if (enclosed.slot !== undefined) {
			container.slot = enclosed.slot
			delete enclosed.slot
		}
		if (enclosed.meta) {
			container.meta = enclosed.meta
			delete enclosed.meta
		}
	}

	/** The columns a cell claimed are the column container's to claim now. */
	function handOverSpan(enclosed: BlockDraft, column: BlockDraft): void {
		const { colSpan, ...rest } = enclosed.meta ?? {}
		if (colSpan === undefined) {
			return
		}
		column.meta = { colSpan }
		if (Object.keys(rest).length > 0) {
			enclosed.meta = rest
			return
		}
		delete enclosed.meta
	}

	/**
	 * Keep the draft on this device while it holds changes, and forget it once
	 * it holds none: saved, discarded, or undone back to the page.
	 */
	function keepDraft(): void {
		const { pageRef, draft, version } = session.value
		if (!pageRef || !draft) {
			return
		}
		if (dirty.value) {
			storeDraft(pageRef, { draft, version, at: session.value.dirtySince ?? Date.now() })
		} else {
			forgetDraft(pageRef)
		}
	}

	/**
	 * A spacer put between stacked blocks is a line high from the start.
	 *
	 * Stacked, the room it takes is lines — a page or a tab leaves none free —
	 * and one placed with nothing said would be no room at all on the page.
	 */
	function linesForSpacer(
		draft: PageDraft,
		parent: string | null,
		placed: BlockDraft,
	): void {
		const holder = parent === null ? null : findNode(draft, parent)?.type
		if (placed.type !== SPACER_BLOCK || spacerAxis(holder) !== 'lines') {
			return
		}
		placed.config = {
			...placed.config,
			minSize: linesHeight(spacerGrow(placed.config ?? {})),
		}
	}

	/**
	 * A name no block on the page holds yet, not only none beside it.
	 *
	 * A block's own data is written under its name, and rows put blocks in lists
	 * of their own all over the page: two charts both called `chartCard2`, one in
	 * each of two rows, would write one query over the other.
	 */
	function nameOnPage(draft: PageDraft, base: string): string {
		const everywhere: BlockDraft[] = []
		walkDraft(draft.blocks, (block) => {
			everywhere.push(block)
		})
		return uniqueName(everywhere, base)
	}

	/** Where a block just placed ended up, once the layout around it is tidied. */
	function placedAt(node: BlockDraft): string | undefined {
		const draft = session.value.draft
		return draft ? pathOfNode(draft, node) : undefined
	}

	/**
	 * Which one of its type a block about to be placed is, counting the page and
	 * not its siblings: “Form 2” answers a reader looking at the whole page, and
	 * two forms in different columns are still two forms to them.
	 */
	function rankOf(draft: PageDraft, type: string): number {
		let seen = 0
		walkDraft(draft.blocks, (block) => {
			if (block.type === type) {
				seen += 1
			}
		})
		return seen + 1
	}

	/**
	 * The queries the page already serves, as draft entries.
	 *
	 * Seeded from what was read off the page the first time the editor touches
	 * one: sending a draft that carries only the query being edited would tell the
	 * engine the page serves nothing else. Each keeps how its route arranges its
	 * answer, or the save rewrites a card's route to answer bare points, which the
	 * card cannot read.
	 */
	function draftQueries(draft: PageDraft): AddQueryInput[] {
		return draft.queries ?? servedQueries()
	}

	/** The queries the page serves as it was last read, as draft entries. */
	function servedQueries(): AddQueryInput[] {
		return (session.value.structure?.queries ?? [])
			.filter((query) => !query.opaque && query.resource && query.template)
			.map((query) => ({
				name: query.name,
				resource: query.resource as string,
				template: query.template as string,
				params: query.params ?? {},
				...(query.response ? { response: query.response } : {}),
				// Carried over, or the next save writes the route without it.
				...(query.compare ? { compare: true } : {}),
				endpoint: query.endpoint,
			}))
	}

	/**
	 * Drop a selection the draft no longer holds.
	 *
	 * Stepping through history moves blocks in and out of existence under a
	 * selection that was made before the step; left pointing at a block that is
	 * gone, the rail shows an empty configuration panel for it.
	 */
	function reselect(): void {
		const { draft, selection } = session.value
		if (!selection || (draft && findNode(draft, selection))) {
			return
		}
		session.value.selection = null
	}

	/**
	 * A plain read that got no answer, said in the banner. Those reads are
	 * started from a click or a mount nobody waits on, so a rejection left to
	 * itself would go unseen and leave the panel quietly empty.
	 */
	function unread(what: string, error: unknown): void {
		if (consumeRefusal(error)) return
		session.value.error = {
			code: 'unsupported',
			detail: `${what} could not be read: ${error instanceof Error ? error.message : String(error)}`,
		}
	}

	/** A page as the menu names it, else by its address. */
	function pageName(ref: string): string {
		const name = session.value.pages.find((page) => page.ref === ref)?.displayName
		return name ? displayText(name) : ref
	}

	/** A category as the menu names it, else by its ref. */
	function categoryName(ref: string): string {
		const name = session.value.categories.find((entry) => entry.ref === ref)?.displayName
		return name ? displayText(name) : ref
	}

	function startPending(key: string): void {
		session.value.pending = [...session.value.pending, key]
	}

	function endPending(key: string): void {
		session.value.pending = session.value.pending.filter(
			(entry) => entry !== key,
		)
	}

	/**
	 * Show the new value at once and write it behind: a field aspect takes a
	 * transaction and a typecheck to land, which is long enough to leave a click
	 * feeling unregistered.
	 */
	function applyLocally(
		resource: string,
		field: string,
		patch: Record<string, unknown>,
	): void {
		const known = session.value.resourceStructures[resource]
		if (!known) {
			return
		}
		session.value.resourceStructures = {
			...session.value.resourceStructures,
			[resource]: {
				...known,
				fields: known.fields.map((entry) =>
					entry.name === field ? { ...entry, ...patch } : entry,
				),
			},
		}
	}

	/** The region of a container a drop into it would land in, if it has any. */
	function regionOf(path: string): string | undefined {
		const draft = session.value.draft
		const block = draft ? findNode(draft, path) : undefined
		return shownRegion(
			descriptorOf(session.value.catalog, block?.type),
			block,
			session.value.openRegions[path],
		)?.id
	}
	return {
		dirty,
		blockCount,
		gaps,
		unaskedOf,
		problems,
		selected,
		selectedDescriptor,
		paletteTarget,
		unsaved,
		pagePermission,
		accessWarnings,
		viewedAs,
		veils,
		setViewAs,
		readersOf,
		noteDirty,
		newStep,
		grouped,
		pushHistory,
		followedBlocks,
		refollow,
		openSlot,
		handOverPlacement,
		handOverSpan,
		keepDraft,
		linesForSpacer,
		nameOnPage,
		placedAt,
		rankOf,
		draftQueries,
		servedQueries,
		reselect,
		unread,
		pageName,
		categoryName,
		startPending,
		endPending,
		applyLocally,
		regionOf,
	}
}

import { computed, type ComputedRef, type Ref } from 'vue'
import { useDmsState as useState } from '#dms/frontend-module'
import { useBuilderApi } from './api'
import {
	descriptorOf,
	missingSettings,
	newBlockDraft,
	regionAfter,
	shownRegion,
	slotsOf,
	type MissingSetting,
} from './catalog'
import {
	HISTORY_LIMIT,
	PREVIEW_DEBOUNCE_MS,
	ROW_WRAPPER,
	SESSION_STATE_KEY,
	TOAST_MS,
} from './constants'
import {
	draggedType,
	refusalForDrop,
	sameTarget,
	targetAtBlock,
	targetAtPage,
	targetInside,
	wrapperFor,
	type DragPayload,
	type DropPlacement,
	type DropTarget,
	type DropWrap,
	type PointerBox,
} from './dropping'
import { draftChanges, revertChange, type DraftChange } from './changes'
import { formTableOf } from './form-table'
import { deriveKeys } from './keys'
import { blockTitle } from './naming'
import { fitSpacerColumns, pathOfNode, tidyLayout } from './layout'
import { linesHeight, SPACER_BLOCK, spacerAxis, spacerGrow } from './spacer-panel'
import { useBuilderMode } from './mode'
import { mergePatch } from './object'
import {
	cloneDraft,
	countBlocks,
	duplicateNode,
	findNode,
	insertNode,
	joinPath,
	leafName,
	moveNode,
	nameSlots,
	parentPath,
	pathForPointer,
	removeNode,
	renameNode,
	siblingsAt,
	structureToDraft,
	uniqueName,
	walkDraft,
} from './draft'
import type {
	AddQueryInput,
	BlockCatalog,
	BlockDraft,
	BlockTypeDescriptor,
	BuilderError,
	ComponentPreview,
	FileChange,
	PageDraft,
	CategorySummary,
	CreateCategoryInput,
	CreatePageInput,
	DynamicSlots,
	FieldSpec,
	OpResult,
	OpWarning,
	PageStructure,
	PageSummary,
	PreviewState,
	QueryPreview,
	QueryTemplateDescriptor,
	ResourceStructure,
	ResourceSummary,
	ValidationIssue,
} from './types'

/**
 * A place in the editor, as the controls that lead to one name it: a tab of the
 * side rail, what the inspector shows, or a workspace of the bar.
 */
export type RailView =
	| 'pages'
	| 'library'
	| 'layers'
	| 'config'
	| 'page'
	| 'json'
	| 'changes'
	| 'resource'
	| 'query'

/**
 * What the editor is working on, picked in the bar: the page, or one of the two
 * kinds of thing every page draws on — the tables and the data sources — which
 * get the whole width rather than a rail squeezed beside the page.
 */
export type Workspace = 'page' | 'tables' | 'data'

/** The tabs of the side rail, which stay whatever is selected. */
export type LeftTab = 'add' | 'layers' | 'pages'

/** What the inspector beside the page is showing. */
export type InspectorView = 'block' | 'page' | 'json' | 'changes'

/** The layouts an empty page can start from. */
export type PageLayout = 'dashboard' | 'list' | 'form'

/** What each layout lays down, row by row; a row of several sits side by side. */
const PAGE_LAYOUTS: Record<PageLayout, string[][]> = {
	dashboard: [
		['PeriodSelector'],
		['KpiCard', 'KpiCard', 'KpiCard'],
		['ChartCard', 'TopListCard'],
	],
	list: [['TableView']],
	form: [['Form']],
}

const LEFT_TABS: Record<'library' | 'layers' | 'pages', LeftTab> = {
	library: 'add',
	layers: 'layers',
	pages: 'pages',
}

const INSPECTOR_VIEWS: Record<'config' | 'page' | 'json' | 'changes', InspectorView> =
	{ config: 'block', page: 'page', json: 'json', changes: 'changes' }

export type TableTab = 'fields' | 'api' | 'settings'

/** A write that went straight to the project, as the change list shows it. */
export interface AppliedChange {
	id: number
	title: string
	/** What else it reaches: a table, the menu. */
	scope?: string
	at: number
}

/** Where the Tables view stands inside a table: which tab, or a field being added. */
export interface TableFocus {
	ref: string
	tab: TableTab
	adding: boolean
}

export type { DragPayload, DropTarget, DropWrap }

/** A place in the draft a block is inserted at; a null index means the end. */
interface Placement {
	parent: string | null
	index: number | null
}

export interface BuilderSession {
	active: boolean
	pageRef: string | null
	structure: PageStructure | null
	catalog: BlockCatalog | null
	resources: ResourceSummary[]
	pages: PageSummary[]
	categories: CategorySummary[]
	resourceFields: Record<string, string[]>
	resourceStructures: Record<string, ResourceStructure>
	queryTemplates: QueryTemplateDescriptor[]
	draft: PageDraft | null
	baseline: PageDraft | null
	version: string | null
	history: PageDraft[]
	future: PageDraft[]
	selection: string | null
	workspace: Workspace
	leftTab: LeftTab
	inspector: InspectorView
	/** The table the Tables view has open; null is the list of every table. */
	table: TableFocus | null
	preview: Record<string, ComponentPreview>
	/** The page as the DMS serves it, for blocks the preview cannot build. */
	served: Record<string, ComponentPreview>
	degraded: string[]
	/** Whether the module has built the draft as it now stands. */
	previewState: PreviewState
	/**
	 * What the module refused about the draft's structure, kept until the next
	 * preview answers. It is the only client-side knowledge of which blocks the
	 * save would reject, so the badge and the banner both read from it.
	 */
	previewIssues: ValidationIssue[]
	loading: boolean
	saving: boolean
	error: BuilderError | null
	changes: FileChange[]
	conflict: boolean
	/** A page navigated to while the draft still holds unsaved changes. */
	pendingRoute: string | null
	/**
	 * Whether someone asked to leave the editor with a draft nobody saved.
	 *
	 * The draft lives in this session and nowhere else, so closing on one is
	 * throwing the work away — the one gesture the editor must not answer
	 * silently.
	 */
	pendingClose: boolean
	/** An open block menu, positioned where it was summoned. */
	menu: { path: string; x: number; y: number } | null
	/** Keys of the write-through operations in flight, e.g. `product#price`. */
	pending: string[]
	toast: string | null
	/** Whether the toast offers to undo what it reports. */
	toastUndo: boolean
	/** What the module warned about on writes that went through, until dismissed. */
	warnings: OpWarning[]
	/**
	 * The writes made straight to the project's files since the editor opened:
	 * a table's fields, its API, the menu, a data source. They are not part of
	 * the draft — Discard does not take them back — and the change list says so
	 * rather than leaving them out.
	 */
	applied: AppliedChange[]
	/** When the draft last went from saved to holding changes; null while saved. */
	dirtySince: number | null
	/** How the last save went, until the draft is edited again. */
	lastSave: { outcome: 'saved' | 'failed'; at: number } | null
	dragging: DragPayload | null
	/**
	 * Where the drag would land, as the pointer's last position resolved it.
	 *
	 * The canvas draws itself from this and nothing else: one insertion line, and
	 * a border around the container named in it. Null while nothing is aimed at.
	 */
	dropTarget: DropTarget | null
	hovered: string | null
	/**
	 * The region each container that shows one at a time is showing, by path.
	 *
	 * A tab set hides everything but the open tab, so where a drop into it lands
	 * is not something the pointer can say: the tab on screen is the answer, and
	 * only the rendered block knows which that is. It reports it here.
	 */
	openRegions: Record<string, string>
}

function emptySession(): BuilderSession {
	return {
		active: false,
		pageRef: null,
		structure: null,
		catalog: null,
		resources: [],
		pages: [],
		categories: [],
		resourceFields: {},
		resourceStructures: {},
		queryTemplates: [],
		draft: null,
		baseline: null,
		version: null,
		history: [],
		future: [],
		selection: null,
		workspace: 'page',
		leftTab: 'add',
		inspector: 'block',
		table: null,
		preview: {},
		served: {},
		degraded: [],
		previewState: 'pending',
		previewIssues: [],
		loading: false,
		saving: false,
		error: null,
		changes: [],
		conflict: false,
		pendingRoute: null,
		pendingClose: false,
		menu: null,
		pending: [],
		toast: null,
		toastUndo: false,
		warnings: [],
		applied: [],
		dirtySince: null,
		lastSave: null,
		dragging: null,
		dropTarget: null,
		hovered: null,
		openRegions: {},
	}
}

let previewTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined
let previewToken = 0

export interface BuilderController {
	session: Ref<BuilderSession>
	dirty: ComputedRef<boolean>
	blockCount: ComputedRef<number>
	problems: ComputedRef<string[]>
	selected: ComputedRef<BlockDraft | undefined>
	selectedDescriptor: ComputedRef<BlockTypeDescriptor | undefined>
	/** The container a click in the palette adds to; `null` is the page. */
	paletteTarget: ComputedRef<string | null>
	open: (pageRef: string) => Promise<void>
	close: () => void
	leave: () => void
	resolveClose: (keep: boolean) => Promise<void>
	stayOpen: () => void
	reload: () => Promise<void>
	followRoute: (path: string) => void
	resolvePending: (keep: boolean) => Promise<void>
	select: (path: string | null, view?: RailView) => void
	setWorkspace: (workspace: Workspace) => void
	back: () => void
	openRegion: (path: string, slot: string) => void
	openMenu: (path: string, x: number, y: number) => void
	closeMenu: () => void
	setView: (view: RailView) => void
	/** Open one table in the tables view, whatever block is selected. */
	openTable: (ref: string) => void
	/** Apply an edit to the draft; answers false when it changed nothing. */
	mutate: (apply: (draft: PageDraft) => void) => boolean
	addBlock: (
		type: string,
		parent?: string | null,
		index?: number | null,
		wrap?: DropWrap,
	) => void
	remove: (path: string) => void
	duplicate: (path: string) => void
	rename: (path: string, name: string) => void
	move: (
		path: string,
		parent: string | null,
		index: number,
		wrap?: DropWrap,
	) => void
	nudge: (path: string, delta: number) => void
	patchConfig: (path: string, patch: Record<string, unknown>) => void
	/**
	 * Put a query in the draft, to be written with the blocks on the next save.
	 *
	 * Replaces the one of that name, so an editor re-sending its whole definition
	 * on every keystroke is the normal way to use it.
	 */
	setDraftQuery: (input: AddQueryInput) => void
	/** Drop a query from the draft. */
	removeDraftQuery: (name: string) => void
	/** Run an unsaved query and answer what its route would. */
	previewQuery: (
		input: AddQueryInput,
		args?: Record<string, unknown>,
	) => Promise<QueryPreview | null>
	patchMeta: (path: string, patch: Record<string, unknown>) => void
	setController: (path: string, resource: string | undefined) => void
	setSlot: (path: string, slot: string | undefined) => void
	patchPage: (patch: Record<string, unknown>) => void
	setDraft: (draft: PageDraft) => void
	undo: () => void
	redo: () => void
	cancel: () => void
	save: () => Promise<void>
	notify: (message: string, options?: { undo?: boolean }) => void
	/** Every unsaved change of the draft, as the change list shows it. */
	unsaved: ComputedRef<DraftChange[]>
	/** Put one change back, as one edit. */
	revert: (change: DraftChange) => void
	/** Answer the move to another page with "stay": the page to go back to. */
	stayOnPage: () => string | null
	/** Lay a starting layout on the page, as one edit. */
	applyLayout: (layout: PageLayout) => void
	loadResourceFields: (ref: string) => Promise<void>
	loadResource: (ref: string, force?: boolean) => Promise<void>
	loadQueryTemplates: () => Promise<void>
	createResource: (
		name: string,
		fields: FieldSpec[],
	) => Promise<string | undefined>
	deleteResource: (ref: string) => Promise<boolean>
	addField: (resource: string, field: FieldSpec) => Promise<void>
	configureCategory: (
		category: string,
		patch: Record<string, unknown>,
	) => Promise<void>
	configureQuery: (query: string, patch: Record<string, unknown>) => Promise<void>
	savePageMeta: (patch: Record<string, unknown>) => Promise<void>
	movePage: (category: string) => Promise<string | undefined>
	loadSiteTree: () => Promise<void>
	createPage: (input: CreatePageInput) => Promise<string | undefined>
	createCategory: (input: CreateCategoryInput) => Promise<void>
	deletePage: (ref: string) => Promise<boolean>
	deleteCategory: (ref: string) => Promise<void>
	configureField: (path: string, patch: Record<string, unknown>) => Promise<void>
	/** Lay a table's columns out in the order of `names`, left to right. */
	orderFields: (resource: string, names: string[]) => Promise<void>
	configureResource: (resource: string, routes: string[]) => Promise<void>
	removeField: (path: string) => Promise<void>
	addQuery: (input: AddQueryInput) => Promise<void>
	removeQuery: (ref: string) => Promise<void>
	beginDrag: (payload: DragPayload) => void
	endDrag: () => void
	/** Aim the drag at a block, `box` being the pointer inside it. */
	aimAt: (path: string, box: PointerBox) => void
	/** Aim it at the page's own surface: the end of the page. */
	aimAtPage: () => void
	/** Aim it at a container's own way in, and at the region offering it. */
	aimInto: (path: string, region?: string) => void
	/** The region of a container a drop into it would land in, if it has any. */
	regionOf: (path: string) => string | undefined
	/** Let the block go where it is aimed. */
	drop: () => void
	dropAt: (parent: string | null, index: number, wrap?: DropWrap) => void
	hover: (path: string | null) => void
	/** Why a container would refuse this type, if it would. */
	refusalAt: (parent: string | null, type?: string) => string | undefined
}

export function useBuilder(): BuilderController {
	const session = useState<BuilderSession>(SESSION_STATE_KEY, emptySession)
	const api = useBuilderApi()

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
	const gaps = computed<Array<{ path: string; settings: MissingSetting[] }>>(() => {
		const draft = session.value.draft
		if (!draft) {
			return []
		}
		const found: Array<{ path: string; settings: MissingSetting[] }> = []
		walkDraft(draft.blocks, (block, path) => {
			const descriptor = descriptorOf(session.value.catalog, block.type)
			const settings = missingSettings(descriptor, block)
			if (settings.length > 0) {
				found.push({ path, settings })
			}
		})
		return found
	})
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
			const descriptor = descriptorOf(
				session.value.catalog,
				findNode(draft, path)?.type,
			)
			if (descriptor?.container) {
				return path
			}
			path = parentPath(path)
		}
		return null
	})

	/**
	 * Say what just happened, where the author is looking. `undo` offers to take
	 * it back from the toast itself, for a change that is one edit of the draft.
	 */
	function notify(message: string, options: { undo?: boolean } = {}): void {
		session.value.toast = message
		session.value.toastUndo = options.undo === true
		clearTimeout(toastTimer)
		toastTimer = setTimeout(
			() => {
				session.value.toast = null
				session.value.toastUndo = false
			},
			// An offer to undo stays long enough to be taken up.
			options.undo ? TOAST_MS * 2 : TOAST_MS,
		)
	}

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

	/** Keep track of when the draft started to differ from the page. */
	function noteDirty(): void {
		if (!dirty.value) {
			session.value.dirtySince = null
			return
		}
		session.value.dirtySince ??= Date.now()
	}

	/** Put one change of the list back, as one edit the author can undo. */
	function revert(change: DraftChange): void {
		mutate((draft) => revertChange(draft, change.revert, servedQueries()))
		reselect()
	}

	async function refreshPreview(): Promise<void> {
		const { pageRef, draft } = session.value
		if (!pageRef || !draft) {
			return
		}
		const token = ++previewToken
		const result = await api.preview(pageRef, draft)
		// A slower preview must not overwrite the answer to a later edit.
		if (token !== previewToken) {
			return
		}
		if (!result.ok) {
			// The canvas keeps the page from before the edit, which on its own reads
			// as an edit that landed; the refusal is what says otherwise, and it is
			// the same one the save would answer with later.
			session.value.previewState = 'refused'
			session.value.previewIssues =
				result.error.code === 'invalid_config' ? result.error.issues : []
			session.value.error = result.error
			return
		}
		// The page builds again, so whatever refusal was on screen is answered.
		if (session.value.previewIssues.length > 0) {
			session.value.error = null
		}
		session.value.previewState = 'valid'
		session.value.previewIssues = []
		session.value.preview = result.data.components
		session.value.degraded = result.data.degraded
	}

	function schedulePreview(): void {
		clearTimeout(previewTimer)
		session.value.previewState = 'pending'
		previewTimer = setTimeout(() => {
			// Caught rather than left to become an unhandled rejection: one of
			// those aborts Vue's update, and the panel that triggered the preview
			// then shows stale values with no way to correct them.
			refreshPreview().catch((error: unknown) => {
				session.value.previewState = 'refused'
				session.value.error = {
					code: 'unsupported',
					detail:
						error instanceof Error
							? `the preview could not be built: ${error.message}`
							: 'the preview could not be built',
				}
			})
		}, PREVIEW_DEBOUNCE_MS)
	}

	/**
	 * A block the preview cannot build — a TableView, whose DataAPI class only
	 * the running page holds — renders from what the DMS served instead of a
	 * placeholder. It is the saved shape, so it goes stale once that block is
	 * edited; the builder says as much rather than pretending otherwise.
	 */
	async function loadServedLayout(pageRef: string): Promise<void> {
		try {
			const payload = await api.pageLayout(pageRef)
			session.value.served = payload.components ?? {}
		} catch {
			session.value.served = {}
		}
	}

	async function loadStructure(pageRef: string): Promise<boolean> {
		const result = await api.structure(pageRef)
		if (!result.ok) {
			session.value.error = result.error
			return false
		}
		const draft = structureToDraft(result.data)
		session.value.structure = result.data
		session.value.version = result.data.version
		session.value.draft = draft
		session.value.baseline = cloneDraft(draft)
		session.value.history = []
		session.value.future = []
		session.value.dirtySince = null
		session.value.conflict = false
		session.value.error = null
		session.value.previewState = 'pending'
		session.value.previewIssues = []
		return true
	}

	async function open(pageRef: string): Promise<void> {
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
			if (await loadStructure(pageRef)) {
				await Promise.all([refreshPreview(), loadServedLayout(pageRef)])
			}
		} catch (error) {
			session.value.error = {
				code: 'unsupported',
				detail: error instanceof Error ? error.message : String(error),
			}
		} finally {
			session.value.loading = false
		}
	}

	function close(): void {
		clearTimeout(previewTimer)
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

	/** Answer that question: `keep` saves the draft first, else it is dropped. */
	async function resolveClose(keep: boolean): Promise<void> {
		if (keep) {
			await save()
			// A save the module — or the panel — turned down leaves the editor
			// open on the very thing it refused.
			if (session.value.error) {
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
	 * Read the page again after a write that went straight to its file — its
	 * order, its permission, a query — keeping whatever the draft holds.
	 *
	 * Those writes leave the blocks alone, so an unsaved draft still stands on
	 * the page as it now is: only what was read off it, and the version the next
	 * save is checked against, have to catch up. Starting again from the page
	 * here is what used to drop every unsaved edit, with no undo to get it back.
	 * A draft with nothing in it simply starts again.
	 */
	async function refresh(): Promise<void> {
		const pageRef = session.value.pageRef
		if (!pageRef) {
			return
		}
		if (!dirty.value) {
			await reload()
			return
		}
		const result = await api.structure(pageRef)
		if (!result.ok) {
			session.value.error = result.error
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
			if (session.value.error) {
				return
			}
		}
		session.value.pendingRoute = null
		await open(target)
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
		fitSpacerColumns(next)
		pushHistory()
		session.value.draft = next
		session.value.lastSave = null
		noteDirty()
		refollow(next, followed)
		schedulePreview()
		return true
	}

	interface FollowedBlocks {
		selection?: BlockDraft
		regions: Array<[BlockDraft, string]>
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
	 * Select a block, or nothing. A block is configured in the inspector; with
	 * nothing selected the inspector says so, unless it was showing something
	 * other than a block — the page's settings stay open over a click on the
	 * canvas around the blocks.
	 */
	function select(path: string | null, view: RailView = 'config'): void {
		session.value.selection = path
		if (path) {
			setView(view)
		}
	}

	/** Open a place of the editor, keeping whatever the others show. */
	function setView(view: RailView): void {
		session.value.menu = null
		switch (view) {
			case 'resource': {
				// Reached from a block that reads a table, the tables open on that
				// one; from anywhere else, on the list of them.
				const ref = selected.value?.controller
				session.value.table = ref ? { ref, tab: 'fields', adding: false } : null
				session.value.workspace = 'tables'
				return
			}
			case 'query':
				session.value.workspace = 'data'
				return
			case 'library':
			case 'layers':
			case 'pages':
				session.value.workspace = 'page'
				session.value.leftTab = LEFT_TABS[view]
				return
			default:
				session.value.workspace = 'page'
				session.value.inspector = INSPECTOR_VIEWS[view]
		}
	}

	/** Switch the bar's workspace, the page's own state left as it was. */
	function setWorkspace(workspace: Workspace): void {
		session.value.menu = null
		if (workspace === 'tables' && session.value.workspace !== 'tables') {
			setView('resource')
			return
		}
		session.value.workspace = workspace
	}

	function openTable(ref: string): void {
		setView('resource')
		session.value.table = { ref, tab: 'fields', adding: false }
	}

	/**
	 * Climb one step back: inside the tables, out of the field being added, then
	 * out of the table, then back to the page; on the page, from whatever the
	 * inspector was showing back to the selection.
	 */
	function back(): void {
		const table = session.value.table
		if (session.value.workspace === 'tables' && table) {
			session.value.table = table.adding ? { ...table, adding: false } : null
			return
		}
		if (session.value.workspace !== 'page') {
			session.value.workspace = 'page'
			return
		}
		session.value.inspector = 'block'
	}

	/**
	 * Record which of a container's own regions is on screen.
	 *
	 * Reported by the block itself as it renders — a tab set is the only
	 * container that hides part of what it holds, and it is the one that knows
	 * which part — so that a drop into it lands where the author is looking.
	 */
	function openRegion(path: string, slot: string): void {
		if (session.value.openRegions[path] === slot) {
			return
		}
		session.value.openRegions = { ...session.value.openRegions, [path]: slot }
	}

	function openMenu(path: string, x: number, y: number): void {
		select(path)
		session.value.menu = { path, x, y }
	}

	function closeMenu(): void {
		session.value.menu = null
	}

	function refusalAt(parent: string | null, type?: string): string | undefined {
		return refusalTo({ parent }, type)
	}

	function refusalTo(
		placement: DropPlacement,
		type?: string,
		moving?: string,
	): string | undefined {
		return refusalForDrop(
			session.value.catalog,
			session.value.draft,
			placement,
			type,
			moving,
		)
	}

	/**
	 * Put a block in one of its container's slots when that is the only way it
	 * renders.
	 *
	 * A tab set holds its children through the slots its own options declare, and
	 * a child carrying none is laid out nowhere: dropped into it, a block would
	 * simply disappear from the page until someone assigned it a tab by hand. It
	 * takes the first slot instead, and the first slot is created for it when the
	 * container has none yet.
	 */
	function adoptSlot(
		draft: PageDraft,
		parent: string | null,
		node: BlockDraft,
	): void {
		const container = parent === null ? undefined : findNode(draft, parent)
		const descriptor = descriptorOf(session.value.catalog, container?.type)
		const slots = slotsOf(descriptor, container)
		if (node.slot && slots.some((slot) => slot.id === node.slot)) {
			return
		}
		const dynamic = descriptor?.dynamicSlots
		if (!container || !dynamic) {
			// Anywhere else the container renders its children itself, and a slot
			// left over from where the block came from would hide it.
			delete node.slot
			return
		}
		const shown = shownRegion(
			descriptor,
			container,
			session.value.openRegions[parent ?? ''],
		)
		node.slot = (shown ?? openSlot(container, dynamic)).id
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

	/**
	 * The container a block really lands in: the one aimed at, or the child that
	 * container builds around it when it holds nothing else.
	 *
	 * A Grid holds rows and the user aims a card at it; creating the row as part
	 * of the same gesture is the whole difference between a grid and a stack. The
	 * row is inserted through `insertNode`, so its name is free of the ones its
	 * siblings already took.
	 */
	function hostFor(
		draft: PageDraft,
		placement: Placement,
		type: string | undefined,
		wrap?: DropWrap,
	): Placement {
		const enclosed = wrap
			? wrap.type === ROW_WRAPPER
				? rowAround(draft, wrap)
				: stackAround(draft, wrap)
			: undefined
		if (enclosed) {
			return enclosed
		}
		const parent = placement.parent
		const container = parent === null ? undefined : findNode(draft, parent)
		const wrapper = wrapperFor(session.value.catalog, container?.type, type)
		if (!wrapper) {
			return placement
		}
		const created = insertNode(
			draft,
			parent,
			placement.index,
			newBlockDraft(wrapper),
		)
		return created ? { parent: created, index: null } : placement
	}

	/**
	 * Enclose a block that is already on the page, so the drop can stack with it.
	 *
	 * Pointing above or below one cell of a row asks for something the row cannot
	 * lay out: it puts its children side by side and nothing else. The cell moves
	 * into a column of its own instead, and the two blocks share it. The column
	 * inherits the span the cell claimed, or the row would re-measure itself and
	 * the layout would shift under a gesture that only added a block.
	 */
	function stackAround(draft: PageDraft, wrap: DropWrap): Placement | undefined {
		const descriptor = descriptorOf(session.value.catalog, wrap.type)
		const parent = parentPath(wrap.around)
		const siblings = siblingsAt(draft, parent)
		const at = siblings?.findIndex(
			(block) => block.name === leafName(wrap.around),
		)
		const enclosed = at === undefined || at === -1 ? undefined : siblings?.[at]
		if (!descriptor || !siblings || !enclosed || at === undefined) {
			return undefined
		}
		siblings.splice(at, 1)
		const column = newBlockDraft(descriptor)
		handOverSpan(enclosed, column)
		const created = insertNode(draft, parent, at, column)
		if (!created) {
			siblings.splice(at, 0, enclosed)
			return undefined
		}
		column.children = [enclosed]
		return { parent: created, index: wrap.index }
	}

	/**
	 * Build a row around a block that sits on its own, so the drop can go beside it.
	 *
	 * The block moves into the row where it stood, and the grid holding the row
	 * takes over what placed the block there — the region of a tab, the columns
	 * it spanned — or the layout around it would shift under a gesture that only
	 * added a block.
	 */
	function rowAround(draft: PageDraft, wrap: DropWrap): Placement | undefined {
		const grid = descriptorOf(session.value.catalog, wrap.type)
		const row = descriptorOf(session.value.catalog, grid?.allowedChildren?.[0])
		const parent = parentPath(wrap.around)
		const siblings = siblingsAt(draft, parent)
		const at = siblings?.findIndex(
			(block) => block.name === leafName(wrap.around),
		)
		const enclosed = at === undefined || at === -1 ? undefined : siblings?.[at]
		if (!grid || !row || !siblings || !enclosed || at === undefined) {
			return undefined
		}
		siblings.splice(at, 1)
		const gridDraft = newBlockDraft(grid)
		handOverPlacement(enclosed, gridDraft)
		const created = insertNode(draft, parent, at, gridDraft)
		if (!created) {
			siblings.splice(at, 0, enclosed)
			return undefined
		}
		const rowDraft = newBlockDraft(row)
		rowDraft.children = [enclosed]
		gridDraft.children = [rowDraft]
		return { parent: joinPath(created, rowDraft.name), index: wrap.index }
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

	function addBlock(
		type: string,
		parent: string | null = null,
		index: number | null = null,
		wrap?: DropWrap,
	): void {
		const descriptor = descriptorOf(session.value.catalog, type)
		if (!descriptor) {
			return
		}
		// The rule is the catalog's own, and the module enforces it again on save:
		// applying the insertion and reporting it as added would be a lie the user
		// only hears about one round trip later.
		const refusal = refusalTo({ parent, wrap }, type)
		if (refusal) {
			notify(refusal)
			return
		}
		let node: BlockDraft | undefined
		mutate((draft) => {
			const host = hostFor(draft, { parent, index }, type, wrap)
			const placed = newBlockDraft(descriptor, rankOf(draft, type))
			placed.name = nameOnPage(draft, placed.name)
			adoptSlot(draft, host.parent, placed)
			linesForSpacer(draft, host.parent, placed)
			if (insertNode(draft, host.parent, host.index, placed)) {
				node = placed
			}
		})
		const created = node && placedAt(node)
		if (created) {
			select(created)
			notify(`${descriptor.label ?? descriptor.type} added`)
		}
	}

	/**
	 * Lay a starting layout on the page, as one edit: rows of blocks, a row of
	 * several placed side by side the way a drop beside a block places them.
	 * Types the project's DMS does not declare are left out.
	 */
	function applyLayout(layout: PageLayout): void {
		const catalog = session.value.catalog
		const rows = PAGE_LAYOUTS[layout]
			.map((row) => row.filter((type) => descriptorOf(catalog, type)))
			.filter((row) => row.length > 0)
		if (!rows.length) {
			return
		}
		mutate((draft) => {
			for (const row of rows) {
				let first: string | undefined
				let rowParent: string | null = null
				for (const [column, type] of row.entries()) {
					const descriptor = descriptorOf(catalog, type)
					if (!descriptor) {
						continue
					}
					let placement: Placement = { parent: null, index: null }
					if (first !== undefined && column === 1) {
						placement = hostFor(draft, placement, type, {
							around: first,
							type: ROW_WRAPPER,
							index: 1,
						})
						rowParent = placement.parent
					} else if (column > 1) {
						placement = { parent: rowParent, index: null }
					}
					const placed = newBlockDraft(descriptor, rankOf(draft, type))
					placed.name = nameOnPage(draft, placed.name)
					const path = insertNode(draft, placement.parent, placement.index, placed)
					first ??= path
				}
			}
		})
		notify('Layout added', { undo: true })
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

	function remove(path: string): void {
		const block = session.value.draft
			? findNode(session.value.draft, path)
			: undefined
		let removed = false
		mutate((draft) => {
			removed = removeNode(draft, path)
		})
		if (!removed) {
			return
		}
		if (session.value.selection === path) {
			select(null)
		}
		// Named, and undone from where it is said: one key took it away, so
		// one click brings it back.
		notify(
			block ? `Removed ${blockTitle(block, session.value.catalog)}` : 'Block removed',
			{ undo: true },
		)
	}

	function duplicate(path: string): void {
		let node: BlockDraft | undefined
		mutate((draft) => {
			const created = duplicateNode(draft, path)
			node = created ? findNode(draft, created) : undefined
		})
		const created = node && placedAt(node)
		if (created) {
			select(created)
			notify('Block duplicated')
		}
	}

	function rename(path: string, name: string): void {
		let node: BlockDraft | undefined
		mutate((draft) => {
			const renamed = renameNode(draft, path, name)
			node = renamed ? findNode(draft, renamed) : undefined
		})
		const renamed = node && placedAt(node)
		if (renamed) {
			select(renamed)
		}
	}

	/**
	 * Tried on a copy first, and written back only once it worked.
	 *
	 * A move can need a container built for it — a row, or a column around the
	 * cell it lands under — and the draft can still turn the move itself down.
	 * Building on a copy is the only way that scaffolding leaves no trace when
	 * it does: the page must not read as edited by a gesture that changed
	 * nothing.
	 */
	function move(
		path: string,
		parent: string | null,
		index: number,
		wrap?: DropWrap,
	): void {
		const current = session.value.draft
		if (!current) {
			return
		}
		const trial = cloneDraft(current)
		const host = hostFor(trial, { parent, index }, findNode(trial, path)?.type, wrap)
		const moved = moveNode(trial, path, host.parent, host.index ?? 0)
		if (!moved) {
			return
		}
		const node = findNode(trial, moved)
		if (node) {
			adoptSlot(trial, host.parent, node)
		}
		mutate((draft) => {
			draft.blocks = trial.blocks
		})
		const landed = node ? placedAt(node) : undefined
		select(landed ?? moved)
	}

	function nudge(path: string, delta: number): void {
		const draft = session.value.draft
		if (!draft) {
			return
		}
		const parent = parentPath(path)
		const siblings = siblingsAt(draft, parent)
		if (!siblings) {
			return
		}
		const index = siblings.findIndex((block) => block.name === leafName(path))
		if (index === -1 || index + delta < 0 || index + delta >= siblings.length) {
			return
		}
		// `move` takes the index in the list as it stands now: stepping down means
		// landing after the next sibling, hence the extra one.
		move(path, parent, delta > 0 ? index + 2 : index - 1)
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
	 * Bring queries just written straight to the page into a draft that keeps
	 * its own list of them: that list goes out whole with the next save, and
	 * would otherwise undo the write. Each name is taken as the page now serves
	 * it — there, or gone. The saved state takes it too, or the write would read
	 * as an unsaved change.
	 */
	function carryQueries(names: string[]): void {
		const served = servedQueries().filter((query) => names.includes(query.name))
		for (const draft of [session.value.draft, session.value.baseline]) {
			if (!draft?.queries) {
				continue
			}
			draft.queries = [
				...draft.queries.filter((query) => !names.includes(query.name)),
				...served,
			]
		}
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

	function patchPage(patch: Record<string, unknown>): void {
		mutate((draft) => {
			draft.page = { ...(draft.page ?? {}), ...patch }
		})
	}

	function setDraft(draft: PageDraft): void {
		mutate((current) => {
			current.blocks = cloneDraft(draft.blocks)
			if (draft.page) {
				current.page = cloneDraft(draft.page)
			}
		})
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

	function undo(): void {
		const previous = session.value.history.at(-1)
		if (!previous || !session.value.draft) {
			return
		}
		session.value.future = [cloneDraft(session.value.draft), ...session.value.future]
		session.value.history = session.value.history.slice(0, -1)
		session.value.draft = previous
		noteDirty()
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
		noteDirty()
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
		schedulePreview()
		notify('Changes discarded', { undo: true })
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
				session.value.error = result.error
				session.value.conflict = result.error.code === 'stale'
				session.value.lastSave = { outcome: 'failed', at: Date.now() }
				return
			}
			session.value.version = result.data.version
			session.value.changes = result.changes
			session.value.baseline = cloneDraft(draft)
			session.value.history = []
			session.value.future = []
			session.value.lastSave = { outcome: 'saved', at: Date.now() }
			noteDirty()
			report(result, 'Page saved')
		} finally {
			session.value.saving = false
		}
	}

	/** The field names of a resource, fetched once and kept for the pickers. */
	async function loadResourceFields(ref: string): Promise<void> {
		if (!ref || session.value.resourceFields[ref]) {
			return
		}
		const result = await api.resource(ref)
		if (!result.ok) {
			return
		}
		session.value.resourceFields = {
			...session.value.resourceFields,
			[ref]: result.data.fields.map((field) => field.name),
		}
	}

	/** A resource's full structure, cached until a write invalidates it. */
	async function loadResource(ref: string, force = false): Promise<void> {
		if (!ref || (!force && session.value.resourceStructures[ref])) {
			return
		}
		const result = await api.resource(ref)
		// A structure with no fields to read is none the panels can use, and
		// caching it would stand in for the real one until the next write.
		if (!result.ok || !Array.isArray(result.data?.fields)) {
			return
		}
		session.value.resourceStructures = {
			...session.value.resourceStructures,
			[ref]: result.data,
		}
		session.value.resourceFields = {
			...session.value.resourceFields,
			[ref]: result.data.fields.map((field) => field.name),
		}
	}

	async function loadQueryTemplates(): Promise<void> {
		if (session.value.queryTemplates.length) {
			return
		}
		try {
			session.value.queryTemplates = await api.queryTemplates()
		} catch (error) {
			unread('The query templates', error)
		}
	}

	/**
	 * A plain read that got no answer, said in the banner. Those reads are
	 * started from a click or a mount nobody waits on, so a rejection left to
	 * itself would go unseen and leave the panel quietly empty.
	 */
	function unread(what: string, error: unknown): void {
		session.value.error = {
			code: 'unsupported',
			detail: `${what} could not be read: ${error instanceof Error ? error.message : String(error)}`,
		}
	}

	/** Read the tables again, keeping the list already shown when that fails. */
	async function loadResources(): Promise<void> {
		try {
			session.value.resources = await api.resources()
		} catch (error) {
			unread('The tables', error)
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
			session.value.error = result.error
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

	/**
	 * Resource and query writes touch files the page only references, so they
	 * are applied straight away rather than staged in the draft.
	 */
	/** A page as the menu names it, else by its address. */
	function pageName(ref: string): string {
		return session.value.pages.find((page) => page.ref === ref)?.displayName ?? ref
	}

	/** A category as the menu names it, else by its ref. */
	function categoryName(ref: string): string {
		return (
			session.value.categories.find((entry) => entry.ref === ref)?.displayName ?? ref
		)
	}

	/** The pages and categories the builder can create alongside, and navigate to. */
	async function loadSiteTree(): Promise<void> {
		try {
			const [pages, categories] = await Promise.all([
				api.pages(),
				api.categories(),
			])
			session.value.pages = pages
			session.value.categories = categories
		} catch (error) {
			unread('The pages', error)
		}
	}

	/**
	 * Creating a page writes its file and wires the barrel; the DMS picks it up
	 * on reload. The caller navigates to the returned ref, and the builder
	 * follows the route onto the new page.
	 */
	async function createPage(input: CreatePageInput): Promise<string | undefined> {
		const result = await api.createPage(input)
		if (!report(result, `Page ${input.displayName} created`, {
				title: `Created the page ${input.displayName}`,
				scope: 'menu',
			})) {
			return undefined
		}
		await loadSiteTree()
		return result.ok ? result.data.ref : undefined
	}

	async function createCategory(input: CreateCategoryInput): Promise<void> {
		const result = await api.createCategory(input)
		if (!report(result, `Category ${input.displayName} created`, {
				title: `Created the category ${input.displayName}`,
				scope: 'menu',
			})) {
			return
		}
		await loadSiteTree()
	}

	/**
	 * Delete a page, and answer whether it went. The caller moves off it when
	 * it was the one open: which page to show instead is a navigation, and the
	 * router is the caller's.
	 */
	async function deletePage(ref: string): Promise<boolean> {
		const result = await api.deletePage(ref)
		if (!report(result, 'Page deleted', {
				title: `Deleted the page ${pageName(ref)}`,
				scope: 'menu',
			})) {
			return false
		}
		if (session.value.pageRef === ref) {
			// The draft edits a file that is gone. Kept, it would offer a Save
			// that has nothing to write to, and stop the move off the page to
			// ask about changes nobody can keep.
			clearTimeout(previewTimer)
			session.value.draft = null
			session.value.baseline = null
			session.value.structure = null
			session.value.selection = null
			session.value.loading = true
		}
		await loadSiteTree()
		return true
	}

	async function deleteCategory(ref: string): Promise<void> {
		const result = await api.deleteCategory(ref)
		if (!report(result, 'Category deleted', {
				title: `Deleted the category ${categoryName(ref)}`,
				scope: 'menu',
			})) {
			return
		}
		await loadSiteTree()
	}

	/** Create a resource, and answer the ref the engine gave it. */
	async function createResource(
		name: string,
		fields: FieldSpec[],
	): Promise<string | undefined> {
		const result = await api.createResource({ name, fields })
		if (!report(result, `Table ${name} created`, {
				title: `Created the table ${name}`,
				scope: 'tables',
			}) || !result.ok) {
			return undefined
		}
		await loadResources()
		// The engine derives the ref from the name; reloading under what the
		// user typed misses whenever the two differ, and the panel then shows an
		// empty resource after a create that worked.
		await loadResource(result.data.ref, true)
		return result.data.ref
	}

	/** Delete a resource and every row it holds; answer whether it went. */
	async function deleteResource(ref: string): Promise<boolean> {
		const result = await api.deleteResource(ref)
		if (!report(result, 'Table deleted', {
				title: `Deleted the table ${ref} and its rows`,
				scope: 'tables',
			})) {
			return false
		}
		await loadResources()
		return true
	}

	async function addField(resource: string, field: FieldSpec): Promise<void> {
		const result = await api.addField(resource, field)
		if (!report(result, `Field ${field.name} added`, {
				title: `${resource} · added the field ${field.name}`,
				scope: resource,
			})) {
			return
		}
		await loadResource(resource, true)
	}

	async function configureCategory(
		category: string,
		patch: Record<string, unknown>,
	): Promise<void> {
		const result = await api.configureCategory(category, patch)
		if (!report(result, 'Category updated', {
				title: `Changed the category ${categoryName(category)}`,
				scope: 'menu',
			})) {
			return
		}
		await loadSiteTree()
	}

	async function configureQuery(
		query: string,
		patch: Record<string, unknown>,
	): Promise<void> {
		const result = await api.configureQuery(query, patch)
		if (!report(result, 'Data source updated', {
				title: `Changed the data source ${queryName(query)}`,
				scope: 'data',
			})) {
			return
		}
		await refresh()
		// The patch can rename it: the old name is gone, the new one served.
		carryQueries(
			[queryName(query), patch.name].filter(
				(name): name is string => typeof name === 'string',
			),
		)
	}

	/** A query's own name, out of the `page@name` ref it is written under. */
	function queryName(ref: string): string {
		return ref.slice(ref.lastIndexOf('@') + 1)
	}

	/**
	 * Page metadata the draft does not carry — order and permission are written
	 * straight through rather than staged with the blocks.
	 */
	async function savePageMeta(patch: Record<string, unknown>): Promise<void> {
		const pageRef = session.value.pageRef
		if (!pageRef) {
			return
		}
		const result = await api.configurePage(pageRef, patch)
		if (!report(result, 'Page updated', {
				title: 'Changed where the page shows in the menu',
				scope: 'menu',
			})) {
			return
		}
		// The pages panel lists the page by its order too.
		await Promise.all([refresh(), loadSiteTree()])
	}

	/**
	 * Move the page to another category, and report where it went.
	 *
	 * Not a draft edit like the settings above it: the category decides the
	 * page's route, so changing it moves the file and rewrites the registration
	 * — work that has no half-done state to hold. The new ref is returned so the
	 * caller can follow the page to its new address.
	 */
	async function movePage(category: string): Promise<string | undefined> {
		const pageRef = session.value.pageRef
		if (!pageRef || session.value.pending.includes(pageRef)) {
			return undefined
		}
		startPending(pageRef)
		try {
			const result = await api.configurePage(pageRef, { category })
			if (!report(result, 'Page moved', {
				title: `Moved the page to ${categoryName(category)}`,
				scope: 'menu',
			}) || !result.ok) {
				return undefined
			}
			// An unsaved draft is the same page at its new address, and goes
			// there with it. Left on the old ref, saving it answers `not_found`,
			// and the editor stops the move to the new route to ask about it.
			if (dirty.value && result.data.ref !== pageRef) {
				session.value.pageRef = result.data.ref
				await refresh()
			}
			await loadSiteTree()
			return result.data.ref
		} finally {
			endPending(pageRef)
		}
	}

	/** Which endpoints the resource serves — export among them. */
	async function configureResource(
		resource: string,
		routes: string[],
	): Promise<void> {
		if (session.value.pending.includes(resource)) {
			return
		}
		startPending(resource)
		try {
			const result = await api.configureResource(resource, { routes })
			report(result, 'Table API updated', {
				title: `${resource} · changed what its API serves`,
				scope: resource,
			})
			await loadResource(resource, true)
		} finally {
			endPending(resource)
		}
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

	async function configureField(
		path: string,
		patch: Record<string, unknown>,
	): Promise<void> {
		if (session.value.pending.includes(path)) {
			return
		}
		const [resource, field] = path.split('#')
		startPending(path)
		applyLocally(resource ?? '', field ?? '', patch)
		try {
			const result = await api.configureField(path, patch)
			if (!report(result, 'Field updated', {
					title: `${resource} · changed the field ${field}`,
					scope: resource,
				})) {
				// The optimistic value was a guess; the resource says otherwise.
				await loadResource(resource ?? '', true)
				return
			}
			await loadResource(resource ?? '', true)
		} finally {
			endPending(path)
		}
	}

	/**
	 * A column's place is its rank, written on each column whose rank changes.
	 * They are shown in their new places at once, written one after the other
	 * — each rewrites the same file — and the table is read once they all are.
	 */
	async function orderFields(resource: string, names: string[]): Promise<void> {
		const known = session.value.resourceStructures[resource]
		if (!known || session.value.pending.includes(resource)) {
			return
		}
		const moved = names.flatMap((name, index) => {
			const field = known.fields.find((entry) => entry.name === name)
			return field && !field.opaque && field.order !== index + 1
				? [{ name, order: index + 1 }]
				: []
		})
		if (!moved.length) {
			return
		}
		for (const entry of moved) {
			applyLocally(resource, entry.name, { order: entry.order })
		}
		startPending(resource)
		try {
			for (const entry of moved) {
				const result = await api.configureField(`${resource}#${entry.name}`, {
					order: entry.order,
				})
				if (!report(result, 'Fields moved', {
						title: `${resource} · moved the field ${entry.name}`,
						scope: resource,
					})) {
					break
				}
			}
			await loadResource(resource, true)
		} finally {
			endPending(resource)
		}
	}

	async function removeField(path: string): Promise<void> {
		const result = await api.removeField(path)
		if (!report(result, 'Field removed', {
				title: `${path.split('#')[0]} · removed the field ${path.split('#')[1]} and its data`,
				scope: path.split('#')[0],
			})) {
			return
		}
		await loadResource(path.split('#')[0] ?? '', true)
	}

	async function addQuery(input: AddQueryInput): Promise<void> {
		const pageRef = session.value.pageRef
		if (!pageRef) {
			return
		}
		const result = await api.addQuery(pageRef, input)
		if (!report(result, `Data source ${input.name} added`, {
				title: `Added the data source ${input.name}`,
				scope: 'data',
			})) {
			return
		}
		await refresh()
		carryQueries([input.name])
	}

	async function removeQuery(ref: string): Promise<void> {
		const result = await api.removeQuery(ref)
		if (!report(result, 'Data source removed', {
				title: `Removed the data source ${queryName(ref)}`,
				scope: 'data',
			})) {
			return
		}
		await refresh()
		carryQueries([queryName(ref)])
	}

	function beginDrag(payload: DragPayload): void {
		session.value.dragging = payload
		session.value.dropTarget = null
	}

	function endDrag(): void {
		session.value.dragging = null
		session.value.dropTarget = null
	}

	function hover(path: string | null): void {
		session.value.hovered = path
	}

	/**
	 * Take note of where the pointer is aiming.
	 *
	 * `dragover` fires throughout the gesture, and the canvas draws itself from
	 * this answer: an unchanged one is not written back, so the page is not
	 * re-rendered dozens of times while the pointer sits still.
	 */
	function aim(target: DropTarget | null): void {
		if (!sameTarget(session.value.dropTarget, target)) {
			session.value.dropTarget = target
		}
	}

	function aimAt(path: string, box: PointerBox): void {
		const payload = session.value.dragging
		if (!payload) {
			return
		}
		aim(
			targetAtBlock(
				session.value.catalog,
				session.value.draft,
				payload,
				path,
				box,
			),
		)
	}

	function aimAtPage(): void {
		if (session.value.dragging) {
			aim(targetAtPage(session.value.draft))
		}
	}

	/**
	 * Aim at a container's own way in, and at the region offering it.
	 *
	 * Naming the region is what lets a tab set the preview has not built yet
	 * take a drop into the tab it is aimed at rather than into the first one:
	 * every region of such a set is on screen at once, so the pointer is the
	 * only thing that says which. A set the preview has built shows one region
	 * at a time and reports it itself, so this names the one already open.
	 */
	function aimInto(path: string, region?: string): void {
		if (!session.value.dragging) {
			return
		}
		if (region !== undefined) {
			openRegion(path, region)
		}
		aim(
			targetInside(
				session.value.catalog,
				session.value.draft,
				session.value.dragging,
				path,
			),
		)
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

	function drop(): void {
		const target = session.value.dropTarget
		if (!target) {
			endDrag()
			return
		}
		dropAt(target.parent, target.index, target.wrap)
	}

	/** Resolve a drop: a palette drag inserts, a block drag moves. */
	function dropAt(
		parent: string | null,
		index: number,
		wrap?: DropWrap,
	): void {
		const payload = session.value.dragging
		session.value.dragging = null
		session.value.dropTarget = null
		if (!payload) {
			return
		}
		const refusal = refusalTo(
			{ parent, wrap },
			draggedType(session.value.draft, payload),
			payload.path,
		)
		if (refusal) {
			notify(refusal)
			return
		}
		if (payload.path) {
			move(payload.path, parent, index, wrap)
			return
		}
		if (payload.type) {
			addBlock(payload.type, parent, index, wrap)
		}
	}

	return {
		session,
		dirty,
		blockCount,
		problems,
		selected,
		selectedDescriptor,
		paletteTarget,
		open,
		close,
		reload,
		followRoute,
		resolvePending,
		leave,
		resolveClose,
		stayOpen,
		select,
		setView,
		setWorkspace,
		openTable,
		back,
		openRegion,
		openMenu,
		closeMenu,
		mutate,
		addBlock,
		remove,
		duplicate,
		rename,
		move,
		nudge,
		patchConfig,
		setDraftQuery,
		removeDraftQuery,
		previewQuery,
		patchMeta,
		setController,
		setSlot,
		patchPage,
		setDraft,
		undo,
		redo,
		cancel,
		save,
		notify,
		unsaved,
		revert,
		stayOnPage,
		applyLayout,
		loadResourceFields,
		loadResource,
		loadQueryTemplates,
		createResource,
		deleteResource,
		addField,
		configureCategory,
		configureQuery,
		savePageMeta,
		movePage,
		loadSiteTree,
		createPage,
		createCategory,
		deletePage,
		deleteCategory,
		configureField,
		orderFields,
		configureResource,
		removeField,
		addQuery,
		removeQuery,
		beginDrag,
		endDrag,
		aimAt,
		aimAtPage,
		aimInto,
		regionOf,
		drop,
		dropAt,
		hover,
		refusalAt,
	}
}

export { joinPath, parentPath, leafName }

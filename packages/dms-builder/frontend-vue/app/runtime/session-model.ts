import { type ComputedRef, type Ref } from 'vue'
import { useDmsState } from '#dms/frontend-module'
import { useBuilderApi } from './api'
import { type MissingSetting } from './catalog'
import { PAGE_TOOLBAR } from './constants'
import {
	type DragPayload,
	type DropTarget,
	type DropWrap,
	type PointerBox,
} from './dropping'
import { type AccessWarning, type BlockVeil } from './access'
import { type DraftChange } from './changes'
import { type StoredDraft } from './draft-store'
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
	FieldSpec,
	OpWarning,
	PageAccess,
	PageStructure,
	PageSummary,
	PreviewState,
	QueryPreview,
	RoleAccess,
	QueryTemplateDescriptor,
	ResourceStructure,
	ResourceSummary,
	TableReader,
	TableUsage,
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

/**
 * What the editor is working on, picked in the bar: the page, one of the two
 * kinds of thing every page draws on — the tables and the data sources — or a
 * database the project maps, each given the whole width rather than a rail
 * squeezed beside the page.
 */
export type Workspace = 'page' | 'tables' | 'data' | 'database'

/** The tabs of the side rail, which stay whatever is selected. */
export type LeftTab = 'add' | 'layers' | 'pages'

/** What the inspector beside the page is showing. */
export type InspectorView = 'block' | 'page' | 'json' | 'changes'

/** The layouts an empty page can start from. */
export type PageLayout = 'dashboard' | 'list' | 'form'

/** What each layout lays down, row by row; a row of several sits side by side. */
export const PAGE_LAYOUTS: Record<PageLayout, string[][]> = {
	dashboard: [
		[PAGE_TOOLBAR],
		['KpiCard', 'KpiCard', 'KpiCard'],
		['ChartCard', 'TopListCard'],
	],
	list: [['TableView']],
	form: [['Form']],
}

export const LEFT_TABS: Record<'library' | 'layers' | 'pages', LeftTab> = {
	library: 'add',
	layers: 'layers',
	pages: 'pages',
}

export const INSPECTOR_VIEWS: Record<'config' | 'page' | 'json' | 'changes', InspectorView> =
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

/** A place in the draft a block is inserted at; a null index means the end. */
export interface Placement {
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
	/** What each table reaches and holds, once read; null until then. */
	tableUsage: TableUsage | null
	/** Who reaches the page and its blocks, once read; null until then. */
	access: PageAccess | null
	/**
	 * The role the canvas is looked at as, by id: what it would not be shown
	 * of the draft is veiled. Null is the owner, who is shown everything.
	 */
	viewAs: string | null
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
	/**
	 * The layout a page just created starts from, laid on it once the editor
	 * opens there — the page is written empty, the layout is the first edit.
	 */
	startLayout: { ref: string; layout: PageLayout } | null
	/**
	 * A draft kept on this device from an earlier visit: put back as it was,
	 * or — made on a version of the page that has moved since — offered.
	 */
	restored: { at: number; stale: boolean; kept?: StoredDraft } | null
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

export function emptySession(): BuilderSession {
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
		tableUsage: null,
		access: null,
		viewAs: null,
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
		startLayout: null,
		restored: null,
		dragging: null,
		dropTarget: null,
		hovered: null,
		openRegions: {},
	}
}

/** A block with settings still empty, and which ones. */
export interface BlockGap {
	path: string
	settings: MissingSetting[]
}

export interface BuilderController {
	session: Ref<BuilderSession>
	dirty: ComputedRef<boolean>
	blockCount: ComputedRef<number>
	problems: ComputedRef<string[]>
	/** The settings each block still leaves empty, by its path. */
	gaps: ComputedRef<BlockGap[]>
	selected: ComputedRef<BlockDraft | undefined>
	selectedDescriptor: ComputedRef<BlockTypeDescriptor | undefined>
	/** The container a click in the palette adds to; `null` is the page. */
	paletteTarget: ComputedRef<string | null>
	open: (pageRef: string) => Promise<void>
	close: () => void
	leave: () => void
	resolveClose: (keep: boolean, onDevice?: boolean) => Promise<void>
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
	/** Make the page live with these options, or not with null. */
	setLive: (live: Record<string, unknown> | null) => void
	setDraft: (draft: PageDraft) => void
	undo: () => void
	redo: () => void
	cancel: () => void
	save: () => Promise<void>
	notify: (message: string, options?: { undo?: boolean }) => void
	/** Every unsaved change of the draft, as the change list shows it. */
	unsaved: ComputedRef<DraftChange[]>
	/** The pages reading a table, once known: what a change to it reaches. */
	readersOf: (table: string) => TableReader[] | undefined
	/** Who would stop seeing what once the draft is saved. */
	accessWarnings: ComputedRef<AccessWarning[]>
	/** The permission the page opens under in the draft, once its access is read. */
	pagePermission: ComputedRef<string | null>
	/** The role the canvas is looked at as, if any. */
	viewedAs: ComputedRef<RoleAccess | undefined>
	/** What that role would not be shown of the draft, by path. */
	veils: ComputedRef<Record<string, BlockVeil>>
	/** Look at the canvas as a role; null goes back to the owner's view. */
	setViewAs: (role: string | null) => void
	/** Read who reaches the page again, with the permission the draft gives it. */
	loadAccess: () => Promise<void>
	/** Put one change back, as one edit. */
	revert: (change: DraftChange) => void
	/** Answer the move to another page with "stay": the page to go back to. */
	stayOnPage: () => string | null
	/** Lay a starting layout on the page, as one edit. */
	applyLayout: (layout: PageLayout) => void
	/** Count the edits `run` makes, with those about `key` just before, as one step. */
	grouped: (key: string, run: () => void) => void
	/** Add a block below the selection, or beside it. */
	addNextTo: (type: string, beside?: boolean) => void
	/**
	 * Answer a page changed on disk with "keep mine": the draft stays, and the
	 * next save writes it over what changed outside the editor.
	 */
	keepMine: () => Promise<void>
	/** Lay the draft kept from an earlier visit, made on an older page, all the same. */
	restoreAnyway: () => void
	/** Throw away the draft kept from an earlier visit. */
	dropRestored: () => void
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
	/** Move a category one place up or down the menu, written at once. */
	moveCategory: (ref: string, delta: -1 | 1) => Promise<void>
	movePage: (category: string) => Promise<string | undefined>
	loadSiteTree: () => Promise<void>
	/** Create a page, which the editor lays `layout` on once it opens there. */
	createPage: (input: CreatePageInput, layout?: PageLayout) => Promise<string | undefined>
	createCategory: (input: CreateCategoryInput) => Promise<void>
	deletePage: (ref: string) => Promise<boolean>
	deleteCategory: (ref: string) => Promise<void>
	configureField: (path: string, patch: Record<string, unknown>) => Promise<void>
	configureResource: (resource: string, routes: string[]) => Promise<void>
	removeField: (path: string) => Promise<void>
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
/** The timers and counters the builder shares across its calls, which are module-wide on purpose. */
export const sessionState: {
	previewTimer: ReturnType<typeof setTimeout> | undefined
	editGroup: string | null
	lastStep: { group: string | null; at: number }
	toastTimer: ReturnType<typeof setTimeout> | undefined
	previewToken: number
} = {
	previewTimer: undefined,
	editGroup: null,
	lastStep: { group: null, at: 0 },
	toastTimer: undefined,
	previewToken: 0,
}

/** What every part of the builder shares: the session state and the API it talks to. */
export interface SessionCore {
	session: ReturnType<typeof useDmsState<BuilderSession>>
	api: ReturnType<typeof useBuilderApi>
}

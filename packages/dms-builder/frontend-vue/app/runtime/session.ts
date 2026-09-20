import { computed, type ComputedRef, type Ref } from 'vue'
import { useDmsState as useState } from '#dms/frontend-module'
import { useBuilderApi } from './api'
import {
	descriptorOf,
	missingSettings,
	newBlockDraft,
	slotIdFor,
	slotsOf,
	suggestedName,
	type MissingSetting,
} from './catalog'
import {
	HISTORY_LIMIT,
	PREVIEW_DEBOUNCE_MS,
	SESSION_STATE_KEY,
	TOAST_MS,
} from './constants'
import {
	draggedType,
	refusalForDrop,
	sameTarget,
	targetAtBlock,
	targetAtPage,
	wrapperFor,
	type DragPayload,
	type DropPlacement,
	type DropTarget,
	type DropWrap,
	type PointerBox,
} from './dropping'
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
	PageStructure,
	PageSummary,
	PreviewState,
	QueryPreview,
	QueryTemplateDescriptor,
	ResourceStructure,
	ResourceSummary,
	ValidationIssue,
} from './types'

export type RailView =
	| 'pages'
	| 'library'
	| 'config'
	| 'page'
	| 'json'
	| 'resource'
	| 'query'

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
	view: RailView
	railOpen: boolean
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
	/** An open block menu, positioned where it was summoned. */
	menu: { path: string; x: number; y: number } | null
	/** Keys of the write-through operations in flight, e.g. `product#price`. */
	pending: string[]
	toast: string | null
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
		view: 'library',
		railOpen: true,
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
		menu: null,
		pending: [],
		toast: null,
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
	reload: () => Promise<void>
	followRoute: (path: string) => void
	resolvePending: (keep: boolean) => Promise<void>
	select: (path: string | null, view?: RailView) => void
	back: () => void
	openRegion: (path: string, slot: string) => void
	openMenu: (path: string, x: number, y: number) => void
	closeMenu: () => void
	setView: (view: RailView) => void
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
	notify: (message: string) => void
	loadResourceFields: (ref: string) => Promise<void>
	loadResource: (ref: string, force?: boolean) => Promise<void>
	loadQueryTemplates: () => Promise<void>
	createResource: (name: string, fields: FieldSpec[]) => Promise<void>
	deleteResource: (ref: string) => Promise<void>
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
	deletePage: (ref: string) => Promise<void>
	deleteCategory: (ref: string) => Promise<void>
	configureField: (path: string, patch: Record<string, unknown>) => Promise<void>
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
		session.value.draft ? countBlocks(session.value.draft) : 0,
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

	function notify(message: string): void {
		session.value.toast = message
		clearTimeout(toastTimer)
		toastTimer = setTimeout(() => {
			session.value.toast = null
		}, TOAST_MS)
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

	async function reload(): Promise<void> {
		if (!session.value.pageRef) {
			return
		}
		session.value.loading = true
		if (await loadStructure(session.value.pageRef)) {
			await refreshPreview()
		}
		session.value.loading = false
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
		pushHistory()
		session.value.draft = next
		schedulePreview()
		return true
	}

	function select(path: string | null, view: RailView = 'config'): void {
		session.value.selection = path
		session.value.view = path ? view : 'library'
		session.value.railOpen = true
	}

	function setView(view: RailView): void {
		session.value.view = view
		session.value.railOpen = true
		session.value.menu = null
	}

	// The rail is reached through what you are doing, not through a tab strip:
	// these views are opened from somewhere and hand control back to it.
	const SUB_VIEWS = new Set<RailView>(['resource', 'query', 'json', 'pages'])

	function back(): void {
		if (!SUB_VIEWS.has(session.value.view)) {
			return
		}
		setView(session.value.selection ? 'config' : 'library')
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
		// The tab on screen is the one the author is dropping into; the first is
		// only the answer when nothing has been opened yet.
		const open = session.value.openRegions[parent ?? '']
		const shown = slots.find((slot) => slot.id === open)
		node.slot = (shown ?? slots[0] ?? openSlot(container, dynamic)).id
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
		const rank = existing.length + 1
		const type = container.type ?? 'slot'
		const title = `${type} ${rank}`
		const taken = new Set(
			existing
				.map((entry) => (entry as Record<string, unknown>)?.[dynamic.idKey])
				.filter((id): id is string => typeof id === 'string'),
		)
		const entry: Record<string, unknown> = {
			[dynamic.idKey]: slotIdFor(
				undefined,
				`${suggestedName(type)}${rank}`,
				taken,
			),
		}
		if (dynamic.labelKey) {
			entry[dynamic.labelKey] = title
		}
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
		const stacked = wrap ? stackAround(draft, wrap) : undefined
		if (stacked) {
			return stacked
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
		let created: string | undefined
		mutate((draft) => {
			const host = hostFor(draft, { parent, index }, type, wrap)
			const node = newBlockDraft(descriptor)
			adoptSlot(draft, host.parent, node)
			created = insertNode(draft, host.parent, host.index, node)
		})
		if (created) {
			select(created)
			notify(`${descriptor.label ?? descriptor.type} added`)
		}
	}

	function remove(path: string): void {
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
		notify('Block removed')
	}

	function duplicate(path: string): void {
		let created: string | undefined
		mutate((draft) => {
			created = duplicateNode(draft, path)
		})
		if (created) {
			select(created)
			notify('Block duplicated')
		}
	}

	function rename(path: string, name: string): void {
		let renamed: string | undefined
		mutate((draft) => {
			renamed = renameNode(draft, path, name)
		})
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
		select(moved)
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
	 * engine the page serves nothing else.
	 */
	function draftQueries(draft: PageDraft): AddQueryInput[] {
		if (draft.queries) {
			return draft.queries
		}
		return (session.value.structure?.queries ?? [])
			.filter((query) => !query.opaque && query.resource && query.template)
			.map((query) => ({
				name: query.name,
				resource: query.resource as string,
				template: query.template as string,
				params: query.params ?? {},
				endpoint: query.endpoint,
			}))
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
		if (session.value.view === 'config') {
			session.value.view = 'library'
		}
	}

	function undo(): void {
		const previous = session.value.history.at(-1)
		if (!previous || !session.value.draft) {
			return
		}
		session.value.future = [cloneDraft(session.value.draft), ...session.value.future]
		session.value.history = session.value.history.slice(0, -1)
		session.value.draft = previous
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
		session.value.view = 'library'
		session.value.error = null
		schedulePreview()
		notify('Changes discarded')
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
				return
			}
			session.value.version = result.data.version
			session.value.changes = result.changes
			session.value.baseline = cloneDraft(draft)
			session.value.history = []
			session.value.future = []
			notify('Page saved')
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
		if (!result.ok) {
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
		session.value.queryTemplates = await api.queryTemplates()
	}

	function report(error: BuilderError | null, message: string): boolean {
		if (error) {
			session.value.error = error
			return false
		}
		notify(message)
		return true
	}

	/**
	 * Resource and query writes touch files the page only references, so they
	 * are applied straight away rather than staged in the draft.
	 */
	/** The pages and categories the builder can create alongside, and navigate to. */
	async function loadSiteTree(): Promise<void> {
		const [pages, categories] = await Promise.all([
			api.pages(),
			api.categories(),
		])
		session.value.pages = pages
		session.value.categories = categories
	}

	/**
	 * Creating a page writes its file and wires the barrel; the DMS picks it up
	 * on reload. The caller navigates to the returned ref, and the builder
	 * follows the route onto the new page.
	 */
	async function createPage(input: CreatePageInput): Promise<string | undefined> {
		const result = await api.createPage(input)
		if (!report(result.ok ? null : result.error, `Page ${input.name} created`)) {
			return undefined
		}
		await loadSiteTree()
		return result.ok ? result.data.ref : undefined
	}

	async function createCategory(input: CreateCategoryInput): Promise<void> {
		const result = await api.createCategory(input)
		if (
			!report(result.ok ? null : result.error, `Category ${input.name} created`)
		) {
			return
		}
		await loadSiteTree()
	}

	async function deletePage(ref: string): Promise<void> {
		const result = await api.deletePage(ref)
		if (!report(result.ok ? null : result.error, 'Page deleted')) {
			return
		}
		await loadSiteTree()
	}

	async function deleteCategory(ref: string): Promise<void> {
		const result = await api.deleteCategory(ref)
		if (!report(result.ok ? null : result.error, 'Category deleted')) {
			return
		}
		await loadSiteTree()
	}

	async function createResource(
		name: string,
		fields: FieldSpec[],
	): Promise<void> {
		const result = await api.createResource({ name, fields })
		if (!report(result.ok ? null : result.error, `Resource ${name} created`)) {
			return
		}
		session.value.resources = await api.resources()
		// The engine derives the ref from the name; reloading under what the
		// user typed misses whenever the two differ, and the panel then shows an
		// empty resource after a create that worked.
		await loadResource(result.ok ? result.data.ref : name, true)
	}

	async function deleteResource(ref: string): Promise<void> {
		const result = await api.deleteResource(ref)
		if (!report(result.ok ? null : result.error, 'Resource deleted')) {
			return
		}
		session.value.resources = await api.resources()
	}

	async function addField(resource: string, field: FieldSpec): Promise<void> {
		const result = await api.addField(resource, field)
		if (!report(result.ok ? null : result.error, `Field ${field.name} added`)) {
			return
		}
		await loadResource(resource, true)
	}

	async function configureCategory(
		category: string,
		patch: Record<string, unknown>,
	): Promise<void> {
		const result = await api.configureCategory(category, patch)
		if (!report(result.ok ? null : result.error, 'Category updated')) {
			return
		}
		await loadSiteTree()
	}

	async function configureQuery(
		query: string,
		patch: Record<string, unknown>,
	): Promise<void> {
		const result = await api.configureQuery(query, patch)
		if (!report(result.ok ? null : result.error, 'Query updated')) {
			return
		}
		await reload()
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
		if (!report(result.ok ? null : result.error, 'Page updated')) {
			return
		}
		await reload()
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
			if (!report(result.ok ? null : result.error, 'Page moved')) {
				return undefined
			}
			await loadSiteTree()
			return result.ok ? result.data.ref : undefined
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
			report(result.ok ? null : result.error, 'Resource updated')
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
			if (!report(result.ok ? null : result.error, 'Field updated')) {
				// The optimistic value was a guess; the resource says otherwise.
				await loadResource(resource ?? '', true)
				return
			}
			await loadResource(resource ?? '', true)
		} finally {
			endPending(path)
		}
	}

	async function removeField(path: string): Promise<void> {
		const result = await api.removeField(path)
		if (!report(result.ok ? null : result.error, 'Field removed')) {
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
		if (!report(result.ok ? null : result.error, `Query ${input.name} added`)) {
			return
		}
		await reload()
	}

	async function removeQuery(ref: string): Promise<void> {
		const result = await api.removeQuery(ref)
		if (!report(result.ok ? null : result.error, 'Query removed')) {
			return
		}
		await reload()
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
		select,
		setView,
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
		configureResource,
		removeField,
		addQuery,
		removeQuery,
		beginDrag,
		endDrag,
		aimAt,
		aimAtPage,
		drop,
		dropAt,
		hover,
		refusalAt,
	}
}

export { joinPath, parentPath, leafName }

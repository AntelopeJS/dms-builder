import { computed, type ComputedRef, type Ref } from 'vue'
import { useDmsState as useState } from '#dms/frontend-module'
import { useBuilderApi } from './api'
import { descriptorOf, missingConfig, newBlockDraft } from './catalog'
import {
	HISTORY_LIMIT,
	PREVIEW_DEBOUNCE_MS,
	SESSION_STATE_KEY,
	TOAST_MS,
} from './constants'
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
	parentPath,
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
	FieldSpec,
	PageStructure,
	PageSummary,
	QueryPreview,
	QueryTemplateDescriptor,
	ResourceStructure,
	ResourceSummary,
} from './types'

export type RailView =
	| 'pages'
	| 'library'
	| 'config'
	| 'page'
	| 'json'
	| 'resource'
	| 'query'

/** What a drag currently carries: a new block type, or a block being moved. */
export interface DragPayload {
	type?: string
	path?: string
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
	hovered: string | null
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
		hovered: null,
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
	open: (pageRef: string) => Promise<void>
	close: () => void
	reload: () => Promise<void>
	followRoute: (path: string) => void
	resolvePending: (keep: boolean) => Promise<void>
	select: (path: string | null, view?: RailView) => void
	back: () => void
	openMenu: (path: string, x: number, y: number) => void
	closeMenu: () => void
	setView: (view: RailView) => void
	mutate: (apply: (draft: PageDraft) => void) => void
	addBlock: (type: string, parent?: string | null, index?: number | null) => void
	remove: (path: string) => void
	duplicate: (path: string) => void
	rename: (path: string, name: string) => void
	move: (path: string, parent: string | null, index: number) => void
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
	dropAt: (parent: string | null, index: number) => void
	hover: (path: string | null) => void
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
	const problems = computed(() => {
		const draft = session.value.draft
		if (!draft) {
			return []
		}
		const paths: string[] = []
		walkDraft(draft.blocks, (block, path) => {
			const descriptor = descriptorOf(session.value.catalog, block.type)
			if (missingConfig(descriptor, block).length > 0) {
				paths.push(path)
			}
		})
		return paths
	})
	const selected = computed(() =>
		session.value.draft && session.value.selection
			? findNode(session.value.draft, session.value.selection)
			: undefined,
	)
	const selectedDescriptor = computed(() =>
		descriptorOf(session.value.catalog, selected.value?.type),
	)

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
		if (token !== previewToken || !result.ok) {
			return
		}
		session.value.preview = result.data.components
		session.value.degraded = result.data.degraded
	}

	function schedulePreview(): void {
		clearTimeout(previewTimer)
		previewTimer = setTimeout(() => {
			// Caught rather than left to become an unhandled rejection: one of
			// those aborts Vue's update, and the panel that triggered the preview
			// then shows stale values with no way to correct them.
			refreshPreview().catch((error: unknown) => {
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

	function mutate(apply: (draft: PageDraft) => void): void {
		if (!session.value.draft) {
			return
		}
		pushHistory()
		const next = cloneDraft(session.value.draft)
		apply(next)
		session.value.draft = next
		schedulePreview()
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

	function openMenu(path: string, x: number, y: number): void {
		select(path)
		session.value.menu = { path, x, y }
	}

	function closeMenu(): void {
		session.value.menu = null
	}

	function addBlock(
		type: string,
		parent: string | null = null,
		index: number | null = null,
	): void {
		const descriptor = descriptorOf(session.value.catalog, type)
		if (!descriptor) {
			return
		}
		let created: string | undefined
		mutate((draft) => {
			created = insertNode(draft, parent, index, newBlockDraft(descriptor))
		})
		if (created) {
			select(created)
			notify(`${descriptor.label ?? descriptor.type} added`)
		}
	}

	function remove(path: string): void {
		mutate((draft) => {
			removeNode(draft, path)
		})
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

	function move(path: string, parent: string | null, index: number): void {
		let moved: string | undefined
		mutate((draft) => {
			moved = moveNode(draft, path, parent, index)
		})
		if (moved) {
			select(moved)
		}
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

	function undo(): void {
		const previous = session.value.history.at(-1)
		if (!previous || !session.value.draft) {
			return
		}
		session.value.future = [cloneDraft(session.value.draft), ...session.value.future]
		session.value.history = session.value.history.slice(0, -1)
		session.value.draft = previous
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
	}

	function endDrag(): void {
		session.value.dragging = null
	}

	function hover(path: string | null): void {
		session.value.hovered = path
	}

	/** Resolve a drop: a palette drag inserts, a block drag moves. */
	function dropAt(parent: string | null, index: number): void {
		const payload = session.value.dragging
		session.value.dragging = null
		if (!payload) {
			return
		}
		if (payload.path) {
			move(payload.path, parent, index)
			return
		}
		if (payload.type) {
			addBlock(payload.type, parent, index)
		}
	}

	return {
		session,
		dirty,
		blockCount,
		problems,
		selected,
		selectedDescriptor,
		open,
		close,
		reload,
		followRoute,
		resolvePending,
		select,
		setView,
		back,
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
		dropAt,
		hover,
	}
}

export { joinPath, parentPath, leafName }

import { PREVIEW_DEBOUNCE_MS } from './constants'
import { draftPermission, rolesDecide } from './access'
import { cloneDraft, structureToDraft } from './draft'
import { sessionState, type SessionCore } from './session-model'
import type { createDerived } from './session-derived'

export function createLoaders(scope: SessionCore & ReturnType<typeof createDerived>) {
	const { session, api, viewedAs, newStep, unread } = scope

	/**
	 * Who reaches the page, read in the background: it only ever adds to what
	 * the editor says, so a failure leaves it unsaid. The permission the draft
	 * gives the page is asked about too, for the roles holding it.
	 */
	async function loadAccess(): Promise<void> {
		const pageRef = session.value.pageRef
		if (!pageRef) {
			return
		}
		const staged = session.value.access
			? draftPermission(session.value.access, session.value.draft?.page)
			: undefined
		try {
			const access = await api.pageAccess(
				pageRef,
				staged && staged !== session.value.access?.permission ? staged : undefined,
			)
			// Only for the page still open.
			if (session.value.pageRef === pageRef) {
				session.value.access = access
				if (!rolesDecide(session.value.access) || !viewedAs.value) {
					session.value.viewAs = null
				}
			}
		} catch {
			// A DMS that did not answer: nothing is said.
		}
	}

	async function refreshPreview(): Promise<void> {
		const { pageRef, draft } = session.value
		if (!pageRef || !draft) {
			return
		}
		const token = ++sessionState.previewToken
		const result = await api.preview(pageRef, draft)
		// A slower preview must not overwrite the answer to a later edit.
		if (token !== sessionState.previewToken) {
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
		clearTimeout(sessionState.previewTimer)
		session.value.previewState = 'pending'
		sessionState.previewTimer = setTimeout(() => {
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
			session.value.served = payload.components
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
		newStep()
		session.value.dirtySince = null
		session.value.conflict = false
		session.value.error = null
		session.value.previewState = 'pending'
		session.value.previewIssues = []
		return true
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
			const templates = await api.queryTemplates()
			session.value.queryTemplates = templates
		} catch (error) {
			unread('The query templates', error)
		}
	}

	/**
	 * What each table reaches and holds. Read in the background, and left as it
	 * was when it cannot be: it only ever adds to what the panels say.
	 */
	async function loadTableUsage(): Promise<void> {
		try {
			session.value.tableUsage = await api.tableUsage()
		} catch {
			// A module that failed: the scope goes unsaid.
		}
	}

	/** Read the tables again, keeping the list already shown when that fails. */
	async function loadResources(): Promise<void> {
		try {
			session.value.resources = await api.resources()
		} catch (error) {
			unread('The tables', error)
		}
		void loadTableUsage()
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
	return {
		loadAccess,
		refreshPreview,
		schedulePreview,
		loadServedLayout,
		loadStructure,
		loadResourceFields,
		loadResource,
		loadQueryTemplates,
		loadTableUsage,
		loadResources,
		loadSiteTree,
	}
}

import { forgetDraft } from './draft-store'
import { byCategoryOrder } from './categories'
import type { CreateCategoryInput, CreatePageInput, FieldSpec } from './types'
import {
	sessionState,
	type PageLayout,
	type SessionCore,
} from './session-model'
import type { createDerived } from './session-derived'
import type { createLifecycle } from './session-lifecycle'
import type { createLoaders } from './session-loaders'

export function createSite(scope: SessionCore & ReturnType<typeof createDerived> & ReturnType<typeof createLifecycle> & ReturnType<typeof createLoaders>) {
	const { session, api, dirty, pageName, categoryName, startPending, endPending, applyLocally, refresh, report, loadResource, loadResources, loadSiteTree } = scope

	/**
	 * Creating a page writes its file and wires the barrel; the DMS picks it up
	 * on reload. The caller navigates to the returned ref, and the builder
	 * follows the route onto the new page.
	 */
	async function createPage(
		input: CreatePageInput,
		layout?: PageLayout,
	): Promise<string | undefined> {
		const result = await api.createPage(input)
		if (!report(result, `Page ${input.displayName} created`, {
				title: `Created the page ${input.displayName}`,
				scope: 'menu',
			})) {
			return undefined
		}
		await loadSiteTree()
		if (!result.ok) {
			return undefined
		}
		if (layout) {
			session.value.startLayout = { ref: result.data.ref, layout }
		}
		return result.data.ref
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
		// A draft kept for a page that is gone has nothing to come back to.
		forgetDraft(ref)
		if (session.value.pageRef === ref) {
			// The draft edits a file that is gone. Kept, it would offer a Save
			// that has nothing to write to, and stop the move off the page to
			// ask about changes nobody can keep.
			clearTimeout(sessionState.previewTimer)
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

	/**
	 * Put a category one place earlier or later among its siblings. The menu
	 * reads places as numbers, so every sibling is numbered again in its new
	 * place, and only those whose number changes are written — one after the
	 * other, each a file of its own.
	 */
	async function moveCategory(ref: string, delta: -1 | 1): Promise<void> {
		const category = session.value.categories.find((entry) => entry.ref === ref)
		if (!category || session.value.pending.includes(ref)) {
			return
		}
		const siblings = session.value.categories
			.filter((entry) => (entry.parent ?? undefined) === (category.parent ?? undefined))
			.sort(byCategoryOrder)
		const at = siblings.findIndex((entry) => entry.ref === ref)
		const to = at + delta
		if (at === -1 || to < 0 || to >= siblings.length) {
			return
		}
		const reordered = [...siblings]
		reordered.splice(at, 1)
		reordered.splice(to, 0, category)
		startPending(ref)
		try {
			for (const [index, entry] of reordered.entries()) {
				const order = index + 1
				if (entry.order === order) {
					continue
				}
				const result = await api.configureCategory(entry.ref, { order })
				if (!report(result, 'Menu reordered')) {
					break
				}
			}
			session.value.applied = [
				...session.value.applied,
				{
					id: session.value.applied.length + 1,
					at: Date.now(),
					title: `Moved the category ${category.displayName} ${delta < 0 ? 'up' : 'down'}`,
					scope: 'menu',
				},
			]
			await loadSiteTree()
		} finally {
			endPending(ref)
		}
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
	return {
		createPage,
		createCategory,
		deletePage,
		deleteCategory,
		createResource,
		deleteResource,
		addField,
		configureCategory,
		moveCategory,
		movePage,
		configureResource,
		configureField,
		removeField,
	}
}

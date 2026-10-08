import { ref } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { useBuilderApi } from './api'
import { openWhenServed } from './dev-reload'
import { useBuilder } from './session'
import type { PageImpact, PageSummary } from './types'

/**
 * Deleting a page: asked first, and moved off once done.
 *
 * Deleting removes the page and the routes it declares, and nothing in the
 * builder brings them back: a single click on a trash icon is too little for a
 * write that cannot be undone.
 */
export function usePageDelete() {
	const builder = useBuilder()
	const session = builder.session
	const router = useRouter()
	// Auto-imported from the host's own layers, like every composable the loader
	// scans; neither is part of the frontend-module SDK.
	const devReload = useDevReload()
	const { confirm } = useConfirm()
	const api = useBuilderApi()

	/**
	 * What goes with the page and what is left pointing at it, in a sentence
	 * each — or nothing, when the module cannot say.
	 */
	async function impactOf(ref: string): Promise<string[]> {
		let impact: PageImpact | undefined
		try {
			impact = await api.pageImpact(ref)
		} catch {
			return []
		}
		if (typeof impact?.blocks !== 'number' || !Array.isArray(impact.linkedFrom)) {
			return []
		}
		const sources = impact.queries?.length ?? 0
		const lines = [
			`Its ${impact.blocks} block${impact.blocks === 1 ? '' : 's'}${
				sources ? ` and ${sources} data source${sources === 1 ? '' : 's'}` : ''
			} go with it.`,
		]
		if (impact.linkedFrom.length) {
			const names = impact.linkedFrom.map((page) => page.displayName).join(', ')
			lines.push(`${names} still link${impact.linkedFrom.length === 1 ? 's' : ''} to it: those links will lead nowhere.`)
		}
		return lines
	}

	/** The page being deleted, while the write is under way. */
	const deleting = ref<string | null>(null)

	async function deletePage(
		page: Pick<PageSummary, 'ref' | 'displayName' | 'category'>,
	): Promise<void> {
		if (deleting.value) {
			return
		}
		const open = session.value.pageRef === page.ref
		const impact = await impactOf(page.ref)
		const asked = await confirm({
			title: `Delete ${page.displayName}?`,
			description: [
				'The page leaves the project, with the routes it declares and the queries only it reads.',
				...impact,
				open && builder.dirty.value ? 'Its unsaved changes go with it.' : '',
				'The builder cannot undo this.',
			]
				.filter(Boolean)
				.join(' '),
			confirmLabel: 'Delete the page',
			cancelLabel: 'Keep it',
			color: 'error',
		})
		if (!asked) {
			return
		}
		deleting.value = page.ref
		try {
			if ((await builder.deletePage(page.ref)) && open) {
				await leave(page.category)
			}
		} finally {
			deleting.value = null
		}
	}

	/**
	 * The route the editor was on is gone, and the DMS renders it bare: move to a
	 * page of the same category, else to any page — else there is nothing left to
	 * edit, and the editor closes.
	 */
	async function leave(category: string): Promise<void> {
		const pages = session.value.pages
		const next = pages.find((entry) => entry.category === category) ?? pages[0]
		if (!next) {
			builder.close()
			await router.push('/')
			return
		}
		await openWhenServed(
			{
				devReload,
				router,
				onWaitFailure: (failure) => {
					session.value.error = failure
				},
			},
			next.ref,
		)
	}

	return { deleting, deletePage }
}

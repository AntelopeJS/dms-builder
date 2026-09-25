import { ref } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { openWhenServed } from './dev-reload'
import { useBuilder } from './session'
import type { PageSummary } from './types'

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
	const devReload = useDmsDevReload()
	const { confirm } = useConfirm()

	/** The page being deleted, while the write is under way. */
	const deleting = ref<string | null>(null)

	async function deletePage(
		page: Pick<PageSummary, 'ref' | 'displayName' | 'category'>,
	): Promise<void> {
		if (deleting.value) {
			return
		}
		const open = session.value.pageRef === page.ref
		const asked = await confirm({
			title: `Delete ${page.displayName}?`,
			description: [
				'The page leaves the project, with the routes it declares and the queries only it reads.',
				open && builder.dirty.value ? 'Its unsaved changes go with it.' : '',
				'The builder cannot undo this.',
			]
				.filter(Boolean)
				.join(' '),
			confirmLabel: 'Delete the page',
			cancelLabel: 'Keep it',
			confirmColor: 'error',
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

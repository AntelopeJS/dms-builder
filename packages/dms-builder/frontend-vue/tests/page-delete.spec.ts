import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PageDelete from '../app/components/PageDelete.vue'
import PagesPanel from '../app/components/PagesPanel.vue'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { PageSummary } from '../app/runtime/types'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	findAll,
	fire,
	installDocumentStub,
	mount,
	textOf,
	type TestNode,
} from './support/render'
import { pushedRoutes } from './stubs/frontend-module'

/**
 * Deleting a page removes its file for good, so it is asked first; and the
 * page the editor was open on is gone once it is, so the editor moves off it
 * rather than holding a draft of a file that no longer exists.
 */

let backend: FakeBackend
let builder: BuilderController

installDocumentStub()
Object.assign(globalThis, {
	resolveDmsComponent: () => undefined,
	// The host's wait for a route to be served, which here it is at once.
	useDmsDevReload: () => ({ awaitRoute: () => Promise.resolve(true) }),
})

function summary(ref: string, category: string): PageSummary {
	const id = ref.split('/').pop() ?? ref
	return {
		ref,
		id,
		displayName: id.charAt(0).toUpperCase() + id.slice(1),
		category,
		filepath: `pages/${id}.ts`,
	}
}

// The page the harness opens the editor on, and two others.
const SALES = summary('/reports/sales', 'reports')
const TOTALS = summary('/reports/totals', 'reports')
const ORDERS = summary('/shop/orders', 'shop')

const PAGES = 'GET /api/builder/pages'

function trash(root: TestNode, name: string): TestNode {
	const [button] = findAll(
		root,
		(node) =>
			node.tag === 'UButton' && node.props['aria-label'] === `Delete ${name}`,
	)
	if (!button) {
		throw new Error(`no trash beside ${name}`)
	}
	return button
}

function confirmation(root: TestNode): TestNode {
	const [button] = findAll(
		root,
		(node) => node.tag === 'UButton' && node.props.label === 'Delete the page',
	)
	if (!button) {
		throw new Error('no confirmation offered')
	}
	return button
}

function deletions(): Array<Record<string, string> | undefined> {
	return backend.calls
		.filter((call) => call.method === 'DELETE')
		.map((call) => call.query)
}

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(200)
	await nextTick()
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	backend.answers[PAGES] = [SALES, TOTALS, ORDERS]
	backend.answers['GET /api/builder/categories'] = [
		{ ref: 'reports', displayName: 'Reports' },
		{ ref: 'shop', displayName: 'Shop' },
	]
	builder = useBuilder()
	builder.close()
	pushedRoutes.length = 0
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

describe('deleting a page from the pages panel', () => {
	it('asks first, and deletes only once asked twice', async () => {
		await builder.open(SALES.ref)
		const { root } = mount(PagesPanel, {
			components: { DmsBuilderPageDelete: PageDelete },
		})
		await settle()

		fire(trash(root, 'Totals'), 'click')
		await nextTick()
		expect(deletions(), 'the trash only asks').toEqual([])
		expect(textOf(root)).toContain('Delete Totals?')

		fire(confirmation(root), 'click')
		await settle()
		expect(deletions()).toEqual([{ ref: TOTALS.ref }])
		expect(pushedRoutes, 'another page than the open one').toEqual([])
		expect(builder.session.value.draft).not.toBeNull()
	})

	it('deletes nothing when the question is turned down', async () => {
		await builder.open(SALES.ref)
		const { root } = mount(PagesPanel, {
			components: { DmsBuilderPageDelete: PageDelete },
		})
		await settle()

		fire(trash(root, 'Totals'), 'click')
		await nextTick()
		const [keep] = findAll(
			root,
			(node) => node.tag === 'UButton' && node.props.label === 'Keep it',
		)
		fire(keep as TestNode, 'click')
		await settle()

		expect(deletions()).toEqual([])
		expect(textOf(root)).not.toContain('Delete Totals?')
	})
})

describe('deleting the page the editor is open on', () => {
	it('moves to a page of the same category, dropping the draft', async () => {
		await builder.open(SALES.ref)
		builder.addBlock('Text')
		const { root } = mount(PageDelete, { props: { page: SALES } })
		await nextTick()
		expect(textOf(root)).toContain('Its unsaved changes go with it.')

		backend.answers[PAGES] = [ORDERS, TOTALS]
		fire(confirmation(root), 'click')
		await settle()

		expect(pushedRoutes).toEqual([TOTALS.ref])
		expect(builder.session.value.draft).toBeNull()
		expect(builder.dirty.value, 'nothing left to ask about').toBe(false)
	})

	it('closes the editor once no page is left', async () => {
		await builder.open(SALES.ref)
		const { root } = mount(PageDelete, { props: { page: SALES } })

		backend.answers[PAGES] = []
		fire(confirmation(root), 'click')
		await settle()

		expect(pushedRoutes).toEqual(['/'])
		expect(builder.session.value.active).toBe(false)
	})

	it('stays where it is when the module refuses', async () => {
		await builder.open(SALES.ref)
		const { root } = mount(PageDelete, { props: { page: SALES } })

		backend.answers['DELETE /api/builder/page'] = {
			ok: false,
			error: { code: 'typecheck_failed', diagnostics: [] },
		}
		fire(confirmation(root), 'click')
		await settle()

		expect(pushedRoutes).toEqual([])
		expect(builder.session.value.draft).not.toBeNull()
		expect(builder.session.value.error?.code).toBe('typecheck_failed')
	})
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import PagePanel from '../app/components/PagePanel.vue'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { PageSummary } from '../app/runtime/types'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	findAll,
	fire,
	installDocumentStub,
	mount,
	stub,
	type TestNode,
} from './support/render'
import { pushedRoutes } from './stubs/frontend-module'

/**
 * Deleting a page removes its file for good, so it is asked first; and the
 * page the editor was open on is gone once it is, so the editor moves off it
 * rather than holding a draft of a file that no longer exists.
 *
 * The pages panel offers the same deletion beside each page of its tree; its
 * own spec covers that way in.
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

const parts = (): Record<string, Component> => ({
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
	UInputNumber: stub('UInputNumber'),
})

/** The page's own settings, on the page the editor is open on. */
async function settings(): Promise<TestNode> {
	await builder.open(SALES.ref)
	const { root } = mount(PagePanel, { components: parts() })
	await nextTick()
	return root
}

function deleteButton(root: TestNode): TestNode {
	const [button] = findAll(
		root,
		(node) => node.tag === 'UButton' && node.props.label === 'Delete the page',
	)
	if (!button) {
		throw new Error('no deletion offered')
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

describe('deleting the page the editor is open on', () => {
	it('moves to a page of the same category, dropping the draft', async () => {
		const root = await settings()
		builder.addBlock('Text')

		backend.answers[PAGES] = [ORDERS, TOTALS]
		fire(deleteButton(root), 'click')
		await settle()

		expect(backend.confirms).toEqual([
			expect.objectContaining({ title: 'Delete Sales?', confirmColor: 'error' }),
		])
		expect(backend.confirms[0]?.description).toContain(
			'Its unsaved changes go with it.',
		)
		expect(deletions()).toEqual([{ ref: SALES.ref }])
		expect(pushedRoutes).toEqual([TOTALS.ref])
		expect(builder.session.value.draft).toBeNull()
		expect(builder.dirty.value, 'nothing left to ask about').toBe(false)
	})

	it('deletes nothing when the question is turned down', async () => {
		const root = await settings()
		backend.confirmAnswer = false

		fire(deleteButton(root), 'click')
		await settle()

		expect(backend.confirms).toHaveLength(1)
		expect(deletions()).toEqual([])
		expect(pushedRoutes).toEqual([])
		expect(builder.session.value.draft).not.toBeNull()
	})

	it('closes the editor once no page is left', async () => {
		const root = await settings()

		backend.answers[PAGES] = []
		fire(deleteButton(root), 'click')
		await settle()

		expect(pushedRoutes).toEqual(['/'])
		expect(builder.session.value.active).toBe(false)
	})

	it('stays where it is when the module refuses', async () => {
		const root = await settings()

		backend.answers['DELETE /api/builder/page'] = {
			ok: false,
			error: { code: 'typecheck_failed', diagnostics: [] },
		}
		fire(deleteButton(root), 'click')
		await settle()

		expect(pushedRoutes).toEqual([])
		expect(builder.session.value.draft).not.toBeNull()
		expect(builder.session.value.error?.code).toBe('typecheck_failed')
	})
})

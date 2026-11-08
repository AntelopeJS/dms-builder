import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { byCategoryOrder } from '../app/runtime/categories'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { installDocumentStub } from './support/render'

/**
 * The menu arrows show the new order at once, while each place is still being
 * written, and put the menu back when a write fails.
 */

let backend: FakeBackend
let builder: BuilderController

installDocumentStub()
Object.assign(globalThis, {
	resolveDmsComponent: () => undefined,
	useDevReload: () => ({ awaitRoute: () => Promise.resolve(true) }),
})

function menu(): string[] {
	return [...builder.session.value.categories]
		.sort(byCategoryOrder)
		.map((entry) => entry.displayName)
}

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(200)
	await nextTick()
}

beforeEach(async () => {
	vi.useFakeTimers()
	backend = installFakeHost()
	backend.answers['GET /api/builder/categories'] = [
		{ ref: 'alpha', displayName: 'Alpha', order: 1 },
		{ ref: 'beta', displayName: 'Beta', order: 2 },
	]
	builder = useBuilder()
	builder.close()
	await builder.open('/reports/sales')
	await builder.loadSiteTree()
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

describe('the menu arrows', () => {
	it('list the moved category in its new place before its write answers', async () => {
		backend.answers['PUT /api/builder/category'] = new Promise(() => undefined)

		void builder.moveCategory('beta', -1)
		await settle()

		expect(menu()).toEqual(['Beta', 'Alpha'])
	})

	it('put the menu back when a write fails and the tree cannot be read again', async () => {
		backend.answers['PUT /api/builder/category'] = {
			ok: false,
			error: { code: 'not_found', ref: 'beta' },
		}
		backend.answers['GET /api/builder/categories'] = new Error('backend down')

		await builder.moveCategory('beta', -1)
		await settle()

		expect(menu()).toEqual(['Alpha', 'Beta'])
	})
})

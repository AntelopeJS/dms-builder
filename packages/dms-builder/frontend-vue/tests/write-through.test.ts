import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { useBuilder, type BuilderController } from '../app/runtime/session'

/**
 * What the settings written straight to the page's files do to the draft the
 * editor is holding, and what a request that gets no answer at all says.
 *
 * A page's category does not wait for Save. That write used to read the page
 * again from scratch, which threw every unsaved edit away with no undo to get
 * it back.
 */

let backend: FakeBackend
let builder: BuilderController

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(200)
}

function names(): string[] {
	return (builder.session.value.draft?.blocks ?? []).map((block) => block.name)
}

/** An answer that never comes: the request itself fails. */
function failing(message: string): PromiseLike<never> {
	return {
		then: (_resolve, reject) => {
			reject?.(new Error(message))
			return undefined as never
		},
	}
}

beforeEach(async () => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
	await builder.open('/reports/sales')
	await settle()
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

describe('moving a page with unsaved changes', () => {
	beforeEach(() => {
		backend.answers['POST /api/builder/page/configure'] = {
			ok: true,
			data: { ref: '/sales/sales' },
			changes: [],
		}
	})

	it('keeps the unsaved draft, and its undo', async () => {
		builder.addBlock('Text')
		backend.structure = { ...backend.structure, version: 'v3' }

		await builder.movePage('sales')

		expect(names()).toEqual(['title', 'intro', 'text'])
		expect(builder.dirty.value, 'still unsaved').toBe(true)
		expect(builder.session.value.history.length).toBeGreaterThan(0)
		// The write changed the file: the next save is checked against it.
		expect(builder.session.value.version).toBe('v3')
	})

	it('takes the draft to the new address, where it saves', async () => {
		builder.addBlock('Text')
		backend.structure = {
			...backend.structure,
			page: { ...backend.structure.page, ref: '/sales/sales', category: 'sales' },
			version: 'v4',
		}

		const ref = await builder.movePage('sales')
		// The navigation to the new route that follows the move.
		builder.followRoute('/sales/sales')

		expect(ref).toBe('/sales/sales')
		expect(builder.session.value.pageRef).toBe('/sales/sales')
		expect(builder.session.value.pendingRoute, 'nothing to ask on the way').toBe(null)
		expect(names()).toContain('text')

		await builder.save()
		const saved = backend.calls.filter((call) => call.path === '/api/builder/page/blocks')
		expect(saved.at(-1)?.body).toMatchObject({
			page: '/sales/sales',
			expectedVersion: 'v4',
		})
	})
})

describe('a request that gets no answer', () => {
	it('says so when the save fails, and keeps the draft', async () => {
		builder.addBlock('Text')
		backend.answers['POST /api/builder/page/blocks'] = failing(
			'500 Internal Server Error',
		)

		await builder.save()

		expect(builder.session.value.saving).toBe(false)
		expect(builder.session.value.error).toEqual({
			code: 'unsupported',
			detail: 'The request failed: 500 Internal Server Error',
		})
		expect(builder.dirty.value).toBe(true)
	})

	it('says so when a setting written at once fails', async () => {
		backend.answers['POST /api/builder/page/configure'] = failing('Failed to fetch')

		await builder.movePage('sales')

		expect(builder.session.value.error).toMatchObject({ code: 'unsupported' })
	})

	it('does not leave the editor loading when the page cannot be read again', async () => {
		backend.answers['GET /api/builder/page'] = failing('Failed to fetch')

		await builder.reload()

		expect(builder.session.value.loading).toBe(false)
		expect(builder.session.value.error).toMatchObject({ code: 'unsupported' })
	})

	it('says so when the pages cannot be listed', async () => {
		backend.answers['GET /api/builder/pages'] = failing('Failed to fetch')

		await builder.loadSiteTree()

		expect(builder.session.value.error).toEqual({
			code: 'unsupported',
			detail: 'The pages could not be read: Failed to fetch',
		})
	})
})

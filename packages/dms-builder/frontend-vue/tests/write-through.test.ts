import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { QueryStructure } from '../app/runtime/types'

/**
 * What the settings written straight to the page's files do to the draft the
 * editor is holding, and what a request that gets no answer at all says.
 *
 * A page's position, its permission, its category and its queries do not wait
 * for Save. Each of those writes used to read the page again from scratch,
 * which threw every unsaved edit away with no undo to get it back.
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

function query(name: string, extra: Partial<QueryStructure> = {}): QueryStructure {
	return {
		name,
		endpoint: `/${name}`,
		resource: 'orders',
		template: 'count',
		params: {},
		...extra,
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

describe('a setting written at once', () => {
	it('keeps the unsaved draft, and its undo', async () => {
		builder.addBlock('Text')
		backend.structure = { ...backend.structure, version: 'v3' }

		await builder.savePageMeta({ order: 2 })

		expect(names()).toEqual(['title', 'intro', 'text'])
		expect(builder.dirty.value, 'still unsaved').toBe(true)
		expect(builder.session.value.history.length).toBeGreaterThan(0)
		// The write changed the file: the next save is checked against it.
		expect(builder.session.value.version).toBe('v3')
	})

	it('starts again from the page when nothing was left unsaved', async () => {
		backend.structure = {
			...backend.structure,
			blocks: [backend.structure.blocks[0]!],
			version: 'v3',
		}

		await builder.savePageMeta({ order: 2 })

		expect(names()).toEqual(['title'])
		expect(builder.dirty.value).toBe(false)
	})

	it('takes a query added at once into a draft that lists its own', async () => {
		builder.setDraftQuery({ name: 'refunds', resource: 'refunds', template: 'count' })
		backend.structure = { ...backend.structure, queries: [query('total')] }

		await builder.addQuery({ name: 'total', resource: 'orders', template: 'count' })

		// Sent whole with the next save, a list without it would remove it.
		expect(builder.session.value.draft?.queries?.map((entry) => entry.name)).toEqual([
			'refunds',
			'total',
		])
	})

	it('drops a query removed at once from that list', async () => {
		backend.structure = { ...backend.structure, queries: [query('total')] }
		await builder.reload()
		builder.setDraftQuery({ name: 'refunds', resource: 'refunds', template: 'count' })
		backend.structure = { ...backend.structure, queries: [] }

		await builder.removeQuery('/reports/sales@total')

		expect(builder.session.value.draft?.queries?.map((entry) => entry.name)).toEqual([
			'refunds',
		])
	})

	it('follows a renamed query under its new name', async () => {
		backend.structure = { ...backend.structure, queries: [query('total')] }
		await builder.reload()
		builder.setDraftQuery({ name: 'refunds', resource: 'refunds', template: 'count' })
		backend.structure = { ...backend.structure, queries: [query('orderCount')] }

		await builder.configureQuery('/reports/sales@total', {
			name: 'orderCount',
			resource: 'orders',
			template: 'count',
		})

		expect(builder.session.value.draft?.queries?.map((entry) => entry.name)).toEqual([
			'refunds',
			'orderCount',
		])
	})
})

describe('moving a page with unsaved changes', () => {
	beforeEach(() => {
		backend.answers['POST /api/builder/page/configure'] = {
			ok: true,
			data: { ref: '/sales/sales' },
			changes: [],
		}
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

		await builder.savePageMeta({ order: 2 })

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

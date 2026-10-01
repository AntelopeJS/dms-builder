import { describe, expect, it } from 'vitest'
import {
	savedConfigAt,
	sourceKeyOf,
	sourcePreviewUrl,
	withDraftEdits,
	withDraftSource,
} from '../app/runtime/canvas-options'
import type { BlockNode, BlockTypeDescriptor, OptionSchema } from '../app/runtime/types'

/**
 * What the canvas renders a block with, beyond what was served for it: the
 * draft as it is being edited, where the served shape could not carry it.
 */

function descriptor(config: Record<string, OptionSchema>): BlockTypeDescriptor {
	return { type: 'Test', config, shapeSource: 'test' } as BlockTypeDescriptor
}

const TABLE = descriptor({
	caption: { type: 'string', optional: true },
	enableTableExport: { type: 'boolean', default: true },
	defaultSort: { type: 'object', optional: true },
})

const CARD = descriptor({
	title: { type: 'string' },
	fetchUrl: { type: 'string', optional: true, ui: { widget: 'dataSource' } },
})

const QUERY = {
	name: 'chartCard',
	resource: 'order',
	template: 'series',
	params: { op: 'count', groupBy: 'status' },
	response: 'card' as const,
	endpoint: '/shop/board/stats/chart-card',
}

describe('a block rendered from the saved page', () => {
	const served = { location: '/api/order', columns: [], caption: 'Orders' }

	it('shows a setting typed since the page was saved', () => {
		expect(withDraftEdits(served, TABLE, { caption: 'Orders' }, { caption: 'All orders' })).toEqual({
			...served,
			caption: 'All orders',
		})
	})

	it('drops a setting emptied since, or goes back to its default', () => {
		expect(withDraftEdits(served, TABLE, { caption: 'Orders' }, {})).not.toHaveProperty('caption')
		expect(
			withDraftEdits(served, TABLE, { enableTableExport: false }, {}),
		).toMatchObject({ enableTableExport: true })
	})

	it('leaves what the draft did not change as it was served', () => {
		expect(withDraftEdits(served, TABLE, { caption: 'Orders' }, { caption: 'Orders' })).toBe(served)
	})

	it('leaves a setting with a shape of its own to the next save', () => {
		const sort = { field: 'createdAt', desc: true }
		expect(withDraftEdits(served, TABLE, {}, { defaultSort: sort })).toBe(served)
	})

	it("reads the saved settings at the block's path", () => {
		const blocks = [
			{
				path: 'tabs',
				name: 'tabs',
				type: 'Tab',
				editable: true,
				children: [
					{ path: 'tabs/table', name: 'table', type: 'TableView', editable: true, config: { caption: 'Orders' } },
				],
			},
		] as BlockNode[]
		expect(savedConfigAt(blocks, 'tabs/table')).toEqual({ caption: 'Orders' })
		expect(savedConfigAt(blocks, 'tabs/other')).toBeUndefined()
	})
})

describe('a card reading a source built here', () => {
	it('reads the preview of the source as the draft has it', () => {
		const options = withDraftSource({ title: 'Orders', fetchUrl: QUERY.endpoint }, CARD, QUERY)
		const url = new URL(String(options?.fetchUrl), 'http://canvas')

		expect(url.pathname).toBe('/api/builder/query-preview')
		expect(JSON.parse(url.searchParams.get('query') ?? '')).toEqual({
			name: 'chartCard',
			resource: 'order',
			template: 'series',
			params: { op: 'count', groupBy: 'status' },
			response: 'card',
		})
		expect(options?.title).toBe('Orders')
	})

	it('is rendered anew when what it measures changes', () => {
		const before = withDraftSource({ fetchUrl: QUERY.endpoint }, CARD, QUERY)
		const after = withDraftSource({ fetchUrl: QUERY.endpoint }, CARD, {
			...QUERY,
			params: { op: 'sum', field: 'amount' },
		})
		expect(sourceKeyOf(before, CARD)).not.toBe(sourceKeyOf(after, CARD))
		expect(sourceKeyOf(before, CARD)).toBe(sourceKeyOf({ ...before }, CARD))
	})

	it("leaves a source the page's code answers, and a card reading none", () => {
		const coded = { fetchUrl: '/shop/board/stats/chart-card2' }
		expect(withDraftSource(coded, CARD, undefined)).toBe(coded)
		expect(withDraftSource({ title: 'Orders' }, CARD, QUERY)).toEqual({ title: 'Orders' })
	})

	it('builds the preview address from the query alone', () => {
		expect(sourcePreviewUrl(QUERY)).not.toContain('stats')
	})
})

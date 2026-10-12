import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneDraft } from '../app/runtime/draft'
import { ensurePeriodSelector, setPageLive } from '../app/runtime/page-controls'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockCatalog, BlockDraft, PageDraft } from '../app/runtime/types'
import { installFakeHost, testCatalog, type FakeBackend } from './support/builder-harness'

/**
 * The controls a page needs for what its blocks do, placed by the editor: the
 * period selector a card bound to the page's period follows, and the switch of
 * a live page.
 */

/** The test catalog, with a card that follows a period and a live switch. */
function controlsCatalog(base: BlockCatalog = testCatalog()): BlockCatalog {
	return {
		...base,
		blocks: [
			...base.blocks,
			{
				type: 'KpiCard',
				componentName: 'DmsKpiCard',
				label: 'KPI card',
				group: 'visualization',
				container: false,
				shapeSource: 'test',
				config: {
					fetchUrl: {
						type: 'string',
						optional: true,
						ui: { label: 'Data source', widget: 'dataSource', periodOption: 'periodScope' },
					},
					periodScope: { type: 'string', optional: true },
				},
			},
			{
				type: 'LiveToggle',
				componentName: 'DmsLiveToggle',
				label: 'Live toggle',
				group: 'data',
				container: false,
				shapeSource: 'test',
				config: {},
			},
		],
	} as BlockCatalog
}

const catalog = controlsCatalog()

function kpi(name: string, periodScope?: string): BlockDraft {
	return { name, type: 'KpiCard', config: periodScope ? { fetchUrl: '/x', periodScope } : { fetchUrl: '/x' } }
}

function page(...blocks: BlockDraft[]): PageDraft {
	return { blocks }
}

function names(draft: PageDraft): string[] {
	return draft.blocks.map((block) => `${block.name}:${block.type}`)
}

/** The draft after `edit`, with the period selector the edit calls for. */
function bind(before: PageDraft, edit: (draft: PageDraft) => void, known = catalog) {
	const next = cloneDraft(before)
	edit(next)
	return { next, placed: ensurePeriodSelector(next, known, before) }
}

describe('the period a card follows', () => {
	it('gets a selector at the top of the page once a card is bound to it', () => {
		const { next, placed } = bind(page(kpi('revenue')), (draft) => {
			draft.blocks[0]!.config = { fetchUrl: '/x', periodScope: 'page' }
		})
		expect(placed).toBe(true)
		expect(names(next)).toEqual(['period:PeriodSelector', 'revenue:KpiCard'])
	})

	it('is left to a selector already on the page', () => {
		const selector: BlockDraft = { name: 'range', type: 'PeriodSelector', config: {} }
		const { next, placed } = bind(page(kpi('revenue'), selector), (draft) => {
			draft.blocks[0]!.config = { fetchUrl: '/x', periodScope: 'page' }
		})
		expect(placed).toBe(false)
		expect(names(next)).toEqual(['revenue:KpiCard', 'range:PeriodSelector'])
	})

	it('is not set again by the editor once the author took its selector off', () => {
		const { placed } = bind(page(kpi('revenue', 'page')), (draft) => {
			draft.blocks.push(kpi('orders', 'page'))
		})
		expect(placed).toBe(false)
	})

	it('is not set for a scope a developer named, nor where the DMS has no selector', () => {
		expect(bind(page(kpi('revenue')), (draft) => {
			draft.blocks[0]!.config = { fetchUrl: '/x', periodScope: 'api' }
		}).placed).toBe(false)
		const older = { ...catalog, blocks: catalog.blocks.filter((block) => block.type !== 'PeriodSelector') }
		expect(bind(page(kpi('revenue')), (draft) => {
			draft.blocks[0]!.config = { fetchUrl: '/x', periodScope: 'page' }
		}, older).placed).toBe(false)
	})
})

describe('a live page', () => {
	it('gets its switch at the top, under the period selector it starts with', () => {
		const draft = page({ name: 'period', type: 'PeriodSelector', config: {} }, kpi('revenue'))
		setPageLive(draft, catalog, {})
		expect(draft.page).toEqual({ live: {} })
		expect(names(draft)).toEqual(['period:PeriodSelector', 'live:LiveToggle', 'revenue:KpiCard'])

		setPageLive(draft, catalog, { maxRate: 5 })
		expect(names(draft).filter((entry) => entry.endsWith('LiveToggle'))).toHaveLength(1)
	})

	it('loses every switch once it is not live, wherever they were', () => {
		const draft = page(kpi('revenue'), {
			name: 'card',
			type: 'Section',
			config: {},
			children: [{ name: 'toggle', type: 'LiveToggle', config: {} }],
		})
		setPageLive(draft, catalog, null)
		expect(draft.page).toEqual({ live: null })
		expect(draft.blocks[1]?.children).toEqual([])
	})
})

describe('the editor placing them', () => {
	let backend: FakeBackend
	let builder: BuilderController

	beforeEach(async () => {
		vi.useFakeTimers()
		backend = installFakeHost()
		backend.catalog = controlsCatalog()
		backend.structure = {
			...backend.structure,
			blocks: [{ path: 'revenue', name: 'revenue', type: 'KpiCard', editable: true, config: { fetchUrl: '/x' } }],
		}
		builder = useBuilder()
		builder.close()
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
	})

	afterEach(() => {
		builder.close()
		vi.useRealTimers()
	})

	const blocks = (): string[] => (builder.session.value.draft?.blocks ?? []).map((block) => block.name)

	it('places the selector as the card is bound to the period, and says so', () => {
		builder.patchConfig('revenue', { periodScope: 'page' })
		expect(blocks()).toEqual(['period', 'revenue'])
		expect(builder.session.value.toast).toMatch(/period selector/)
	})

	it('makes the page live and back in one edit each', () => {
		builder.setLive({})
		expect(blocks()).toEqual(['live', 'revenue'])
		expect(builder.unsaved.value.map((change) => change.title)).toContain('Page · Live updates')
		builder.undo()
		expect(blocks()).toEqual(['revenue'])
	})
})

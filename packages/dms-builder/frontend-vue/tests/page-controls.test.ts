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
				configOrigin: 'test',
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
				configOrigin: 'test',
				config: {
					align: { type: 'string', optional: true },
					variant: { type: 'string', optional: true },
				},
			},
			{
				type: 'PageToolbar',
				componentName: 'dms-page-toolbar-block',
				label: 'Page toolbar',
				group: 'data',
				container: true,
				configOrigin: 'test',
				config: {
					size: { type: 'string', optional: true },
					showUpdatedAt: { type: 'boolean', optional: true },
					refresh: { type: 'boolean', optional: true },
				},
				// What `pageToolbar()` places, as the DMS's catalog declares it.
				initialChildren: [
					{ id: 'live', type: 'LiveToggle', options: LIVE_IN_TOOLBAR },
					{ id: 'period', type: 'PeriodSelector', options: PERIOD_IN_TOOLBAR },
				],
			},
		],
	} as BlockCatalog
}

/** How the DMS's catalog sets the controls of a new toolbar. */
const PERIOD_IN_TOOLBAR = {
	variant: 'segmented',
	presets: ['last-hour', 'last-24h', 'last-7-days', 'last-30-days'],
	defaultPreset: 'last-24h',
	comparisonControl: 'menu',
	defaultComparison: 'previous-period',
}
const LIVE_IN_TOOLBAR = { align: 'right', variant: 'pill' }

const catalog = controlsCatalog()

function kpi(name: string, periodScope?: string): BlockDraft {
	return { name, type: 'KpiCard', config: periodScope ? { fetchUrl: '/x', periodScope } : { fetchUrl: '/x' } }
}

function page(...blocks: BlockDraft[]): PageDraft {
	return { blocks }
}

function names(draft: PageDraft | BlockDraft[]): string[] {
	const blocks = Array.isArray(draft) ? draft : draft.blocks
	return blocks.map((block) => `${block.name}:${block.type}`)
}

function toolbar(...children: BlockDraft[]): BlockDraft {
	return { name: 'toolbar', type: 'PageToolbar', config: {}, children }
}

function bindRevenue(draft: PageDraft): void {
	draft.blocks.find((block) => block.name === 'revenue')!.config = { fetchUrl: '/x', periodScope: 'page' }
}

/** The draft after `edit`, with the period selector the edit calls for. */
function bind(before: PageDraft, edit: (draft: PageDraft) => void, known = catalog) {
	const next = cloneDraft(before)
	edit(next)
	return { next, placed: ensurePeriodSelector(next, known, before) }
}

describe('the period a card follows', () => {
	it('gets a selector in a toolbar at the top of the page once a card is bound to it', () => {
		const { next, placed } = bind(page(kpi('revenue')), bindRevenue)
		expect(placed).toBe(true)
		expect(names(next)).toEqual(['toolbar:PageToolbar', 'revenue:KpiCard'])
		// The DMS's settings as they are, comparison menu included: the same
		// toolbar as `pageToolbar()` in code.
		expect(next.blocks[0]?.children).toEqual([
			{ name: 'period', type: 'PeriodSelector', config: PERIOD_IN_TOOLBAR },
		])
	})

	it('goes into the toolbar the page has, after what it holds', () => {
		const chip: BlockDraft = { name: 'scope', type: 'Text', config: {} }
		const { next } = bind(page(kpi('revenue'), toolbar(chip)), bindRevenue)
		expect(names(next)).toEqual(['revenue:KpiCard', 'toolbar:PageToolbar'])
		expect(names(next.blocks[1]!.children!)).toEqual(['scope:Text', 'period:PeriodSelector'])
	})

	it('is left to a selector already in the toolbar', () => {
		const selector: BlockDraft = { name: 'period', type: 'PeriodSelector', config: {} }
		const { placed } = bind(page(toolbar(selector), kpi('revenue')), bindRevenue)
		expect(placed).toBe(false)
	})

	it('goes beside the controls of a page laid out before the toolbar', () => {
		const live: BlockDraft = { name: 'live', type: 'LiveToggle', config: {} }
		const { next } = bind(page(live, kpi('revenue')), bindRevenue)
		expect(names(next)).toEqual(['period:PeriodSelector', 'live:LiveToggle', 'revenue:KpiCard'])
		expect(next.blocks[0]?.config).toEqual({})
	})

	it('stays out of a toolbar written in code, and goes under it', () => {
		const managed: BlockDraft = { ...toolbar(), preserve: true }
		const { next } = bind(page(managed, kpi('revenue')), bindRevenue)
		expect(names(next)).toEqual(['toolbar:PageToolbar', 'period:PeriodSelector', 'revenue:KpiCard'])
		expect(next.blocks[0]?.children).toEqual([])
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
	it('gets its switch in the toolbar, before the period selector', () => {
		const selector: BlockDraft = { name: 'period', type: 'PeriodSelector', config: {} }
		const draft = page(toolbar(selector), kpi('revenue'))
		setPageLive(draft, catalog, {})
		expect(names(draft.blocks[0]!.children!)).toEqual(['live:LiveToggle', 'period:PeriodSelector'])
		expect(draft.blocks[0]!.children![0]!.config).toEqual(LIVE_IN_TOOLBAR)
	})

	it('gets a toolbar holding its switch when it has no control yet, gone with it', () => {
		const draft = page(kpi('revenue'))
		setPageLive(draft, catalog, {})
		expect(names(draft)).toEqual(['toolbar:PageToolbar', 'revenue:KpiCard'])
		expect(names(draft.blocks[0]!.children!)).toEqual(['live:LiveToggle'])

		setPageLive(draft, catalog, null)
		expect(names(draft)).toEqual(['revenue:KpiCard'])
	})

	it('keeps the toolbar once not live when it holds more than the switch', () => {
		const selector: BlockDraft = { name: 'period', type: 'PeriodSelector', config: {} }
		const draft = page(toolbar({ name: 'live', type: 'LiveToggle', config: {} }, selector))
		setPageLive(draft, catalog, null)
		expect(names(draft)).toEqual(['toolbar:PageToolbar'])
		expect(names(draft.blocks[0]!.children!)).toEqual(['period:PeriodSelector'])
	})

	it('leaves the switch of a toolbar written in code, which draws nothing once not live', () => {
		const managed: BlockDraft = {
			...toolbar({ name: 'live', type: 'LiveToggle', config: {} }),
			lockedOptions: { size: 'size' },
		}
		const draft = page(managed)
		setPageLive(draft, catalog, null)
		expect(names(draft.blocks[0]!.children!)).toEqual(['live:LiveToggle'])
	})

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
		expect(blocks()).toEqual(['toolbar', 'revenue'])
		expect(builder.session.value.toast).toMatch(/period selector/)
	})

	it('puts a toolbar placed from the palette at the top, with the controls the page needs', () => {
		builder.patchPage({ live: {} })
		builder.addBlock('PageToolbar')
		expect(blocks()).toEqual(['pageToolbar', 'revenue'])
		const placed = builder.session.value.draft?.blocks[0]
		expect(placed?.children?.map((child) => child.name)).toEqual(['live', 'period'])
	})

	it('makes the page live and back in one edit each', () => {
		builder.setLive({})
		expect(blocks()).toEqual(['toolbar', 'revenue'])
		expect(builder.unsaved.value.map((change) => change.title)).toContain('Page · Live updates')
		builder.undo()
		expect(blocks()).toEqual(['revenue'])
	})
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draftChanges, revertChange, summary } from '../app/runtime/changes'
import { cloneDraft } from '../app/runtime/draft'
import { blockPosition, blockTitle, placedPaths } from '../app/runtime/naming'
import { saveStatus } from '../app/runtime/save-status'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockDraft, PageDraft } from '../app/runtime/types'
import { installFakeHost, testCatalog, type FakeBackend } from './support/builder-harness'

/**
 * The change list: what the draft holds that the page does not, in the terms
 * of the page, each change put back on its own.
 */

const catalog = testCatalog()

function text(name: string, content?: string): BlockDraft {
	return { name, type: 'Text', config: content === undefined ? {} : { content } }
}

function row(...cells: BlockDraft[]): BlockDraft {
	return {
		name: 'grid',
		type: 'Grid',
		config: {},
		children: [{ name: 'gridRow', type: 'GridRow', config: {}, children: cells }],
	}
}

function page(...blocks: BlockDraft[]): PageDraft {
	return { blocks }
}

function titles(saved: PageDraft, draft: PageDraft): string[] {
	return draftChanges(saved, draft, catalog).map((change) => change.title)
}

describe('the changes of a draft', () => {
	it('are none while it is the page as saved', () => {
		const saved = page(text('title', 'Sales'))
		expect(draftChanges(saved, cloneDraft(saved), catalog)).toEqual([])
	})

	it('names a block added and one removed by what the page shows of them', () => {
		const saved = page(text('title', 'Sales'), text('intro', 'Welcome'))
		const draft = page(text('title', 'Sales'), text('outro', 'Bye'))
		expect(titles(saved, draft)).toEqual(['Added Bye', 'Removed Welcome'])
	})

	it('says an option changed, from what to what', () => {
		const saved = page(text('title', 'Sales'))
		const draft = page(text('title', 'Revenue'))
		const [change] = draftChanges(saved, draft, catalog)
		expect(change).toMatchObject({
			kind: 'edited',
			group: 'page',
			before: '“Sales”',
			after: '“Revenue”',
			path: 'title',
		})
	})

	it('does not count a block put in a row as moved: nobody sees the row', () => {
		const saved = page(text('title', 'Sales'), text('intro', 'Welcome'))
		const draft = page(row(text('title', 'Sales'), text('intro', 'Welcome')))
		expect(titles(saved, draft)).toEqual([])
	})

	it('counts a block whose place among the others changed', () => {
		const saved = page(text('a', 'One'), text('b', 'Two'), text('c', 'Three'))
		const draft = page(text('b', 'Two'), text('c', 'Three'), text('a', 'One'))
		expect(titles(saved, draft)).toEqual(['Moved One'])
	})

	it('counts a block moved into another', () => {
		const section: BlockDraft = { name: 'section', type: 'Section', config: {}, children: [] }
		const saved = page(text('note', 'Hello'), section)
		const draft = page({ ...section, children: [text('note', 'Hello')] })
		const [change] = draftChanges(saved, draft, catalog)
		expect(change).toMatchObject({
			kind: 'moved',
			title: 'Moved Hello',
			detail: 'the page → Section',
		})
	})

	it("files the page's own settings by what they reach", () => {
		const saved = page(text('title', 'Sales'))
		const draft = { ...cloneDraft(saved), page: { displayName: 'Revenue', hidden: true } }
		const changes = draftChanges(saved, draft, catalog, { displayName: 'Sales' })
		expect(changes.map((change) => [change.group, change.title, change.before, change.after])).toEqual([
			['page', 'Page · Title', '“Sales”', '“Revenue”'],
			['menu', 'Page · Shown in the menu', 'shown', 'hidden'],
		])
	})

	it('lists a data source added to the draft', () => {
		const saved = page(text('title', 'Sales'))
		const draft = {
			...cloneDraft(saved),
			queries: [{ name: 'total', resource: 'orders', template: 'count' }],
		}
		expect(titles(saved, draft)).toEqual(['Added data source total'])
	})
})

describe('putting one change back', () => {
	function revertAll(saved: PageDraft, draft: PageDraft): PageDraft {
		const next = cloneDraft(draft)
		for (const change of draftChanges(saved, draft, catalog)) {
			revertChange(next, change.revert)
		}
		return next
	}

	it('takes an added block away, and brings a removed one back where it was', () => {
		const saved = page(text('title', 'Sales'), text('intro', 'Welcome'))
		const draft = page(text('title', 'Sales'), text('outro', 'Bye'))
		expect(revertAll(saved, draft).blocks.map((block) => block.name)).toEqual([
			'title',
			'intro',
		])
	})

	it('puts an option back, unset when it was unset', () => {
		const saved = page(text('title'))
		const draft = page(text('title', 'Revenue'))
		expect(revertAll(saved, draft).blocks[0]?.config).toEqual({})
	})

	it("puts a page's setting back", () => {
		const saved = page(text('title', 'Sales'))
		const draft = { ...cloneDraft(saved), page: { displayName: 'Revenue' } }
		expect(revertAll(saved, draft).page).toEqual({})
	})
})

describe('a value, as the list says it', () => {
	it('quotes text, words switches and counts lists', () => {
		expect(summary('Sales')).toBe('“Sales”')
		expect(summary(true)).toBe('on')
		expect(summary([1, 2])).toBe('2 items')
		expect(summary(undefined)).toBe('—')
	})
})

describe('a block, as the editor names it', () => {
	it('goes by its title, else its text, else what it is', () => {
		expect(blockTitle({ name: 'card', type: 'Section', config: { title: 'Orders' } }, catalog)).toBe('Orders')
		expect(blockTitle(text('intro', 'Welcome back'), catalog)).toBe('Welcome back')
		expect(blockTitle(text('intro'), catalog)).toBe('Text')
	})

	it('says where it sits: across the page, or in a column of a row', () => {
		const draft = page(text('title', 'Sales'), row(text('a', 'One'), text('b', 'Two')))
		expect(blockPosition(draft, 'title', catalog)).toBe('full width')
		expect(blockPosition(draft, 'grid/gridRow/b', catalog)).toBe('column 2 of 2')
		expect(placedPaths(draft, catalog)).toEqual(['title', 'grid/gridRow/a', 'grid/gridRow/b'])
	})
})

describe('the status the bar shows', () => {
	const base = { saving: false, dirty: false, changes: 0, problems: 0, lastSave: null }

	it('goes from saved, to waiting, to saving, to saved at a time', () => {
		expect(saveStatus(base).label).toBe('All changes saved')
		expect(saveStatus({ ...base, dirty: true, changes: 3 }).label).toBe('3 unsaved changes')
		expect(saveStatus({ ...base, dirty: true, changes: 3, saving: true }).kind).toBe('saving')
		const at = new Date(2026, 9, 8, 14, 12).getTime()
		expect(saveStatus({ ...base, lastSave: { outcome: 'saved', at } }).label).toBe('Saved · 14:12')
	})

	it('puts what stops the save first, and a failed save above all', () => {
		expect(saveStatus({ ...base, dirty: true, changes: 2, problems: 1 }).label).toBe(
			'1 to fix · 2 unsaved',
		)
		expect(
			saveStatus({ ...base, dirty: true, changes: 2, problems: 1, lastSave: { outcome: 'failed', at: 0 } })
				.kind,
		).toBe('error')
	})
})

describe('a layout to start from', () => {
	let backend: FakeBackend
	let builder: BuilderController

	beforeEach(async () => {
		vi.useFakeTimers()
		backend = installFakeHost()
		backend.structure = { ...backend.structure, blocks: [] }
		builder = useBuilder()
		builder.close()
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
	})

	afterEach(() => {
		builder.close()
		vi.useRealTimers()
	})

	it('lays the blocks the project declares, side by side where it says so, as one edit', () => {
		backend.catalog.blocks.push(
			...['PeriodSelector', 'KpiCard', 'ChartCard'].map((type) => ({
				type,
				componentName: `Dms${type}`,
				label: type,
				group: 'data',
				container: false,
				config: {},
				shapeSource: 'test',
			})),
		)
		builder.applyLayout('dashboard')

		const draft = builder.session.value.draft!
		expect(placedPaths(draft, builder.session.value.catalog)).toEqual([
			'periodSelector',
			'grid/gridRow/kpiCard',
			'grid/gridRow/kpiCard2',
			'grid/gridRow/kpiCard3',
			'chartCard',
		])
		expect(builder.session.value.history).toHaveLength(1)
	})
})

describe('the edits of one data source', () => {
	let builder: BuilderController

	beforeEach(async () => {
		vi.useFakeTimers()
		installFakeHost()
		builder = useBuilder()
		builder.close()
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
	})

	afterEach(() => {
		builder.close()
		vi.useRealTimers()
	})

	function pick(template: string): void {
		builder.grouped('source:revenue', () => {
			builder.setDraftQuery({ name: 'revenue', resource: 'orders', template })
			builder.patchConfig('title', { fetchUrl: '/reports/sales/stats/revenue' })
		})
	}

	it('are one step to undo while they are being picked', () => {
		pick('count')
		pick('aggregate')
		pick('sum')
		expect(builder.session.value.history).toHaveLength(1)

		builder.undo()
		expect(builder.session.value.draft?.queries).toBeUndefined()
	})

	it('start a new step once the author has paused', () => {
		pick('count')
		vi.setSystemTime(Date.now() + 2000)
		pick('aggregate')
		expect(builder.session.value.history).toHaveLength(2)
	})
})

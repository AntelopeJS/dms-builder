import { describe, expect, it } from 'vitest'
import { findNode } from '../app/runtime/draft'
import {
	builder,
	names,
	row,
	withBlocks,
	beside,
} from './support/builder-placement-harness'

/**
 * What the editor does with "above this cell" and "below this cell" inside a
 * row, which lays its children out side by side and nothing else.
 *
 * `dropping.ts` decides which of the two readings applies; these drive the two
 * placements it asks for and check what the draft holds afterwards.
 */
describe('a column the editor builds around a cell', () => {
	/** A row of two cells: what two blocks put side by side leave behind. */
	function gridWithTwoCards(): void {
		withBlocks(row('text', 'text2'))
	}

	/** The placement `dropping.ts` answers with for a band across a cell. */
	function below(cell: string) {
		return { around: cell, type: 'VStack', index: 1 }
	}

	function above(cell: string) {
		return { around: cell, type: 'VStack', index: 0 }
	}

	it('takes the cell in with the block, in the order that was aimed at', () => {
		gridWithTwoCards()
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, below('grid/gridRow/text'))

		// The row still carries two columns; the first of them is now a stack.
		expect(names('grid/gridRow')).toEqual(['vStack', 'text2'])
		expect(names('grid/gridRow/vStack')).toEqual(['text', 'text3'])
	})

	it('puts the block above the cell when that is the band aimed at', () => {
		gridWithTwoCards()
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, above('grid/gridRow/text'))
		expect(names('grid/gridRow/vStack')).toEqual(['text3', 'text'])
	})

	it('names the block that was dropped, never the column built for it', () => {
		gridWithTwoCards()
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, below('grid/gridRow/text'))

		expect(builder.session.value.toast).toBe('Text added')
		expect(builder.session.value.selection).toBe('grid/gridRow/vStack/text3')
	})

	it('names every column it builds free of the ones already in the row', () => {
		gridWithTwoCards()
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, below('grid/gridRow/text'))
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 1, below('grid/gridRow/text2'))
		expect(names('grid/gridRow')).toEqual(['vStack', 'vStack2'])
	})

	it('lays the column out across the cell it replaced', () => {
		gridWithTwoCards()
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, below('grid/gridRow/text'))

		// A stack centres what it holds by default. Left at that, a cell that
		// filled its column would shrink to its own width — and everything else
		// in that column with it — for a gesture that only added a block.
		const column = findNode(builder.session.value.draft!, 'grid/gridRow/vStack')
		expect(column?.config).toEqual({ alignment: 'stretch' })
	})

	it('hands the columns the cell claimed over to the stack that replaces it', () => {
		gridWithTwoCards()
		builder.patchMeta('grid/gridRow/text', { colSpan: 3 })
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, below('grid/gridRow/text'))

		// The row sizes its columns off these numbers: left on the cell, the row
		// would re-measure itself and the layout would shift under the drop.
		const column = findNode(builder.session.value.draft!, 'grid/gridRow/vStack')
		expect(column?.meta).toEqual({ colSpan: 3 })
		expect(
			findNode(builder.session.value.draft!, 'grid/gridRow/vStack/text')?.meta,
		).toBe(undefined)
	})

	it('takes a block already on the page into the column too', () => {
		gridWithTwoCards()
		builder.beginDrag({ path: 'title' })
		builder.dropAt('grid/gridRow', 0, below('grid/gridRow/text'))

		expect(names()).toEqual(['intro', 'grid'])
		expect(names('grid/gridRow/vStack')).toEqual(['text', 'title'])
		expect(builder.session.value.selection).toBe('grid/gridRow/vStack/title')
	})

	it('turns down the row that would be moved inside its own cell', () => {
		gridWithTwoCards()
		const before = JSON.stringify(builder.session.value.draft)
		const historyBefore = builder.session.value.history.length

		builder.beginDrag({ path: 'grid/gridRow' })
		builder.dropAt('grid/gridRow', 0, below('grid/gridRow/text'))

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.toast).toBe('A block cannot go inside itself')
		expect(builder.session.value.history.length).toBe(historyBefore)
	})

	it('leaves no column behind when the move it built one for is refused', () => {
		gridWithTwoCards()
		const before = JSON.stringify(builder.session.value.draft)
		const historyBefore = builder.session.value.history.length

		// The cell dragged onto its own band: the column would be built around the
		// very block being moved into it, and `moveNode` turns that down.
		builder.move('grid/gridRow/text', 'grid/gridRow', 0, below('grid/gridRow/text'))

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.history.length).toBe(historyBefore)
	})
})

/**
 * The whole promise, end to end: four blocks in a square, out of an empty page,
 * with no container placed by hand.
 *
 * Every call below is one drag: the target each one carries is what
 * `targetAtBlock` answered for the pointer, and nothing else is passed.
 */
describe('a two-by-two layout, gesture by gesture', () => {
	it('takes four drags, and not one of them places a container', () => {
		builder.setDraft({ blocks: [] })

		// 1 and 2 — a block on the empty page, and one under it.
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 1)
		expect(names()).toEqual(['text', 'text2'])

		// 3 and 4 — aimed at the right-hand quarter of each block: a row each.
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0, beside('text'))
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 1, beside('text2'))

		expect(names()).toEqual(['grid', 'grid2'])
		expect(names('grid/gridRow')).toEqual(['text', 'text3'])
		expect(names('grid2/gridRow')).toEqual(['text2', 'text4'])
		expect(builder.session.value.toast).toBe('Text added')
	})

	it('reaches the same square through the columns of one single row', () => {
		builder.setDraft({ blocks: [] })

		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0, beside('text'))
		// Below each of the two cells, which now have a neighbour: a column each.
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, {
			around: 'grid/gridRow/text',
			type: 'VStack',
			index: 1,
		})
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 1, {
			around: 'grid/gridRow/text2',
			type: 'VStack',
			index: 1,
		})

		expect(names('grid')).toEqual(['gridRow'])
		expect(names('grid/gridRow')).toEqual(['vStack', 'vStack2'])
		expect(names('grid/gridRow/vStack')).toHaveLength(2)
		expect(names('grid/gridRow/vStack2')).toHaveLength(2)
	})
})

describe('a block placed before it is configured', () => {
	function configOf(name: string): Record<string, unknown> | undefined {
		return findNode(builder.session.value.draft!, name)?.config
	}

	// The page is typechecked on every edit, so a block whose own type demands
	// an option cannot be dropped and then filled in: it would answer a gesture
	// with a compiler error about the block that gesture just placed.
	it('carries the options its own type demands', () => {
		builder.addBlock('ChartCard')

		expect(configOf('chartCard')).toEqual({
			title: 'Chart card 1',
			chart: { $block: { type: 'ChartLine', config: {} } },
		})
	})

	it('numbers a title against the page, so two of a type read apart', () => {
		builder.addBlock('ChartCard')
		builder.addBlock('ChartCard')

		expect(
			[configOf('chartCard'), configOf('chartCard2')].map(
				(config) => config?.title,
			),
		).toEqual(['Chart card 1', 'Chart card 2'])
	})

	it('leaves a period selector on the scope the cards follow', () => {
		builder.addBlock('PeriodSelector')

		// An id seeded after the block drove no card at all: a card bound to a
		// period follows the page's scope, which is the selector's own default.
		expect(configOf('periodSelector')).toEqual({})
	})

	it('seeds a title the type leaves optional, which renders as nothing', () => {
		builder.addBlock('Form')

		expect(configOf('form')).toEqual({
			title: 'Form 1',
			submitLabel: 'Submit',
			fields: [],
		})
	})

	it('carries what its own type asks to be placed with, over a seeded name', () => {
		builder.addBlock('EmptyState')

		expect(configOf('emptyState')).toEqual({ title: 'Nothing here yet' })
	})

	it('words a button the page shows rather than naming it after the block', () => {
		builder.addBlock('Form')
		builder.addBlock('Form')

		// A second form is "Form 2", but both submit with the same word: the
		// button closes a form, it does not name one.
		expect(
			[configOf('form'), configOf('form2')].map((config) => [
				config?.title,
				config?.submitLabel,
			]),
		).toEqual([
			['Form 1', 'Submit'],
			['Form 2', 'Submit'],
		])
	})

	it('opens a tab set on a first tab, titled for the author to rename', () => {
		builder.addBlock('Tab')

		// With no tab, the set is a strip with nothing to click and nowhere on
		// the canvas to drop a block into.
		expect(configOf('tab')).toEqual({ items: [{ slot: 'tab1', label: 'Tab 1' }] })
	})

	it('writes nothing on a block that demands nothing', () => {
		builder.addBlock('Text')

		expect(configOf('text')).toEqual({})
	})
})

describe('a container that holds its children through its own slots', () => {
	/** The tabs a Tab block declares, as its options carry them. */
	function tabs(path: string): Array<Record<string, unknown>> {
		const block = findNode(builder.session.value.draft!, path)
		return (block?.config?.items ?? []) as Array<Record<string, unknown>>
	}

	function slotOf(path: string): string | undefined {
		return findNode(builder.session.value.draft!, path)?.slot
	}

	it('opens its first tab for the block dropped into it', () => {
		builder.addBlock('Tab')
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('tab', 0)

		// Without a slot the block is laid out nowhere: it would vanish from the
		// page until someone assigned it a tab from the config panel.
		expect(slotOf('tab/text')).toBe('tab1')
		expect(tabs('tab')).toEqual([{ slot: 'tab1', label: 'Tab 1' }])
	})

	it('puts the next block in that same tab', () => {
		builder.addBlock('Tab')
		builder.addBlock('Text', 'tab', null)
		builder.addBlock('Text', 'tab', null)
		expect(slotOf('tab/text2')).toBe('tab1')
		expect(tabs('tab')).toHaveLength(1)
	})

	it('keeps a block in the tab it was put in when it is reordered', () => {
		builder.addBlock('Tab')
		builder.addBlock('Text', 'tab', null)
		builder.addBlock('Text', 'tab', null)
		builder.patchConfig('tab', {
			items: [
				{ slot: 'tab1', label: 'One' },
				{ slot: 'tab2', label: 'Two' },
			],
		})
		builder.setSlot('tab/text2', 'tab2')

		builder.move('tab/text2', 'tab', 0)
		expect(slotOf('tab/text2'), 'a tab it really has is left alone').toBe('tab2')
	})

	it('names the region of a tab an author added by hand', () => {
		builder.addBlock('Tab')
		// What the panel's list editor writes when a tab is added there: a title,
		// which is all adding a tab should ask for.
		builder.patchConfig('tab', { items: [{ label: 'Orders' }] })

		// Without the id the page does not compile, and the author is answered
		// with a compiler error about a property no panel ever showed them.
		expect(tabs('tab')).toEqual([{ label: 'Orders', slot: 'orders' }])
	})

	it('titles a tab nobody titled, and numbers its region', () => {
		builder.addBlock('Tab')
		builder.patchConfig('tab', { items: [{}] })

		expect(tabs('tab')).toEqual([{ label: 'Tab 1', slot: 'tab1' }])
	})

	it('folds a title down to something a slot name can carry', () => {
		builder.addBlock('Tab')
		builder.patchConfig('tab', { items: [{ label: 'Commandes récentes' }] })

		expect(tabs('tab')).toEqual([
			{ label: 'Commandes récentes', slot: 'commandes-recentes' },
		])
	})

	it('keeps two tabs of the same title apart', () => {
		builder.addBlock('Tab')
		builder.patchConfig('tab', {
			items: [{ label: 'Orders' }, { label: 'Orders' }],
		})

		expect(tabs('tab').map((tab) => tab.slot)).toEqual(['orders', 'orders-2'])
	})

	it('writes no title back over a tab that already has a region', () => {
		builder.addBlock('Tab')
		builder.patchConfig('tab', { items: [{ label: 'Orders' }] })
		// Retyping a title starts by clearing it; one written back under the
		// cursor would fight whoever is typing.
		builder.patchConfig('tab', { items: [{ slot: 'orders' }] })

		expect(tabs('tab')).toEqual([{ slot: 'orders' }])
	})

	it('leaves a tab the engine will write back as it read it alone', () => {
		builder.addBlock('Tab')
		// A value the engine carries through rather than re-emitting: naming
		// anything inside it would change the source it writes back.
		builder.patchConfig('tab', { items: [{ $ref: 'SHARED_TABS' }] })

		expect(tabs('tab')).toEqual([{ $ref: 'SHARED_TABS' }])
	})

	it('puts a block dropped in it in the tab the author added, not in a new one', () => {
		builder.addBlock('Tab')
		builder.patchConfig('tab', { items: [{ label: 'Orders' }] })
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('tab', 0)

		expect(slotOf('tab/text')).toBe('orders')
		expect(tabs('tab'), 'and no second tab beside it').toHaveLength(1)
	})

	it('drops into the tab that is open, not into the first one', () => {
		builder.addBlock('Tab')
		builder.patchConfig('tab', {
			items: [
				{ slot: 'orders', label: 'Orders' },
				{ slot: 'sends', label: 'Sends' },
			],
		})
		// What the rendered tab set reports as it switches: the author is looking
		// at the second tab, so that is the one being dropped into.
		builder.openRegion('tab', 'sends')
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('tab', 0)

		expect(slotOf('tab/text')).toBe('sends')
	})

	it('falls back to the first tab while none has been opened', () => {
		builder.addBlock('Tab')
		builder.patchConfig('tab', {
			items: [
				{ slot: 'orders', label: 'Orders' },
				{ slot: 'sends', label: 'Sends' },
			],
		})
		builder.addBlock('Text', 'tab', null)

		expect(slotOf('tab/text')).toBe('orders')
	})

	it('ignores a tab that is no longer there', () => {
		builder.addBlock('Tab')
		builder.patchConfig('tab', { items: [{ slot: 'orders', label: 'Orders' }] })
		builder.openRegion('tab', 'sends')
		builder.addBlock('Text', 'tab', null)

		expect(slotOf('tab/text')).toBe('orders')
	})

	it('lets go of the tab when the block is moved somewhere that has none', () => {
		builder.addBlock('Tab')
		builder.addBlock('Text', 'tab', null)
		builder.addBlock('Section')
		builder.move('tab/text', 'section', 0)

		// A slot left over from the tab set would hide it inside the section.
		expect(slotOf('section/text')).toBe(undefined)
	})
})

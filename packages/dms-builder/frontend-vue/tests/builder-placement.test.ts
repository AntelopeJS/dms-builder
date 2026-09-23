import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useDmsState } from '#dms/frontend-module'
import registerBuilder from '../app/plugins/builder.client'
import { ACTION_ID, HEADER_ACTIONS_STATE_KEY } from '../app/runtime/constants'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { findNode } from '../app/runtime/draft'
import { describeError } from '../app/runtime/errors'
import { useBuilder, type BuilderController } from '../app/runtime/session'

/**
 * What placing a block actually does to the draft.
 *
 * The canvas has three ways in — the palette's click, the palette's drag, and
 * dragging a block already on the page — and all three land on the same two
 * controller calls, `addBlock` and `move`, through `dropAt`. These drive them
 * against a recorded backend, so what the draft holds afterwards is observable
 * without the running page.
 */

let backend: FakeBackend
let builder: BuilderController

/** The debounced preview the canvas renders from. */
async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(200)
}

/** The target the palette's click passes: what Library.vue binds to. */
function paletteTarget(): string | null {
	return builder.paletteTarget.value
}

function paletteClick(type: string): void {
	builder.addBlock(type, paletteTarget(), null)
}

/** The child names at a draft path, or the root names when no path is given. */
function names(path?: string): string[] {
	const draft = builder.session.value.draft
	if (!draft) {
		return []
	}
	const list = path ? findNode(draft, path)?.children : draft.blocks
	return (list ?? []).map((block) => block.name)
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

describe('the palette says "click to append"', () => {
	it('appends to the end of the page when nothing is selected', () => {
		paletteClick('Text')
		expect(names()).toEqual(['title', 'intro', 'text'])
		expect(builder.session.value.toast).toBe('Text added')
	})

	it('appends inside the selection when the selection is a container', () => {
		builder.addBlock('HStack')
		expect(builder.session.value.selection).toBe('hStack')
		paletteClick('Text')
		expect(names('hStack')).toEqual(['text'])
	})

	it('appends beside the selected block when that block is inside a container', () => {
		builder.addBlock('HStack')
		builder.addBlock('Text', 'hStack', null)
		// The user has just clicked the Text inside the stack and clicks the
		// palette again, expecting a second block next to it.
		builder.select('hStack/text')
		expect(paletteTarget(), 'the container holding the selection').toBe('hStack')
		paletteClick('Text')

		expect(names('hStack')).toEqual(['text', 'text2'])
		expect(names(), 'and nothing lands at the bottom of the page').toEqual([
			'title',
			'intro',
			'hStack',
		])
	})

	it('climbs past every block that cannot hold anything', () => {
		builder.addBlock('Grid')
		builder.addBlock('GridRow', 'grid', null)
		builder.addBlock('Text', 'grid/gridRow', null)
		builder.select('grid/gridRow/text')
		expect(paletteTarget()).toBe('grid/gridRow')

		builder.select('title')
		expect(paletteTarget(), 'a root block outside any container').toBe(null)
	})

	it('does nothing at all for a type the catalog does not carry', () => {
		const before = JSON.stringify(builder.session.value.draft)
		builder.addBlock('NotAType')
		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.toast).toBe(null)
		expect(builder.session.value.error).toBe(null)
	})
})

describe('dropAt — the whole drag cycle, as the drop zones call it', () => {
	it('inserts a palette block between two root blocks', () => {
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 1)
		expect(names()).toEqual(['title', 'text', 'intro'])
		expect(builder.session.value.dragging).toBe(null)
	})

	it('moves a block already on the page when the payload carries a path', () => {
		builder.beginDrag({ path: 'intro' })
		builder.dropAt(null, 0)
		expect(names()).toEqual(['intro', 'title'])
	})

	it('does nothing when no drag is in flight', () => {
		const before = JSON.stringify(builder.session.value.draft)
		builder.dropAt(null, 0)
		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.history).toHaveLength(0)
	})
})

describe('containers', () => {
	it('takes two blocks in an HStack', () => {
		builder.addBlock('HStack')
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('hStack', 0)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('hStack', 1)
		expect(names('hStack')).toEqual(['text', 'text2'])
	})

	it('lays a stack out across the page rather than down its middle', () => {
		builder.addBlock('VStack')
		builder.addBlock('HStack')
		builder.addBlock('Grid')

		const config = (name: string) =>
			findNode(builder.session.value.draft!, name)?.config
		expect(config('vStack')).toEqual({ alignment: 'stretch' })
		expect(config('hStack')).toEqual({ alignment: 'stretch' })
		// Nothing is written on a container that lays its children out itself.
		expect(config('grid')).toEqual({})
	})

	it('takes two blocks in a VStack, which stacks them one above the other', () => {
		builder.addBlock('VStack')
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('vStack', 0)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('vStack', 1)
		expect(names('vStack')).toEqual(['text', 'text2'])
		// Nothing in the draft distinguishes this from an HStack: the direction
		// is the block type, and the editor offers no way to change it.
		expect(builder.selectedDescriptor.value?.type).toBe('Text')
	})

	it('builds the row a Grid needs around the block it is handed', () => {
		builder.addBlock('Grid')
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid', 0)

		const grid = builder.session.value.catalog?.blocks.find(
			(block) => block.type === 'Grid',
		)
		expect(grid?.allowedChildren, 'the catalog states the rule').toEqual([
			'GridRow',
		])
		// The rule is honoured instead of being reported: the row is the editor's
		// to build, and what comes back names the block the user dropped.
		expect(names('grid')).toEqual(['gridRow'])
		expect(names('grid/gridRow')).toEqual(['text'])
		expect(builder.session.value.toast).toBe('Text added')
		expect(builder.session.value.selection).toBe('grid/gridRow/text')
		expect(builder.session.value.dragging).toBe(null)
	})

	it('names every row it builds free of the ones already in the grid', () => {
		builder.addBlock('Grid')
		builder.addBlock('Text', 'grid', null)
		builder.addBlock('Text', 'grid', null)
		expect(names('grid')).toEqual(['gridRow', 'gridRow2'])
		expect(names('grid/gridRow2')).toEqual(['text'])
	})

	it('builds one for a block already on the page, moved into the grid', () => {
		builder.addBlock('Grid')
		builder.beginDrag({ path: 'title' })
		builder.dropAt('grid', 0)
		expect(names()).toEqual(['intro', 'grid'])
		expect(names('grid/gridRow')).toEqual(['title'])
	})

	it('turns down a row pushed among the columns of another', () => {
		builder.addBlock('Grid')
		builder.addBlock('GridRow', 'grid', null)
		const before = JSON.stringify(builder.session.value.draft)

		builder.beginDrag({ type: 'GridRow' })
		builder.dropAt('grid/gridRow', 0)

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.toast).toBe(
			'A row always spans the full width; drop inside it for a column',
		)
	})

	it('takes the row that same Grid does accept, without wrapping it', () => {
		builder.addBlock('Grid')
		builder.beginDrag({ type: 'GridRow' })
		builder.dropAt('grid', 0)
		expect(names('grid')).toEqual(['gridRow'])
		expect(names('grid/gridRow')).toEqual([])
	})

	it('turns down a child on a block that takes none', () => {
		builder.beginDrag({ type: 'Text' })
		// `title` is a Text: `container` is false, and the module would answer
		// `block type "Text" takes no child` on the next save.
		builder.dropAt('title', 0)
		expect(names('title')).toEqual([])
		expect(builder.session.value.toast).toBe('Text takes no child')
	})
})

/**
 * The palette no longer lists a row, and none of this changed: what is on the
 * page is a block like any other. Only the way to obtain one is now the grid's.
 */
describe('a row the grid built for itself', () => {
	/** A grid holding one row with one card in it: what one drop leaves behind. */
	function gridWithACard(): void {
		builder.addBlock('Grid')
		builder.addBlock('Text', 'grid', null)
	}

	it('is selected, and opens the panel that configures it', () => {
		gridWithACard()
		builder.select('grid/gridRow')
		expect(builder.selectedDescriptor.value?.type).toBe('GridRow')
		expect(builder.session.value.view).toBe('config')
	})

	it('is renamed, and keeps its columns', () => {
		gridWithACard()
		builder.rename('grid/gridRow', 'band')
		expect(names('grid')).toEqual(['band'])
		expect(names('grid/band')).toEqual(['text'])
		expect(builder.session.value.selection).toBe('grid/band')
	})

	it('is reordered among the rows of its grid', () => {
		gridWithACard()
		builder.addBlock('Text', 'grid', null)
		expect(names('grid')).toEqual(['gridRow', 'gridRow2'])

		builder.nudge('grid/gridRow', 1)
		expect(names('grid')).toEqual(['gridRow2', 'gridRow'])
	})

	it('is moved into another grid, carrying what it holds', () => {
		gridWithACard()
		builder.addBlock('Grid')
		builder.move('grid/gridRow', 'grid2', 0)
		expect(names('grid')).toEqual([])
		expect(names('grid2')).toEqual(['gridRow'])
		expect(names('grid2/gridRow')).toEqual(['text'])
	})

	it('is deleted, columns and all', () => {
		gridWithACard()
		builder.remove('grid/gridRow')
		expect(names('grid')).toEqual([])
		expect(builder.session.value.toast).toBe('Block removed')
	})

	it('still refuses another row against its flank, and says why', () => {
		gridWithACard()
		builder.addBlock('Text', 'grid', null)
		const before = JSON.stringify(builder.session.value.draft)

		// The gesture the palette can no longer start, and a move still can.
		builder.beginDrag({ path: 'grid/gridRow2' })
		builder.dropAt('grid/gridRow', 1)

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.toast).toBe(
			'A row always spans the full width; drop inside it for a column',
		)
	})

	it('takes a Vertical stack beside its card, as a second column', () => {
		gridWithACard()
		builder.beginDrag({ type: 'VStack' })
		builder.dropAt('grid/gridRow', 1)
		expect(names('grid/gridRow')).toEqual(['text', 'vStack'])

		// What the row itself cannot do, and the reason someone reaches for a
		// column: several blocks, one above the other.
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow/vStack', 0)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow/vStack', 1)
		expect(names('grid/gridRow/vStack')).toEqual(['text', 'text2'])
	})
})

/**
 * What the editor does with "above this cell" and "below this cell" inside a
 * row, which lays its children out side by side and nothing else.
 *
 * `dropping.ts` decides which of the two readings applies; these drive the two
 * placements it asks for and check what the draft holds afterwards.
 */
describe('a column the editor builds around a cell', () => {
	/** A grid whose one row holds two cells: what two drops leave behind. */
	function gridWithTwoCards(): void {
		builder.addBlock('Grid')
		builder.addBlock('Text', 'grid', null)
		builder.addBlock('Text', 'grid/gridRow', null)
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
		expect(names('grid/gridRow/vStack')).toEqual(['text', 'text2'])
	})

	it('puts the block above the cell when that is the band aimed at', () => {
		gridWithTwoCards()
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, above('grid/gridRow/text'))
		expect(names('grid/gridRow/vStack')).toEqual(['text2', 'text'])
	})

	it('names the block that was dropped, never the column built for it', () => {
		gridWithTwoCards()
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, below('grid/gridRow/text'))

		expect(builder.session.value.toast).toBe('Text added')
		expect(builder.session.value.selection).toBe('grid/gridRow/vStack/text2')
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

	it('turns down a row as a column, and leaves the draft alone', () => {
		gridWithTwoCards()
		builder.addBlock('GridRow', 'grid', null)
		const before = JSON.stringify(builder.session.value.draft)

		builder.beginDrag({ path: 'grid/gridRow2' })
		builder.dropAt('grid/gridRow', 0, below('grid/gridRow/text'))

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.toast).toBe(
			'A row always spans the full width; drop inside it for a column',
		)
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
	it('takes five drags, and not one of them places a container', () => {
		builder.setDraft({ blocks: [] })

		// 1 — the grid, dropped on the empty page.
		builder.beginDrag({ type: 'Grid' })
		builder.dropAt(null, 0)
		// 2 — the first block, aimed at the middle of the grid.
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid', 0)
		expect(names('grid/gridRow')).toEqual(['text'])

		// 3 — aimed at the band below that block, which is all its row holds: a
		// row of its own, built by the grid the same way the first one was.
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid', 1)
		expect(names('grid')).toEqual(['gridRow', 'gridRow2'])

		// 4 and 5 — aimed at the right-hand quarter of each block.
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 1)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow2', 1)

		expect(names('grid/gridRow')).toEqual(['text', 'text2'])
		expect(names('grid/gridRow2')).toEqual(['text', 'text2'])
		expect(builder.session.value.toast).toBe('Text added')
	})

	it('reaches the same square through the columns of one single row', () => {
		builder.setDraft({ blocks: [] })

		builder.beginDrag({ type: 'Grid' })
		builder.dropAt(null, 0)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid', 0)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 1)
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

	it('opens a list the block cannot do without as an empty one', () => {
		builder.addBlock('Tab')

		expect(configOf('tab')).toEqual({ items: [] })
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
		builder.addBlock('HStack')
		builder.move('tab/text', 'hStack', 0)

		// A slot left over from the tab set would hide it inside the stack.
		expect(slotOf('hStack/text')).toBe(undefined)
	})
})

describe('leaving the editor', () => {
	it('closes at once when there is nothing to lose', () => {
		builder.leave()

		expect(builder.session.value.active).toBe(false)
	})

	it('asks first when the draft holds changes nobody saved', () => {
		builder.addBlock('Text')
		builder.leave()

		// The draft lives in this session and nowhere else: closing on one is
		// throwing the work away.
		expect(builder.session.value.pendingClose).toBe(true)
		expect(builder.session.value.active, 'and nothing is closed yet').toBe(true)
		expect(names()).toContain('text')
	})

	it('stays when that is the answer', () => {
		builder.addBlock('Text')
		builder.leave()
		builder.stayOpen()

		expect(builder.session.value.pendingClose).toBe(false)
		expect(builder.session.value.active).toBe(true)
	})

	it('asks from the button that opened it, which is the same button', () => {
		registerBuilder()
		const actions = useDmsState<
			Array<{ id: string; onSelect: () => void }>
		>(HEADER_ACTIONS_STATE_KEY, () => [])
		const toggle = actions.value.find((action) => action.id === ACTION_ID)
		builder.addBlock('Text')

		toggle?.onSelect()

		expect(builder.session.value.pendingClose).toBe(true)
		expect(builder.session.value.active).toBe(true)
	})

	it('drops the draft when that is the answer', async () => {
		builder.addBlock('Text')
		builder.leave()
		await builder.resolveClose(false)

		expect(builder.session.value.active).toBe(false)
		expect(backend.calledPaths()).not.toContain(
			'POST /api/builder/page/blocks',
		)
	})

	it('saves first when that is the answer', async () => {
		builder.addBlock('Text')
		builder.leave()
		await builder.resolveClose(true)

		expect(backend.calledPaths()).toContain('POST /api/builder/page/blocks')
		expect(builder.session.value.active).toBe(false)
	})

	it('stays open on a save the module turned down', async () => {
		builder.addBlock('Text')
		backend.save = {
			ok: false,
			error: { code: 'stale', ref: '/reports/sales', currentVersion: 'v9' },
		}
		builder.leave()
		await builder.resolveClose(true)

		// Closing here would drop the draft over a refusal the author has not
		// even read yet.
		expect(builder.session.value.active).toBe(true)
		expect(builder.session.value.conflict).toBe(true)
	})
})

describe('a move the draft refuses', () => {
	it('drops a container into itself without changing anything, and without arming Undo', () => {
		builder.addBlock('HStack')
		builder.addBlock('Text', 'hStack', null)
		const before = JSON.stringify(builder.session.value.draft)
		const historyBefore = builder.session.value.history.length

		builder.beginDrag({ path: 'hStack' })
		builder.dropAt('hStack/text', 0)

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.toast).toBe('A block cannot go inside itself')
		expect(builder.session.value.error).toBe(null)
		// Bar.vue enables Undo on `history.length > 0`; there is nothing to undo.
		expect(builder.session.value.history.length).toBe(historyBefore)
	})

	it('leaves no row behind when the move it built one for is refused', () => {
		builder.addBlock('Grid')
		const before = JSON.stringify(builder.session.value.draft)
		const historyBefore = builder.session.value.history.length

		// A Grid into itself: the row is built first, and the draft then turns the
		// move down. A row left behind would make the page dirty for nothing.
		builder.move('grid', 'grid', 0)

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.history.length).toBe(historyBefore)
	})

	it('pushes no history entry for an edit that changes nothing', () => {
		const historyBefore = builder.session.value.history.length
		// The config already holds this value, so the patch is a no-op.
		builder.patchConfig('title', { content: 'Sales' })
		expect(builder.session.value.history.length).toBe(historyBefore)

		builder.patchConfig('title', { content: 'Revenue' })
		expect(builder.session.value.history.length).toBe(historyBefore + 1)
	})
})

describe('the draft after the preview refuses the page', () => {
	/**
	 * What the module answers for a draft its validation rejects.
	 *
	 * The refusal is one the editor cannot foresee: which types a Grid takes is
	 * in the catalog and read before the drop, but what a row's own metadata may
	 * hold is the module's to judge, and only the preview says so.
	 */
	function refuseGridChild(): void {
		backend.preview = {
			ok: false,
			error: {
				code: 'invalid_config',
				issues: [
					{
						pointer: '/blocks/2/children/0/meta/colSpan',
						message: 'colSpan must be a whole number of columns',
					},
				],
			},
		}
	}

	async function dropRowInAGrid(): Promise<void> {
		builder.addBlock('Grid')
		builder.beginDrag({ type: 'GridRow' })
		builder.dropAt('grid', 0)
		await settle()
	}

	it('keeps the block, keeps the old canvas, and says the page was refused', async () => {
		backend.preview = {
			ok: true,
			data: { components: { title: { componentName: 'DmsText' } }, degraded: [] },
			changes: [],
		}
		builder.addBlock('Text')
		await settle()
		const canvasBefore = JSON.stringify(builder.session.value.preview)

		refuseGridChild()
		await dropRowInAGrid()

		expect(names('grid')).toEqual(['gridRow'])
		expect(
			JSON.stringify(builder.session.value.preview),
			'the canvas still shows the page from before the drop',
		).toBe(canvasBefore)
		expect(builder.session.value.error?.code).toBe('invalid_config')
		expect(builder.session.value.previewState).toBe('refused')
		expect(builder.dirty.value).toBe(true)
	})

	it('words the refusal by block name, without the pointer', async () => {
		refuseGridChild()
		await dropRowInAGrid()

		const error = builder.session.value.error
		expect(error).not.toBe(null)
		const banner = describeError(error!, builder.session.value.draft)
		expect(banner).toContain(
			'grid/gridRow: colSpan must be a whole number of columns',
		)
		expect(banner, 'the JSON pointer is not shown').not.toContain('/blocks/')
	})

	it('flags the refused block in the bar instead of vouching for the page', async () => {
		refuseGridChild()
		await dropRowInAGrid()

		expect(builder.problems.value).toContain('grid/gridRow')
		// Bar.vue shows its green badge only on a 'valid' preview.
		expect(builder.session.value.previewState).not.toBe('valid')
	})

	it('clears the refusal once the page builds again', async () => {
		refuseGridChild()
		await dropRowInAGrid()
		expect(builder.problems.value).toContain('grid/gridRow')

		backend.preview = {
			ok: true,
			data: { components: {}, degraded: [] },
			changes: [],
		}
		builder.remove('grid/gridRow')
		await settle()

		expect(builder.session.value.error).toBe(null)
		expect(builder.session.value.previewState).toBe('valid')
		expect(builder.problems.value).toEqual([])
	})
})

describe('undo, redo and discard', () => {
	it('undoes an insertion and redoes it', () => {
		builder.addBlock('Text')
		expect(names()).toEqual(['title', 'intro', 'text'])
		builder.undo()
		expect(names()).toEqual(['title', 'intro'])
		builder.redo()
		expect(names()).toEqual(['title', 'intro', 'text'])
	})

	it('drops the selection on a block undo has just removed', () => {
		builder.addBlock('Text')
		expect(builder.session.value.selection).toBe('text')
		builder.undo()
		expect(builder.session.value.selection).toBe(null)
		expect(builder.selected.value).toBe(undefined)
		// An empty configuration panel for a block that is gone is no panel at all.
		expect(builder.session.value.view).toBe('library')
	})

	it('keeps a selection the undone step did not touch', () => {
		builder.addBlock('HStack')
		builder.addBlock('Text', 'hStack', null)
		builder.select('hStack')
		builder.remove('hStack/text')
		builder.undo()
		expect(builder.session.value.selection).toBe('hStack')
		expect(builder.session.value.view).toBe('config')
	})

	it('drops the selection on a block redo takes away again', () => {
		builder.addBlock('Text')
		builder.remove('text')
		builder.undo()
		builder.select('text')
		expect(builder.selected.value?.type).toBe('Text')

		builder.redo()
		expect(names()).toEqual(['title', 'intro'])
		expect(builder.session.value.selection).toBe(null)
		expect(builder.session.value.view).toBe('library')
	})

	it('undoes a deletion', () => {
		builder.remove('intro')
		expect(names()).toEqual(['title'])
		builder.undo()
		expect(names()).toEqual(['title', 'intro'])
	})

	it('undoes a move', () => {
		builder.beginDrag({ path: 'intro' })
		builder.dropAt(null, 0)
		expect(names()).toEqual(['intro', 'title'])
		builder.undo()
		expect(names()).toEqual(['title', 'intro'])
	})

	it('discards back to the saved page, and the discard is itself undoable', () => {
		builder.addBlock('Text')
		builder.cancel()
		expect(names()).toEqual(['title', 'intro'])
		expect(builder.dirty.value).toBe(false)
		builder.undo()
		expect(names()).toEqual(['title', 'intro', 'text'])
	})

	it('says nothing, and arms nothing, when a removal removed nothing', () => {
		builder.remove('does-not-exist')
		expect(names()).toEqual(['title', 'intro'])
		expect(builder.session.value.toast).toBe(null)
		expect(builder.session.value.history).toHaveLength(0)
	})

	it('keeps the draft and reports the refusal when the server rejects a save', async () => {
		builder.addBlock('Grid')
		builder.beginDrag({ type: 'GridRow' })
		builder.dropAt('grid', 0)
		backend.save = {
			ok: false,
			error: {
				code: 'invalid_config',
				issues: [
					{
						pointer: '/blocks/2/children/0/meta/colSpan',
						message: 'colSpan must be a whole number of columns',
					},
				],
			},
		}
		await builder.save()

		// The banner the overlay shows — the first time the placement is
		// questioned, several edits after it was made.
		expect(builder.session.value.error?.code).toBe('invalid_config')
		expect(names('grid')).toEqual(['gridRow'])
		expect(builder.dirty.value).toBe(true)
	})

	it('drops the whole history on save, so Undo cannot reach the page before it', async () => {
		builder.addBlock('Text')
		await builder.save()
		expect(builder.session.value.history).toHaveLength(0)
		builder.undo()
		expect(names()).toEqual(['title', 'intro', 'text'])
	})
})

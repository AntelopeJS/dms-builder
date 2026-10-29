import { describe, expect, it } from 'vitest'
import { findNode } from '../app/runtime/draft'
import {
	backend,
	builder,
	paletteTarget,
	paletteClick,
	names,
	row,
	withBlocks,
	beside,
} from './support/builder-placement-harness'

describe('the palette says "click to append"', () => {
	it('appends to the end of the page when nothing is selected', () => {
		paletteClick('Text')
		expect(names()).toEqual(['title', 'intro', 'text'])
		expect(builder.session.value.toast).toBe('Text added')
	})

	it('appends inside the selection when the selection is a container', () => {
		builder.addBlock('Section')
		expect(builder.session.value.selection).toBe('section')
		paletteClick('Text')
		expect(names('section')).toEqual(['text'])
	})

	it('appends beside the selected block when that block is inside a container', () => {
		builder.addBlock('Section')
		builder.addBlock('Text', 'section', null)
		// The user has just clicked the Text inside the section and clicks the
		// palette again, expecting a second block next to it.
		builder.select('section/text')
		expect(paletteTarget(), 'the container holding the selection').toBe('section')
		paletteClick('Text')

		expect(names('section')).toEqual(['text', 'text2'])
		expect(names(), 'and nothing lands at the bottom of the page').toEqual([
			'title',
			'intro',
			'section',
		])
	})

	it('climbs past every block that cannot hold anything', () => {
		withBlocks(row('text', 'text2'))
		builder.select('grid/gridRow/text')
		expect(paletteTarget(), 'a column beside it, in its row').toBe('grid/gridRow')

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
	it('takes two blocks in a container the author placed', () => {
		builder.addBlock('Section')
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('section', 0)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('section', 1)
		expect(names('section')).toEqual(['text', 'text2'])
	})

	it('keeps a stack written by hand, set up to lay its blocks out its own way', () => {
		builder.setDraft({
			blocks: [
				{
					name: 'vStack',
					type: 'VStack',
					config: { alignment: 'center' },
					children: [{ name: 'text', type: 'Text', config: {} }],
				},
			],
		})
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('vStack', 1)
		expect(names('vStack')).toEqual(['text', 'text2'])
	})

	it('takes a block handed to a grid in as a row of its own', () => {
		withBlocks(row('card', 'note'))
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid', 1)

		const grid = builder.session.value.catalog?.blocks.find(
			(block) => block.type === 'Grid',
		)
		expect(grid?.allowedChildren, 'the catalog states the rule').toEqual([
			'GridRow',
		])
		// The rule is honoured instead of being reported: the row is the editor's
		// to build. A row of one block under a row of two is that block, on its
		// own line, and what comes back names the block the user dropped.
		expect(names()).toEqual(['title', 'intro', 'grid', 'text'])
		expect(names('grid')).toEqual(['gridRow'])
		expect(builder.session.value.toast).toBe('Text added')
		expect(builder.session.value.selection).toBe('text')
		expect(builder.session.value.dragging).toBe(null)
	})

	it('takes a block already on the page in the same way', () => {
		withBlocks(row('card', 'note'))
		builder.beginDrag({ path: 'title' })
		builder.dropAt('grid', 1)
		expect(names()).toEqual(['intro', 'grid', 'title'])
	})

	it('turns down a child on a block that takes none', () => {
		builder.beginDrag({ type: 'Text' })
		// `title` is a Text: `container` is false, and the module would answer
		// `block type "Text" takes no child` on the next save.
		builder.dropAt('title', 0)
		expect(names('title')).toEqual([])
		expect(builder.session.value.toast).toBe("Text can't hold other blocks · drop beside it instead")
	})
})

/**
 * The page is a grid its author never sees: putting a block beside another is
 * all it takes for the editor to write the row that holds the two.
 */
describe('a row the editor builds beside a block', () => {
	it('encloses the block aimed at, the drop on the side aimed at', () => {
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0, beside('title'))

		expect(names()).toEqual(['grid', 'intro'])
		expect(names('grid/gridRow')).toEqual(['title', 'text'])
		// What the user dropped is what is reported and what is selected: the
		// scaffolding it needed is not the subject of the gesture.
		expect(builder.session.value.toast).toBe('Text added')
		expect(builder.session.value.selection).toBe('grid/gridRow/text')
	})

	it('puts the drop first when the left flank is the one aimed at', () => {
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0, beside('title', 0))
		expect(names('grid/gridRow')).toEqual(['text', 'title'])
	})

	it('writes the grid the editor always writes, with nothing set on it', () => {
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0, beside('title'))
		expect(findNode(builder.session.value.draft!, 'grid')?.config).toEqual({})
	})

	it('takes a block already on the page in beside it', () => {
		builder.beginDrag({ path: 'intro' })
		builder.dropAt(null, 0, beside('title'))

		expect(names()).toEqual(['grid'])
		expect(names('grid/gridRow')).toEqual(['title', 'intro'])
		expect(builder.session.value.selection).toBe('grid/gridRow/intro')
	})

	it('builds it inside the tab the block was in, and the row takes that tab', () => {
		builder.addBlock('Tab')
		builder.addBlock('Text', 'tab', null)
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('tab', 0, beside('tab/text'))

		const grid = findNode(builder.session.value.draft!, 'tab/grid')
		expect(grid?.slot, 'the row is what sits in the tab now').toBe('tab1')
		expect(names('tab/grid/gridRow')).toEqual(['text', 'text2'])
		expect(
			findNode(builder.session.value.draft!, 'tab/grid/gridRow/text')?.slot,
		).toBe(undefined)
	})

	it('leaves nothing built when a block is moved beside itself', () => {
		const before = JSON.stringify(builder.session.value.draft)
		const historyBefore = builder.session.value.history.length

		builder.move('title', null, 0, beside('title'))

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.history.length).toBe(historyBefore)
	})
})

/**
 * Taking a block back out undoes the layout its placement took: nobody can see
 * a row, so nobody could ever remove one left behind.
 */
describe('the layout the editor takes back', () => {
	it('gives a row back as its block once that block is all it holds', () => {
		withBlocks(row('card', 'note'))
		builder.remove('grid/gridRow/note')

		expect(names()).toEqual(['title', 'intro', 'card'])
		// Named as the page shows it, and offered back from where it is said.
		expect(builder.session.value.toast).toBe('Removed Text')
		expect(builder.session.value.toastUndo).toBe(true)
	})

	it('follows the block it gives back when that block is the one selected', () => {
		withBlocks(row('card', 'note'))
		builder.select('grid/gridRow/card')
		builder.remove('grid/gridRow/note')
		expect(builder.session.value.selection).toBe('card')
	})

	it('dissolves the row a block is moved out of', () => {
		withBlocks(row('card', 'note'))
		builder.move('grid/gridRow/note', null, 0)

		expect(names()).toEqual(['note', 'title', 'intro', 'card'])
		expect(builder.session.value.selection).toBe('note')
	})

	it('gives a column back as its block, with the columns it spanned', () => {
		withBlocks(row('card', 'note'))
		builder.patchMeta('grid/gridRow/card', { colSpan: 2 })
		builder.beginDrag({ type: 'Text' })
		builder.dropAt('grid/gridRow', 0, {
			around: 'grid/gridRow/card',
			type: 'VStack',
			index: 1,
		})
		expect(names('grid/gridRow')).toEqual(['vStack', 'note'])

		builder.remove('grid/gridRow/vStack/text')
		expect(names('grid/gridRow')).toEqual(['card', 'note'])
		expect(findNode(builder.session.value.draft!, 'grid/gridRow/card')?.meta).toEqual(
			{ colSpan: 2 },
		)
	})

	it('lays the blocks of a grid of single rows out one under the other', () => {
		builder.setDraft({
			blocks: [
				{
					name: 'grid',
					type: 'Grid',
					config: {},
					children: ['one', 'two'].map((name) => ({
						name: `${name}Row`,
						type: 'GridRow',
						config: {},
						children: [{ name, type: 'Text', config: {} }],
					})),
				},
			],
		})
		expect(names()).toEqual(['one', 'two'])
	})

	it('removes structure that holds nothing at all', () => {
		builder.setDraft({
			blocks: [
				...builder.session.value.draft!.blocks,
				{ name: 'grid', type: 'Grid', config: {}, children: [] },
				{ name: 'hStack', type: 'HStack', config: { wrap: true }, children: [] },
			],
		})
		expect(names()).toEqual(['title', 'intro'])
	})

	it('names a block it lifts out free of the ones already beside it', () => {
		builder.setDraft({
			blocks: [
				row('title', 'note'),
				{ name: 'title', type: 'Text', config: {} },
			],
		})
		builder.remove('grid/gridRow/note')
		expect(names(), 'the block that was already here keeps its name').toEqual([
			'title2',
			'title',
		])
	})

	it('keeps a stack set up to lay its blocks out its own way', () => {
		builder.setDraft({
			blocks: [
				{
					name: 'vStack',
					type: 'VStack',
					config: { alignment: 'center' },
					children: [{ name: 'card', type: 'Text', config: {} }],
				},
			],
		})
		expect(names('vStack')).toEqual(['card'])
	})

	it('keeps the row around a block kept as written, which is found by its path', async () => {
		// Preservation refers to source already on the page, not a new draft node.
		backend.structure = { ...backend.structure,
			blocks: [
				{
					name: 'grid', path: 'grid', type: 'Grid', editable: true, config: {},
					children: [
						{
							name: 'gridRow',
							path: 'grid/gridRow', editable: true,
							type: 'GridRow',
							config: {},
							children: [{ name: 'legacy', path: 'grid/gridRow/legacy', type: null, editable: false }],
						},
					],
				},
			],
		}
		await builder.open('/reports/sales')
		builder.patchConfig('grid', { gap: '12px' })
		expect(names('grid/gridRow')).toEqual(['legacy'])
	})

	it('takes nothing apart on an edit that changes nothing', () => {
		const before = JSON.stringify(builder.session.value.draft)
		builder.patchConfig('title', { content: 'Sales' })
		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
	})
})

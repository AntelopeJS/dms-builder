import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Canvas from '../app/components/Canvas.vue'
import { withWrappers } from './support/builder-harness'
import {
	byClass,
	fire,
	findAll,
	mount,
	pointerOver,
	textOf,
	walk,
	type TestNode,
} from './support/render'
import {
	backend,
	builder,
	globals,
	openWith,
	block,
	gaps,
	gapAxes,
	receiver,
	into,
	aim,
	letGo,
	names,
} from './support/canvas-drop-harness'

describe('the two axes of a row', () => {
	beforeEach(async () => {
		await openWith(
			[
				block('grid', 'Grid', [
					block('band', 'GridRow', [block('card', 'Text'), block('note', 'Text')]),
				]),
			],
			{
				grid: {
					componentName: 'DmsGrid',
					children: [
						{
							id: 'band',
							component: {
								componentName: 'DmsGridRow',
								children: [
									{ id: 'card', component: { componentName: 'DmsText' } },
									{ id: 'note', component: { componentName: 'DmsText' } },
								],
							},
						},
					],
				},
			},
		)
	})

	it('puts the block in its first column when its left edge is aimed at', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid/band', 5, 50)
		await nextTick()
		expect(receiver(), 'the row is what receives').toBe('grid/band')
		// The canvas names the page: the grid and its row are the editor's own
		// writing, and a name for either would be a word the user never had to
		// learn.
		expect(into(root)?.path).toBe('page')
		expect(gaps(root)).toEqual(['before grid/band/card'])

		letGo(root, 'grid/band')
		expect(names('grid/band')).toEqual(['text', 'card', 'note'])
		expect(names('grid')).toEqual(['band'])
	})

	it('puts it in a last column when its right edge is aimed at', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid/band', 95, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['end of grid/band'])

		letGo(root, 'grid/band')
		expect(names('grid/band')).toEqual(['card', 'note', 'text'])
	})

	it('puts a block above the whole row from its top band', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		// The row is the only one its grid holds, so above it is above the grid.
		aim(root, 'grid/band', 50, 5)
		await nextTick()
		expect(into(root)?.path).toBe('page')
		expect(gaps(root)).toEqual(['before grid'])

		letGo(root, 'grid/band')
		expect(names()).toEqual(['text', 'grid'])
		expect(names('grid/band')).toEqual(['card', 'note'])
	})

	it('drops the block left of the card whose left half is aimed at', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid/band/note', 20, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['before grid/band/note'])

		letGo(root, 'grid/band/note')
		expect(names('grid/band')).toEqual(['card', 'text', 'note'])
	})

	// The palette offers no row, so the gesture left is a row already on the page
	// being dragged onto the flank of another.
	// A grid of two rows, as a page written by hand can hold one: moving one of
	// them is no gesture the canvas offers, but the refusal is still said on
	// the page, which is what is named when the layout receiving is hidden.
	it('says on the page why a row cannot go against the flank of another', async () => {
		await openWith([
			block('grid', 'Grid', [
				block('band', 'GridRow', [block('card', 'Text'), block('note', 'Text')]),
				block('band2', 'GridRow', [block('a', 'Text'), block('b', 'Text')]),
			]),
		])
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ path: 'grid/band2' })
		await nextTick()

		aim(root, 'grid/band', 5, 50)
		await nextTick()
		expect(gaps(root), 'nothing promises a landing').toEqual([])
		expect(receiver()).toBe('grid/band')
		expect(into(root)?.path).toBe('page')
		expect(into(root)?.refused).toBe(true)
		expect(into(root)?.says).toContain('A row always spans the full width')

		letGo(root, 'grid/band')
		expect(names('grid'), 'the row it was dragged from stays put').toEqual([
			'band',
			'band2',
		])
		expect(builder.session.value.toast).toBe(
			'A row always spans the full width; drop inside it for a column',
		)
	})
})

describe('a block that is all its row holds', () => {
	beforeEach(async () => {
		await openWith(
			[block('grid', 'Grid', [block('band', 'GridRow', [block('card', 'Text')])])],
			{
				grid: {
					componentName: 'DmsGrid',
					children: [
						{
							id: 'band',
							component: {
								componentName: 'DmsGridRow',
								children: [{ id: 'card', component: { componentName: 'DmsText' } }],
							},
						},
					],
				},
			},
		)
	})

	it('takes a second column at its right edge, in the row it is in', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid/band/card', 80, 50)
		await nextTick()
		expect(receiver(), 'the row receives, not the grid').toBe('grid/band')
		expect(into(root)?.path, 'and the page is what is named').toBe('page')
		expect(into(root)?.refused, 'and nothing is refused').toBe(false)
		expect(gaps(root)).toEqual(['end of grid/band'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band')).toEqual(['card', 'text'])
		expect(names('grid'), 'no row of its own was built').toEqual(['band'])
	})

	it('lets its row go once a block is put under it', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid/band/card', 50, 95)
		await nextTick()

		letGo(root, 'grid/band/card')
		// Two rows of one block each are two blocks one under the other.
		expect(names()).toEqual(['card', 'text'])
	})
})

/**
 * The four sides of one cell of a grid, aimed at with the pointer.
 *
 * Nothing below places a container: each gesture is a block dropped on a quarter
 * or a band of a block that is already there, and the editor writes whatever
 * structure that reading needs.
 */
describe('the four directions on a cell', () => {
	beforeEach(async () => {
		await openWith(
			[
				block('grid', 'Grid', [
					block('band', 'GridRow', [block('card', 'Text'), block('note', 'Text')]),
				]),
			],
			{ grid: { componentName: 'DmsGrid', children: [] } },
		)
	})

	async function dropOn(x: number, y: number): Promise<TestNode> {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid/band/card', x, y)
		await nextTick()
		return root
	}

	it('puts the block in the column before the cell, from its left quarter', async () => {
		const root = await dropOn(5, 50)
		expect(gaps(root)).toEqual(['before grid/band/card'])
		expect(gapAxes(root), 'a column down its flank').toEqual(['vertical'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band')).toEqual(['text', 'card', 'note'])
	})

	it('puts it in the column after the cell, from its right quarter', async () => {
		const root = await dropOn(95, 50)
		expect(gaps(root)).toEqual(['before grid/band/note'])
		expect(gapAxes(root)).toEqual(['vertical'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band')).toEqual(['card', 'text', 'note'])
	})

	it('puts it above the cell, from the band across its top', async () => {
		const root = await dropOn(50, 5)
		expect(gaps(root)).toEqual(['above grid/band/card'])
		expect(gapAxes(root), 'a band across it, not a column').toEqual([
			'horizontal',
		])

		letGo(root, 'grid/band/card')
		// The row keeps its two columns; the first of them now holds both blocks.
		expect(names('grid/band')).toEqual(['vStack', 'note'])
		expect(names('grid/band/vStack')).toEqual(['text', 'card'])
	})

	it('puts it below the cell, from the band across its bottom', async () => {
		const root = await dropOn(50, 95)
		expect(gaps(root)).toEqual(['below grid/band/card'])
		expect(gapAxes(root)).toEqual(['horizontal'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band/vStack')).toEqual(['card', 'text'])
	})

	it('builds no second column for a cell that already is one', async () => {
		const root = await dropOn(50, 95)
		letGo(root, 'grid/band/card')
		await nextTick()

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid/band/vStack/card', 50, 95)
		await nextTick()
		expect(gaps(root)).toEqual(['before grid/band/vStack/text'])

		letGo(root, 'grid/band/vStack/card')
		expect(names('grid/band/vStack')).toEqual(['card', 'text2', 'text'])
		expect(names('grid/band'), 'still two columns').toEqual(['vStack', 'note'])
	})

	it('opens one place and only one, whichever side is aimed at', async () => {
		const root = await dropOn(50, 5)
		expect(gaps(root)).toHaveLength(1)
		aim(root, 'grid/band/card', 5, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['before grid/band/card'])
		expect(gapAxes(root)).toEqual(['vertical'])
	})
})

describe('two blocks side by side, from an empty page', () => {
	/** The canvas surface itself, which answers for the page. */
	function surface(root: TestNode): TestNode {
		const match = byClass(root, 'overflow-auto')[0]
		if (!match) {
			throw new Error('the canvas rendered no surface')
		}
		return match
	}

	it('takes one gesture per block, and asks for no row of its own', async () => {
		await openWith([])
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		fire(surface(root), 'dragover', pointerOver({}))
		fire(surface(root), 'drop')
		await nextTick()
		expect(names()).toEqual(['text'])

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'text', 90, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['below text'])
		expect(gapAxes(root)).toEqual(['vertical'])
		letGo(root, 'text')
		await nextTick()

		// Two gestures, one per block the user actually wanted, and the second
		// sits beside the first rather than under it.
		expect(names()).toEqual(['grid'])
		expect(names('grid/gridRow')).toEqual(['text', 'text2'])
		expect(builder.session.value.toast).toBe('Text added')
		expect(builder.session.value.selection).toBe('grid/gridRow/text2')
	})
})

/**
 * The whole of it, from an empty page: four blocks in a square.
 *
 * Every step below is one drag aimed at a pixel of the canvas, and what the
 * editor answers is read back off the rendered tree. Nothing is passed to the
 * controller by hand.
 */
describe('a two-by-two layout, built with the pointer', () => {
	function surface(root: TestNode): TestNode {
		const match = byClass(root, 'overflow-auto')[0]
		if (!match) {
			throw new Error('the canvas rendered no surface')
		}
		return match
	}

	/**
	 * What the editor is allowed to say while the user is composing the page.
	 *
	 * The words are the vocabulary the gesture exists to spare them: a user who
	 * reads one on screen has been told the layout is made of parts they now
	 * have to think about.
	 */
	function saysNothingStructural(root: TestNode): void {
		// Comment nodes carry the source's own commentary, which is not on screen.
		const rendered = walk(root)
			.filter((node) => node.kind !== 'comment')
			.map((node) => node.text)
			.join(' ')
		const said = `${rendered} | ${builder.session.value.toast ?? ''}`
		expect(said, said).not.toMatch(/grid|row|stack/i)
	}

	async function dragTextTo(root: TestNode, path: string, x: number, y: number) {
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, path, x, y)
		await nextTick()
		saysNothingStructural(root)
		letGo(root, path)
		await nextTick()
	}

	it('takes four drags, names no structure, and asks for no container', async () => {
		await openWith([], {})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()
		saysNothingStructural(root)

		// 1 — the first block, dropped on the empty page.
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		fire(surface(root), 'dragover', pointerOver({}))
		fire(surface(root), 'drop')
		await nextTick()
		// 2 — aimed at the band below it.
		await dragTextTo(root, 'text', 50, 95)
		expect(names()).toEqual(['text', 'text2'])

		// 3 and 4 — aimed at the right-hand quarter of each block.
		await dragTextTo(root, 'text', 95, 50)
		await dragTextTo(root, 'text2', 95, 50)

		expect(names()).toEqual(['grid', 'grid2'])
		expect(names('grid/gridRow')).toEqual(['text', 'text3'])
		expect(names('grid2/gridRow')).toEqual(['text2', 'text4'])
		expect(builder.session.value.toast).toBe('Text added')
		saysNothingStructural(root)
	})
})

describe('a container the preview has not answered for yet', () => {
	it('still offers a way in, and takes a block through it', async () => {
		// The state right after a stack is added: the draft has it, the debounced
		// preview has not come back for it.
		await openWith([block('row', 'Section')], {})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()
		expect(textOf(root)).toContain('Add a block here')

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		// The way in is still there mid-drag; it used to be hidden exactly then.
		expect(textOf(root)).toContain('Add a block here')

		aim(root, 'row', 50)
		await nextTick()
		expect(into(root)?.path).toBe('row')
		expect(gaps(root)).toEqual(['end of row'])

		letGo(root, 'row')
		await nextTick()
		expect(names('row')).toEqual(['text'])
		// And what it holds is rendered, rather than hidden behind a placeholder.
		expect(findAll(root, (node) => node.props['data-path'] === 'row/text'))
			.toHaveLength(1)
	})

	it("keeps a card's body open beside its head actions and footer, each named", async () => {
		const catalog = withWrappers()
		backend.catalog = {
			...catalog,
			blocks: catalog.blocks.map((entry) =>
				entry.type === 'Card'
					? {
							...entry,
							slots: [
								{ id: 'actions', label: 'Head actions' },
								{ id: 'footer', label: 'Footer' },
							],
						}
					: entry,
			),
		}
		await openWith([block('card', 'Card')], {})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		// Standing in for itself, the card names each region above its way in.
		const text = textOf(root)
		expect(text).toContain('Head actions')
		expect(text).toContain('Footer')
		expect(text.match(/Add a block here/g), 'its two regions and its body').toHaveLength(3)
	})
})

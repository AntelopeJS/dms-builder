import { describe, expect, it } from 'vitest'
import {
	columnAt,
	columnContext,
	draggedType,
	isRowContainer,
	namedHost,
	refusalFor,
	refusalForDrop,
	sameTarget,
	spansFullWidth,
	targetAtBlock,
	targetAtPage,
	wrapperFor,
	zoneAt,
	type PointerBox,
	type Span,
	type ZoneOptions,
} from '../app/runtime/dropping'
import { testCatalog } from './support/builder-harness'
import type { BlockCatalog, PageDraft } from '../app/runtime/types'

/**
 * Where a pointer says a block would land.
 *
 * This is the whole of the decision the canvas draws: which container receives,
 * which place in it, whether a container has to be built for it, and whether the
 * catalog's rules allow it. It is read off the block's own box, so it answers
 * without a page and without a DOM.
 *
 * A block laid out among columns answers on four sides: the quarter to its left
 * and the quarter to its right name the columns beside it, and the bands across
 * its top and bottom the places above and below it. Nothing here asks the user
 * to know what a row is.
 */

const catalog = testCatalog()

/**
 * Four grids and a stack, each one a case the four directions read differently:
 * `board` holds a row of two cells, `sheet` a row of one, `panelled` a row whose
 * first cell is already a column of two.
 */
function draft(): PageDraft {
	return {
		blocks: [
			{ name: 'title', type: 'Text', config: {} },
			{
				name: 'row',
				type: 'HStack',
				config: {},
				children: [
					{ name: 'left', type: 'Text', config: {} },
					{ name: 'right', type: 'Text', config: {} },
				],
			},
			{ name: 'grid', type: 'Grid', config: {}, children: [] },
			{
				name: 'board',
				type: 'Grid',
				config: {},
				children: [
					{
						name: 'band',
						type: 'GridRow',
						config: {},
						children: [
							{ name: 'card', type: 'Text', config: {} },
							{ name: 'note', type: 'Text', config: {} },
						],
					},
				],
			},
			{
				name: 'sheet',
				type: 'Grid',
				config: {},
				children: [
					{
						name: 'only',
						type: 'GridRow',
						config: {},
						children: [{ name: 'cell', type: 'Text', config: {} }],
					},
				],
			},
			{
				name: 'panelled',
				type: 'Grid',
				config: {},
				children: [
					{
						name: 'strip',
						type: 'GridRow',
						config: {},
						children: [
							{
								name: 'column',
								type: 'VStack',
								config: {},
								children: [
									{ name: 'head', type: 'Text', config: {} },
									{ name: 'foot', type: 'Text', config: {} },
								],
							},
							{ name: 'aside', type: 'Text', config: {} },
						],
					},
				],
			},
		],
	}
}

/** A block 100 by 100 at the origin, with the pointer somewhere on it. */
function at(x: number, y = x): PointerBox {
	return { x: span(x), y: span(y) }
}

/** One axis of that box, for the rules that read a single one. */
function span(offset: number, size = 100): Span {
	return { start: 0, size, at: offset }
}

/** A block whose surroundings lay it out among columns, and that holds nothing. */
const CELL: ZoneOptions = { columns: true, inside: false }
/** The same, but able to be aimed into. */
const CELL_CONTAINER: ZoneOptions = { columns: true, inside: true }
/** A block nothing lays out sideways: only above and below mean anything. */
const STACKED: ZoneOptions = { columns: false, inside: false }
const STACKED_CONTAINER: ZoneOptions = { columns: false, inside: true }

function aim(
	path: string,
	box: PointerBox,
	payload: { type?: string; path?: string } = { type: 'Text' },
	page: PageDraft = draft(),
) {
	return targetAtBlock(catalog, page, payload, path, box)
}

describe('the four sides of a block, and its middle', () => {
	it('names the side the pointer is in, on either axis', () => {
		expect(zoneAt(at(5, 50), CELL)).toBe('left')
		expect(zoneAt(at(95, 50), CELL)).toBe('right')
		expect(zoneAt(at(50, 5), CELL)).toBe('top')
		expect(zoneAt(at(50, 95), CELL)).toBe('bottom')
	})

	it('keeps the middle of a container for the container', () => {
		expect(zoneAt(at(50, 50), CELL_CONTAINER)).toBe('inside')
		expect(zoneAt(at(40, 60), CELL_CONTAINER)).toBe('inside')
		expect(zoneAt(at(5, 50), CELL_CONTAINER)).toBe('left')
		expect(zoneAt(at(50, 95), CELL_CONTAINER)).toBe('bottom')
	})

	it('says nothing sideways where nothing lays the block out in columns', () => {
		expect(zoneAt(at(5, 40), STACKED)).toBe('top')
		expect(zoneAt(at(95, 60), STACKED)).toBe('bottom')
		// The halves rule the page has always answered with, unchanged.
		expect(zoneAt(at(50, 49), STACKED)).toBe('top')
		expect(zoneAt(at(50, 51), STACKED)).toBe('bottom')
		expect(zoneAt(at(50, 40), STACKED_CONTAINER)).toBe('inside')
		expect(zoneAt(at(50, 10), STACKED_CONTAINER)).toBe('top')
	})

	it('gives a corner to the edge the pointer is really closer to', () => {
		expect(zoneAt(at(10, 30), CELL)).toBe('left')
		expect(zoneAt(at(30, 10), CELL)).toBe('top')
		expect(zoneAt(at(90, 70), CELL)).toBe('right')
		expect(zoneAt(at(70, 90), CELL)).toBe('bottom')
	})

	it('measures each distance against its own dimension, not in pixels', () => {
		// Ten pixels in from the corner of a wide, shallow cell is a long way down
		// its height and barely anything across its width.
		const wide: PointerBox = { x: span(10, 400), y: span(10, 60) }
		expect(zoneAt(wide, CELL)).toBe('left')
		const tall: PointerBox = { x: span(10, 60), y: span(10, 400) }
		expect(zoneAt(tall, CELL)).toBe('top')
	})

	it('settles an exact tie on the axis the row is composed on', () => {
		expect(zoneAt(at(20, 20), CELL)).toBe('left')
		expect(zoneAt(at(80, 80), CELL)).toBe('right')
	})

	it('answers for a box of no size rather than dividing by it', () => {
		const flat: PointerBox = { x: span(0, 0), y: span(0, 0) }
		expect(zoneAt(flat, STACKED)).toBe('top')
		expect(zoneAt(flat, CELL)).toBe('left')
	})
})

describe('the place among columns a pointer names', () => {
	it('counts the columns the pointer has gone past the middle of', () => {
		expect(columnAt(span(5), [1, 1])).toBe(0)
		expect(columnAt(span(40), [1, 1])).toBe(1)
		expect(columnAt(span(60), [1, 1])).toBe(1)
		expect(columnAt(span(95), [1, 1])).toBe(2)
	})

	it('reads the widths off what each child claims, not off an even share', () => {
		// A child spanning two of three columns reaches two thirds across.
		expect(columnAt(span(30), [2, 1])).toBe(0)
		expect(columnAt(span(40), [2, 1])).toBe(1)
		expect(columnAt(span(90), [2, 1])).toBe(2)
	})

	it('answers the end for a container with nothing to measure against', () => {
		expect(columnAt(span(50), [])).toBe(0)
		expect(columnAt(span(50), [0, 0])).toBe(2)
	})
})

describe('the row a block is laid out in', () => {
	it('is the container beside whose children it sits', () => {
		expect(columnContext(draft(), 'board/band/card')).toEqual({
			row: 'board/band',
			column: 'board/band/card',
		})
		expect(columnContext(draft(), 'row/left')).toEqual({
			row: 'row',
			column: 'row/left',
		})
	})

	it('is found through the column holding the block, which is the cell', () => {
		// `head` is stacked inside a column of the row: the cell beside the row's
		// other cells is that whole column, not the block itself.
		expect(columnContext(draft(), 'panelled/strip/column/head')).toEqual({
			row: 'panelled/strip',
			column: 'panelled/strip/column',
		})
	})

	it('is nothing for a block nothing lays out sideways', () => {
		expect(columnContext(draft(), 'title')).toBe(undefined)
		expect(columnContext(draft(), 'board')).toBe(undefined)
		// A row spans the full width; it is not itself one of anything's columns.
		expect(columnContext(draft(), 'board/band')).toBe(undefined)
	})

	it('stops at a block its container lays out in a slot of its own', () => {
		const page: PageDraft = {
			blocks: [
				{
					name: 'board',
					type: 'Grid',
					config: {},
					children: [
						{
							name: 'band',
							type: 'GridRow',
							config: {},
							children: [
								{
									name: 'tab',
									type: 'Tab',
									config: {},
									children: [
										{ name: 'text', type: 'Text', config: {}, slot: 'tab1' },
									],
								},
							],
						},
					],
				},
			],
		}
		expect(columnContext(page, 'board/band/tab')).toEqual({
			row: 'board/band',
			column: 'board/band/tab',
		})
		expect(columnContext(page, 'board/band/tab/text')).toBe(undefined)
	})
})

describe('aiming at a block nothing lays out sideways', () => {
	it('lands before it, against its own leading edge', () => {
		expect(aim('title', at(10))).toEqual({
			parent: null,
			index: 0,
			anchor: { path: 'title', edge: 'before', axis: 'horizontal' },
		})
	})

	it('lands after it, against its trailing edge', () => {
		expect(aim('title', at(90))).toEqual({
			parent: null,
			index: 1,
			anchor: { path: 'title', edge: 'after', axis: 'horizontal' },
		})
	})

	it('has no inside to aim at when it holds nothing', () => {
		// A Text is not a container: its middle still aims beside it.
		expect(aim('title', at(55))?.parent).toBe(null)
	})

	it('answers nothing for a block that is no longer there', () => {
		expect(aim('gone', at(10))).toBe(null)
	})
})

describe('aiming at a container', () => {
	it('lands beside it from either of its end bands', () => {
		expect(aim('row', at(50, 5))).toEqual({
			parent: null,
			index: 1,
			anchor: { path: 'row', edge: 'before', axis: 'horizontal' },
		})
		expect(aim('row', at(50, 95))).toEqual({
			parent: null,
			index: 2,
			anchor: { path: 'row', edge: 'after', axis: 'horizontal' },
		})
	})

	it('draws the line inside itself when it holds nothing', () => {
		expect(aim('grid', at(50), { type: 'GridRow' })).toEqual({
			parent: 'grid',
			index: 0,
			anchor: { path: 'grid', edge: 'inside', axis: 'horizontal' },
		})
	})

	it('lands at the end of what it holds when it fills the way it is aimed', () => {
		// A Grid stacks its rows downwards, the way the page stacks the Grid: there
		// is no second axis to read a place off.
		expect(aim('board', at(50), { type: 'GridRow' })).toEqual({
			parent: 'board',
			index: 1,
			anchor: { path: 'board/band', edge: 'after', axis: 'horizontal' },
		})
	})

	it('draws the line inside a row that holds nothing yet, down its flank', () => {
		const page = draft()
		const band = page.blocks[3]?.children?.[0]
		if (band) {
			band.children = []
		}
		expect(aim('board/band', at(5, 50), { type: 'Text' }, page)).toEqual({
			parent: 'board/band',
			index: 0,
			anchor: { path: 'board/band', edge: 'inside', axis: 'vertical' },
		})
	})
})

describe('the four directions on a cell of a row', () => {
	it('puts the block in the column before it from its left quarter', () => {
		expect(aim('board/band/card', at(5, 50))).toEqual({
			parent: 'board/band',
			index: 0,
			anchor: {
				path: 'board/band/card',
				edge: 'before',
				axis: 'vertical',
			},
		})
	})

	it('puts it in the column after it from its right quarter', () => {
		expect(aim('board/band/card', at(95, 50))).toEqual({
			parent: 'board/band',
			index: 1,
			anchor: { path: 'board/band/card', edge: 'after', axis: 'vertical' },
		})
	})

	it('puts it above the cell from the band across its top', () => {
		expect(aim('board/band/card', at(50, 5))).toEqual({
			parent: 'board/band',
			index: 0,
			wrap: { around: 'board/band/card', type: 'VStack', index: 0 },
			anchor: {
				path: 'board/band/card',
				edge: 'before',
				axis: 'horizontal',
			},
		})
	})

	it('puts it below the cell from the band across its bottom', () => {
		expect(aim('board/band/card', at(50, 95))).toEqual({
			parent: 'board/band',
			index: 0,
			wrap: { around: 'board/band/card', type: 'VStack', index: 1 },
			anchor: { path: 'board/band/card', edge: 'after', axis: 'horizontal' },
		})
	})

	it('draws the line across the cell one way and down it the other', () => {
		// What the eye has to tell apart: the same cell answers with a rule over
		// its top and a bar at its flank, and each one says what it will do.
		expect(aim('board/band/card', at(50, 5))?.anchor.axis).toBe('horizontal')
		expect(aim('board/band/card', at(5, 50))?.anchor.axis).toBe('vertical')
	})

	it('aims into the cell itself when the cell is a container', () => {
		expect(aim('panelled/strip/column', at(50, 50))).toEqual({
			parent: 'panelled/strip/column',
			index: 1,
			anchor: {
				path: 'panelled/strip/column/head',
				edge: 'after',
				axis: 'horizontal',
			},
		})
	})

	it('gives each corner of the cell to the nearer of the two zones', () => {
		expect(aim('board/band/card', at(8, 20))?.wrap).toBe(undefined)
		expect(aim('board/band/card', at(20, 8))?.wrap).toEqual({
			around: 'board/band/card',
			type: 'VStack',
			index: 0,
		})
	})
})

describe('above and below a cell, which is two different things', () => {
	it('opens a row of its own when the cell is all its row holds', () => {
		// `wrapperFor` then builds the row around the block, the same way it does
		// for the first drop into an empty grid: the grid takes rows and nothing
		// else, and the user is naming a place, not a row.
		expect(aim('sheet/only/cell', at(50, 5))).toEqual({
			parent: 'sheet',
			index: 0,
			anchor: { path: 'sheet/only', edge: 'before', axis: 'horizontal' },
		})
		expect(aim('sheet/only/cell', at(50, 95))).toEqual({
			parent: 'sheet',
			index: 1,
			anchor: { path: 'sheet/only', edge: 'after', axis: 'horizontal' },
		})
	})

	it('encloses the cell in a column when its row carries several', () => {
		expect(aim('board/band/note', at(50, 95))).toEqual({
			parent: 'board/band',
			index: 1,
			wrap: { around: 'board/band/note', type: 'VStack', index: 1 },
			anchor: { path: 'board/band/note', edge: 'after', axis: 'horizontal' },
		})
	})

	it('encloses nothing when the cell already sits in a column', () => {
		// A second column around a block already in one would be scaffolding
		// nobody asked for; the place among that column's children is the answer.
		expect(aim('panelled/strip/column/head', at(50, 95))).toEqual({
			parent: 'panelled/strip/column',
			index: 1,
			anchor: {
				path: 'panelled/strip/column/head',
				edge: 'after',
				axis: 'horizontal',
			},
		})
		expect(aim('panelled/strip/column/foot', at(50, 5))?.wrap).toBe(undefined)
	})

	it('still names a column beside that whole stack from its flank', () => {
		expect(aim('panelled/strip/column/head', at(5, 50))).toEqual({
			parent: 'panelled/strip',
			index: 0,
			anchor: {
				path: 'panelled/strip/column',
				edge: 'before',
				axis: 'vertical',
			},
		})
	})
})

describe('a container that builds its own child around the block', () => {
	it('takes a block a Grid could not hold directly, and refuses nothing', () => {
		expect(aim('grid', at(50))).toEqual({
			parent: 'grid',
			index: 0,
			anchor: { path: 'grid', edge: 'inside', axis: 'horizontal' },
		})
		expect(aim('board/band', at(50, 5))?.refusal).toBe(undefined)
		expect(aim('sheet/only/cell', at(50, 5))?.refusal).toBe(undefined)
	})

	it('names the row it would build, read off the catalog rule', () => {
		expect(wrapperFor(catalog, 'Grid', 'Text')?.type).toBe('GridRow')
		expect(wrapperFor(catalog, 'Grid', 'HStack')?.type).toBe('GridRow')
	})

	it('builds nothing for a block the container already accepts', () => {
		expect(wrapperFor(catalog, 'Grid', 'GridRow')).toBe(undefined)
		expect(wrapperFor(catalog, 'HStack', 'Text')).toBe(undefined)
		expect(wrapperFor(catalog, 'Grid', undefined)).toBe(undefined)
	})

	it('still says what a container takes when no child of its own could hold it', () => {
		// The rule is only dropped where the catalog states a way to honour it.
		expect(refusalFor(albumCatalog(), albums(), 'album', 'HStack')).toBe(
			'Album only accepts Text',
		)
		expect(refusalFor(albumCatalog(), albums(), 'album', 'Text')).toBe(undefined)
	})
})

describe('the container the canvas names for a drop', () => {
	it('is the grid, never the row the grid wrote for itself', () => {
		expect(namedHost(catalog, draft(), 'board/band')).toBe('board')
		expect(namedHost(catalog, draft(), 'board')).toBe('board')
	})

	it('is a container the user did place, column included', () => {
		expect(namedHost(catalog, draft(), 'panelled/strip/column')).toBe(
			'panelled/strip/column',
		)
		expect(namedHost(catalog, draft(), 'row')).toBe('row')
	})

	it('is the page when there is nothing above it to name', () => {
		expect(namedHost(catalog, draft(), null)).toBe(null)
	})
})

describe('a row pushed against the flank of another', () => {
	it('is refused, and says why in one sentence', () => {
		const sideways = aim('board/band', at(5, 50), { type: 'GridRow' })
		expect(sideways?.refusal).toBe(
			'A row always spans the full width; drop inside it for a column',
		)
		expect(aim('board/band', at(95, 50), { type: 'GridRow' })?.refusal).toBe(
			sideways?.refusal,
		)
	})

	it('is refused among the columns of a stack too', () => {
		expect(refusalFor(catalog, draft(), 'row', 'GridRow')).toBe(
			'A row always spans the full width; drop inside it for a column',
		)
		expect(refusalFor(catalog, draft(), 'board', 'GridRow')).toBe(undefined)
	})

	it('is refused as a column built around a cell, for the same reason', () => {
		expect(aim('board/band/card', at(50, 95), { type: 'GridRow' })?.refusal).toBe(
			'A row always spans the full width; drop inside it for a column',
		)
	})

	it('knows which blocks are pinned across their container', () => {
		expect(spansFullWidth('GridRow')).toBe(true)
		expect(spansFullWidth('HStack')).toBe(false)
		expect(spansFullWidth(undefined)).toBe(false)
	})
})

describe('a target the catalog refuses', () => {
	it('refuses a block that is not a container at all', () => {
		expect(refusalFor(catalog, draft(), 'title', 'Text')).toBe(
			'Text takes no child',
		)
	})

	it('refuses a block the builder is keeping as written', () => {
		const page: PageDraft = { blocks: [{ name: 'legacy', preserve: true }] }
		expect(refusalFor(catalog, page, 'legacy', 'Text')).toBe(
			'This block is kept as written',
		)
	})

	it('refuses to put a container inside itself, or inside what it holds', () => {
		expect(aim('row', at(50), { path: 'row' })?.refusal).toBe(
			'A block cannot go inside itself',
		)
		expect(refusalFor(catalog, draft(), 'row/left', 'Text', 'row')).toBe(
			'A block cannot go inside itself',
		)
	})

	it('refuses to enclose a block in a column built inside itself', () => {
		// The row dragged onto the top band of one of its own cells: the column
		// would be built around a block the row is being moved into.
		expect(
			aim('board/band/card', at(50, 5), { path: 'board/band' })?.refusal,
		).toBe('A block cannot go inside itself')
		expect(
			refusalForDrop(
				catalog,
				draft(),
				{
					parent: 'board/band',
					wrap: { around: 'board/band/card', type: 'VStack', index: 0 },
				},
				'Text',
				'board/band/card',
			),
		).toBe('A block cannot go inside itself')
	})

	it('reads the row that would hold the column, not the cell below it', () => {
		const page: PageDraft = {
			blocks: [
				{
					name: 'legacy',
					preserve: true,
					children: [{ name: 'card', type: 'Text', config: {} }],
				},
			],
		}
		expect(
			refusalForDrop(
				catalog,
				page,
				{
					parent: 'legacy',
					wrap: { around: 'legacy/card', type: 'VStack', index: 1 },
				},
				'Text',
			),
		).toBe('This block is kept as written')
	})

	it('takes anything at the page level, and leaves unknown types to the module', () => {
		expect(refusalFor(catalog, draft(), null, 'Text')).toBe(undefined)
		expect(refusalFor(catalog, draft(), 'title', undefined)).toBe(
			'Text takes no child',
		)
		expect(refusalFor(null, draft(), 'grid', 'Text')).toBe(undefined)
	})
})

describe('the page itself', () => {
	it('takes the block at the end, under the last one there', () => {
		expect(targetAtPage(draft())).toEqual({
			parent: null,
			index: 6,
			anchor: { path: 'panelled', edge: 'after', axis: 'horizontal' },
		})
	})

	it('draws the line in its own empty frame when it holds nothing', () => {
		expect(targetAtPage({ blocks: [] })).toEqual({
			parent: null,
			index: 0,
			anchor: { path: null, edge: 'inside', axis: 'horizontal' },
		})
	})
})

describe('what the drag carries', () => {
	it('reads the type off the block being moved', () => {
		expect(draggedType(draft(), { path: 'row/left' })).toBe('Text')
		expect(draggedType(draft(), { type: 'Grid' })).toBe('Grid')
		expect(draggedType(draft(), {})).toBe(undefined)
	})

	it('knows which containers lay their children side by side', () => {
		expect(isRowContainer('HStack')).toBe(true)
		expect(isRowContainer('GridRow')).toBe(true)
		expect(isRowContainer('VStack')).toBe(false)
		expect(isRowContainer(undefined)).toBe(false)
	})

	it('recognises the answer it already holds, so a still pointer redraws nothing', () => {
		const target = aim('title', at(10))
		expect(sameTarget(target, aim('title', at(20)))).toBe(true)
		expect(sameTarget(target, aim('title', at(90)))).toBe(false)
		expect(sameTarget(null, null)).toBe(true)
		expect(sameTarget(target, null)).toBe(false)
	})

	it('tells the two axes of one cell apart, and the column it would build', () => {
		const flank = aim('board/band/card', at(5, 50))
		const above = aim('board/band/card', at(50, 5))
		const below = aim('board/band/card', at(50, 95))
		expect(sameTarget(flank, above)).toBe(false)
		expect(sameTarget(above, below)).toBe(false)
		expect(sameTarget(above, aim('board/band/card', at(50, 10)))).toBe(true)
	})
})

describe('the draft the pointer is read against', () => {
	it('is never touched by aiming at it', () => {
		const page = draft()
		const before = JSON.stringify(page)
		aim('row', at(50), { type: 'Text' }, page)
		aim('grid', at(50), { type: 'Text' }, page)
		aim('board/band', at(5, 50), { type: 'Text' }, page)
		aim('board/band/card', at(50, 95), { type: 'Text' }, page)
		aim('sheet/only/cell', at(50, 5), { type: 'Text' }, page)
		targetAtPage(page)
		// Filling in a missing `children` list here would make the page dirty, and
		// the editor would offer to save a page nobody edited.
		expect(JSON.stringify(page)).toBe(before)
	})
})

/** A catalog whose one container takes a child that can hold nothing itself. */
function albumCatalog(): BlockCatalog {
	const base = testCatalog()
	return {
		...base,
		blocks: [
			...base.blocks,
			{
				type: 'Album',
				componentName: 'DmsAlbum',
				label: 'Album',
				group: 'layout',
				container: true,
				allowedChildren: ['Text'],
				config: {},
				shapeSource: 'test',
			},
		],
	}
}

function albums(): PageDraft {
	return { blocks: [{ name: 'album', type: 'Album', config: {}, children: [] }] }
}

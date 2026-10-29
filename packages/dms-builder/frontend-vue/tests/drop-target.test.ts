import { describe, expect, it } from 'vitest'
import {
	columnAt,
	columnContext,
	namedHost,
	refusalFor,
	wrapperFor,
	zoneAt,
	type PointerBox,
} from '../app/runtime/dropping'
import type { PageDraft } from '../app/runtime/types'
import {
	catalog,
	draft,
	at,
	span,
	CELL,
	CELL_CONTAINER,
	STACKED,
	STACKED_CONTAINER,
	aim,
	albumCatalog,
	albums,
} from './support/drop-target-harness'

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

	/**
	 * Where the two meet, and why it sits where it does.
	 *
	 * A fifth of the way into a tab set is somebody aiming at the tab set: the
	 * column they would get instead is one the block beside it names just as
	 * well, and the tab set narrows to make room for it while they are still
	 * reaching for its middle.
	 */
	it('leaves a container only a narrow band that aims beside it', () => {
		expect(zoneAt(at(20, 50), CELL_CONTAINER)).toBe('inside')
		expect(zoneAt(at(80, 50), CELL_CONTAINER)).toBe('inside')
		expect(zoneAt(at(50, 20), STACKED_CONTAINER)).toBe('inside')
		// Narrow, not gone: the band is still there to be aimed at.
		expect(zoneAt(at(10, 50), CELL_CONTAINER)).toBe('left')
		expect(zoneAt(at(50, 90), STACKED_CONTAINER)).toBe('bottom')
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

	/**
	 * The band that aims beside a container is a handle, not a proportion.
	 *
	 * A share alone meant the bigger a container grew, the wider the moat
	 * around the one place only that container can name: a tab set the height
	 * of the page answered "below the tab set" for the first ninety pixels of
	 * itself, which is where its first tab is.
	 */
	it('stops the band growing with the container past a handle', () => {
		const deep = (at: number): PointerBox => ({
			x: span(200, 400),
			y: span(at, 600),
		})
		expect(zoneAt(deep(40), STACKED_CONTAINER)).toBe('inside')
		expect(zoneAt(deep(20), STACKED_CONTAINER)).toBe('top')
		// A small container keeps the share: a band in pixels would be most of it.
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

describe('aiming at a block that sits on its own', () => {
	it('lands above it from the band across its top', () => {
		expect(aim('title', at(50, 10))).toEqual({
			parent: null,
			index: 0,
			axis: 'horizontal',
		})
	})

	it('lands below it from the band across its bottom', () => {
		expect(aim('title', at(50, 90))).toEqual({
			parent: null,
			index: 1,
			axis: 'horizontal',
		})
	})

	it('builds a row around it from either flank, the drop on the side aimed at', () => {
		expect(aim('title', at(5, 50))).toEqual({
			parent: null,
			index: 0,
			wrap: { around: 'title', type: 'Grid', index: 0 },
			axis: 'vertical',
		})
		expect(aim('title', at(95, 50))?.wrap).toEqual({
			around: 'title',
			type: 'Grid',
			index: 1,
		})
	})

	it('builds that row inside the region of a tab set too', () => {
		const page: PageDraft = {
			blocks: [
				{
					name: 'tab',
					type: 'Tab',
					config: {},
					children: [{ name: 'text', type: 'Text', config: {}, slot: 'tab1' }],
				},
			],
		}
		expect(aim('tab/text', at(95, 50), { type: 'Text' }, page)).toEqual({
			parent: 'tab',
			index: 0,
			wrap: { around: 'tab/text', type: 'Grid', index: 1 },
			axis: 'vertical',
		})
	})

	it('offers no flank on a block kept as written, which stays where it is', () => {
		const page: PageDraft = { blocks: [{ name: 'legacy', preserve: true }] }
		expect(aim('legacy', at(5, 50), { type: 'Text' }, page)?.wrap).toBe(undefined)
	})

	it('offers no flank on structure, which is only what it holds', () => {
		expect(aim('grid', at(5, 50), { type: 'Text' })?.wrap).toBe(undefined)
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
			axis: 'horizontal',
		})
		expect(aim('row', at(50, 95))).toEqual({
			parent: null,
			index: 2,
			axis: 'horizontal',
		})
	})

	it('aims inside itself when it holds nothing', () => {
		expect(aim('grid', at(50), { type: 'GridRow' })).toEqual({
			parent: 'grid',
			index: 0,
			axis: 'horizontal',
		})
	})

	it('lands at the end of what it holds when it fills the way it is aimed', () => {
		// A Grid stacks its rows downwards, the way the page stacks the Grid: there
		// is no second axis to read a place off.
		expect(aim('board', at(50), { type: 'GridRow' })).toEqual({
			parent: 'board',
			index: 1,
			axis: 'horizontal',
		})
	})

	it('fills a row that holds nothing yet along its own flank', () => {
		const page = draft()
		const band = page.blocks[3]?.children?.[0]
		if (band) {
			band.children = []
		}
		expect(aim('board/band', at(5, 50), { type: 'Text' }, page)).toEqual({
			parent: 'board/band',
			index: 0,
			axis: 'vertical',
		})
	})
})

describe('the four directions on a cell of a row', () => {
	it('puts the block in the column before it from its left quarter', () => {
		expect(aim('board/band/card', at(5, 50))).toEqual({
			parent: 'board/band',
			index: 0,
			axis: 'vertical',
		})
	})

	it('puts it in the column after it from its right quarter', () => {
		expect(aim('board/band/card', at(95, 50))).toEqual({
			parent: 'board/band',
			index: 1,
			axis: 'vertical',
		})
	})

	it('puts it above the cell from the band across its top', () => {
		expect(aim('board/band/card', at(50, 5))).toEqual({
			parent: 'board/band',
			index: 0,
			wrap: { around: 'board/band/card', type: 'VStack', index: 0 },
			axis: 'horizontal',
		})
	})

	it('puts it below the cell from the band across its bottom', () => {
		expect(aim('board/band/card', at(50, 95))).toEqual({
			parent: 'board/band',
			index: 0,
			wrap: { around: 'board/band/card', type: 'VStack', index: 1 },
			axis: 'horizontal',
		})
	})

	it('opens a band across the cell one way and a column down it the other', () => {
		// What the eye has to tell apart: the same cell answers with room above
		// it and room beside it, and each one shows what it will do.
		expect(aim('board/band/card', at(50, 5))?.axis).toBe('horizontal')
		expect(aim('board/band/card', at(5, 50))?.axis).toBe('vertical')
	})

	it('aims into the cell itself when the cell is a container', () => {
		expect(aim('panelled/strip/column', at(50, 50))).toEqual({
			parent: 'panelled/strip/column',
			index: 1,
			axis: 'horizontal',
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
			axis: 'horizontal',
		})
		expect(aim('sheet/only/cell', at(50, 95))).toEqual({
			parent: 'sheet',
			index: 1,
			axis: 'horizontal',
		})
	})

	it('encloses the cell in a column when its row carries several', () => {
		expect(aim('board/band/note', at(50, 95))).toEqual({
			parent: 'board/band',
			index: 1,
			wrap: { around: 'board/band/note', type: 'VStack', index: 1 },
			axis: 'horizontal',
		})
	})

	it('encloses nothing when the cell already sits in a column', () => {
		// A second column around a block already in one would be scaffolding
		// nobody asked for; the place among that column's children is the answer.
		expect(aim('panelled/strip/column/head', at(50, 95))).toEqual({
			parent: 'panelled/strip/column',
			index: 1,
			axis: 'horizontal',
		})
		expect(aim('panelled/strip/column/foot', at(50, 5))?.wrap).toBe(undefined)
	})

	it('still names a column beside that whole stack from its flank', () => {
		expect(aim('panelled/strip/column/head', at(5, 50))).toEqual({
			parent: 'panelled/strip',
			index: 0,
			axis: 'vertical',
		})
	})
})

describe('a container that builds its own child around the block', () => {
	it('takes a block a Grid could not hold directly, and refuses nothing', () => {
		expect(aim('grid', at(50))).toEqual({
			parent: 'grid',
			index: 0,
			axis: 'horizontal',
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
			'Album only takes Text',
		)
		expect(refusalFor(albumCatalog(), albums(), 'album', 'Text')).toBe(undefined)
	})
})

describe('the container the canvas names for a drop', () => {
	it('is never the layout the editor writes, row, grid or column', () => {
		expect(namedHost(catalog, draft(), 'board/band')).toBe(null)
		expect(namedHost(catalog, draft(), 'board')).toBe(null)
		expect(namedHost(catalog, draft(), 'panelled/strip/column')).toBe(null)
		expect(namedHost(catalog, draft(), 'row')).toBe(null)
	})

	it('is the container the user did place, however deep the layout in it', () => {
		const page: PageDraft = {
			blocks: [
				{
					name: 'section',
					type: 'Section',
					config: {},
					children: [
						{
							name: 'grid',
							type: 'Grid',
							config: {},
							children: [{ name: 'gridRow', type: 'GridRow', config: {} }],
						},
					],
				},
			],
		}
		expect(namedHost(catalog, page, 'section/grid/gridRow')).toBe('section')
		expect(namedHost(catalog, page, 'section')).toBe('section')
	})

	it('is the page when there is nothing above it to name', () => {
		expect(namedHost(catalog, draft(), null)).toBe(null)
	})
})

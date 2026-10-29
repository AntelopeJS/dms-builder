import { describe, expect, it } from 'vitest'
import {
	draggedType,
	isRowContainer,
	refusalFor,
	refusalForDrop,
	sameTarget,
	spansFullWidth,
	targetAtPage,
} from '../app/runtime/dropping'
import type { PageDraft } from '../app/runtime/types'
import { catalog, draft, at, aim } from './support/drop-target-harness'

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
			"Text can't hold other blocks · drop beside it instead",
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
			"Text can't hold other blocks · drop beside it instead",
		)
		expect(refusalFor(null, draft(), 'grid', 'Text')).toBe(undefined)
	})
})

describe('the page itself', () => {
	it('takes the block at the end, under the last one there', () => {
		expect(targetAtPage(draft())).toEqual({
			parent: null,
			index: 6,
			axis: 'horizontal',
		})
	})

	it('takes the first block when it holds nothing at all', () => {
		expect(targetAtPage({ blocks: [] })).toEqual({
			parent: null,
			index: 0,
			axis: 'horizontal',
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

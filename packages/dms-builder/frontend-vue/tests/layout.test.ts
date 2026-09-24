import { describe, expect, it } from 'vitest'
import { pathOfNode, tidyLayout } from '../app/runtime/layout'
import { testCatalog } from './support/builder-harness'
import type { BlockDraft, PageDraft } from '../app/runtime/types'

/**
 * The layout the editor takes back once a placement no longer needs it.
 *
 * Nobody sees a row or a column, so nobody could remove one left behind: what
 * the page is left with has to be what a user placing the same blocks from
 * scratch would have got.
 */

const catalog = testCatalog()

function text(name: string, extra: Partial<BlockDraft> = {}): BlockDraft {
	return { name, type: 'Text', config: {}, ...extra }
}

function gridRow(name: string, children: BlockDraft[]): BlockDraft {
	return { name, type: 'GridRow', config: {}, children }
}

function grid(name: string, rows: BlockDraft[], extra: Partial<BlockDraft> = {}) {
	return { name, type: 'Grid', config: {}, children: rows, ...extra }
}

function column(name: string, children: BlockDraft[]): BlockDraft {
	return { name, type: 'VStack', config: { alignment: 'stretch' }, children }
}

function tidied(blocks: BlockDraft[]): PageDraft {
	const draft: PageDraft = { blocks }
	tidyLayout(draft, catalog)
	return draft
}

/** The tree as names, nested the way the draft nests them. */
function shape(blocks: BlockDraft[]): unknown[] {
	return blocks.map((block) =>
		block.children?.length ? { [block.name]: shape(block.children) } : block.name,
	)
}

describe('a row the editor wrote', () => {
	it('stays while it holds two blocks side by side', () => {
		const draft = tidied([grid('grid', [gridRow('row', [text('a'), text('b')])])])
		expect(shape(draft.blocks)).toEqual([{ grid: [{ row: ['a', 'b'] }] }])
	})

	it('is the block it holds once that is all it holds, where it stood', () => {
		const draft = tidied([
			text('before'),
			grid('grid', [gridRow('row', [text('a')])]),
			text('after'),
		])
		expect(shape(draft.blocks)).toEqual(['before', 'a', 'after'])
	})

	it('hands the block the region of the tab it sat in', () => {
		const draft = tidied([
			{
				name: 'tab',
				type: 'Tab',
				config: {},
				children: [grid('grid', [gridRow('row', [text('a')])], { slot: 'tab2' })],
			},
		])
		expect(draft.blocks[0]?.children?.[0]).toMatchObject({ name: 'a', slot: 'tab2' })
	})

	it('is a row of its own among the rows of a grid that holds several', () => {
		// Rows of one grid share its columns, so `c` took half the width under
		// `a` and `b`; taken apart, it takes the width a block on its own takes.
		const draft = tidied([
			grid('grid', [
				gridRow('pair', [text('a'), text('b')]),
				gridRow('single', [text('c')]),
				gridRow('trio', [text('d'), text('e'), text('f')]),
			]),
		])
		expect(shape(draft.blocks)).toEqual([
			{ grid: [{ pair: ['a', 'b'] }] },
			'c',
			{ grid2: [{ trio: ['d', 'e', 'f'] }] },
		])
	})

	it('keeps a grid of several rows that is itself a column of a row', () => {
		const nested = grid('inner', [
			gridRow('one', [text('a'), text('b')]),
			gridRow('two', [text('c')]),
		])
		const draft = tidied([grid('grid', [gridRow('row', [nested, text('d')])])])
		expect(shape(draft.blocks)).toEqual([
			{ grid: [{ row: [{ inner: [{ one: ['a', 'b'] }, { two: ['c'] }] }, 'd'] }] },
		])
	})
})

describe('a column the editor wrote', () => {
	it('is the block it holds once that is all it holds, with the columns it spanned', () => {
		const held = column('col', [text('a')])
		held.meta = { colSpan: 2 }
		const draft = tidied([grid('grid', [gridRow('row', [held, text('b')])])])

		expect(shape(draft.blocks)).toEqual([{ grid: [{ row: ['a', 'b'] }] }])
		expect(draft.blocks[0]?.children?.[0]?.children?.[0]?.meta).toEqual({
			colSpan: 2,
		})
	})

	it('stays a column while it holds several blocks beside another', () => {
		const draft = tidied([
			grid('grid', [gridRow('row', [column('col', [text('a'), text('b')]), text('c')])]),
		])
		expect(shape(draft.blocks)).toEqual([
			{ grid: [{ row: [{ col: ['a', 'b'] }, 'c'] }] },
		])
	})

	it('is a run of blocks like any other once nothing sits beside it', () => {
		const draft = tidied([column('col', [text('a'), text('b')]), text('c')])
		expect(shape(draft.blocks)).toEqual(['a', 'b', 'c'])
	})
})

describe('what the editor leaves alone', () => {
	it('a stack set up by hand to lay its blocks out its own way', () => {
		const centred: BlockDraft = {
			name: 'col',
			type: 'VStack',
			config: { alignment: 'center' },
			children: [text('a')],
		}
		expect(shape(tidied([centred]).blocks)).toEqual([{ col: ['a'] }])
	})

	it('a grid set up by hand with a gap of its own', () => {
		const spaced = grid('grid', [gridRow('row', [text('a')])], {
			config: { gap: '3rem' },
		})
		expect(shape(tidied([spaced]).blocks)).toEqual([{ grid: [{ row: ['a'] }] }])
	})

	it('a horizontal stack, which the editor never writes', () => {
		const stack: BlockDraft = {
			name: 'hStack',
			type: 'HStack',
			config: {},
			children: [text('a')],
		}
		expect(shape(tidied([stack]).blocks)).toEqual([{ hStack: ['a'] }])
	})

	it('layout around a block kept as written, which is found by its path', () => {
		const draft = tidied([grid('grid', [gridRow('row', [{ name: 'legacy', preserve: true }])])])
		expect(shape(draft.blocks)).toEqual([{ grid: [{ row: ['legacy'] }] }])
	})

	it('a container the author placed, empty or not', () => {
		const draft = tidied([{ name: 'section', type: 'Section', config: {}, children: [] }])
		expect(shape(draft.blocks)).toEqual(['section'])
	})
})

describe('layout holding nothing', () => {
	it('is removed, however it is set up', () => {
		const draft = tidied([
			text('a'),
			grid('grid', [gridRow('row', [])]),
			{ name: 'hStack', type: 'HStack', config: { wrap: true }, children: [] },
		])
		expect(shape(draft.blocks)).toEqual(['a'])
	})
})

describe('a block lifted out beside another of its name', () => {
	it('is the one renamed, the block already there keeping its own', () => {
		const draft = tidied([grid('grid', [gridRow('row', [text('a')])]), text('a')])
		expect(shape(draft.blocks)).toEqual(['a2', 'a'])
	})
})

describe('the path a block sits at', () => {
	it('is found by the block itself, wherever the tidy moved it', () => {
		const lifted = text('a')
		const draft = tidied([grid('grid', [gridRow('row', [lifted])])])
		expect(pathOfNode(draft, lifted)).toBe('a')
		expect(pathOfNode(draft, text('elsewhere'))).toBe(undefined)
	})
})

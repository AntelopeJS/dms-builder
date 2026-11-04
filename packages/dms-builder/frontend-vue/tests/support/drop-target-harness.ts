import {
	targetAtBlock,
	type PointerBox,
	type Span,
	type ZoneOptions,
} from '../../app/runtime/dropping'
import { testCatalog } from './builder-harness'
import type { BlockCatalog, PageDraft } from '../../app/runtime/types'

/**
 * Where a pointer says a block would land.
 *
 * This is the whole of the decision the canvas draws: which container receives,
 * which place in it, whether a container has to be built for it, and whether the
 * catalog's rules allow it. It is read off the block's own box, so it answers
 * without a page and without a DOM.
 *
 * A block answers on four sides: the quarter to its left and the quarter to its
 * right name the columns beside it, and the bands across its top and bottom the
 * places above and below it. A block nothing lays out in columns yet gains a row
 * the moment one is put beside it. Nothing here asks the user to know what a
 * row is.
 */

export const catalog = testCatalog()

/**
 * Four grids and a stack, each one a case the four directions read differently:
 * `board` holds a row of two cells, `sheet` a row of one, `panelled` a row whose
 * first cell is already a column of two.
 */
export function draft(): PageDraft {
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
export function at(x: number, y = x): PointerBox {
	return { x: span(x), y: span(y) }
}

/** One axis of that box, for the rules that read a single one. */
export function span(offset: number, size = 100): Span {
	return { start: 0, size, at: offset }
}

/** A block whose surroundings lay it out among columns, and that holds nothing. */
export const CELL: ZoneOptions = { columns: true, inside: false }
/** The same, but able to be aimed into. */
export const CELL_CONTAINER: ZoneOptions = { columns: true, inside: true }
/** A block nothing lays out sideways: only above and below mean anything. */
export const STACKED: ZoneOptions = { columns: false, inside: false }
export const STACKED_CONTAINER: ZoneOptions = { columns: false, inside: true }

export function aim(
	path: string,
	box: PointerBox,
	payload: { type?: string; path?: string } = { type: 'Text' },
	page: PageDraft = draft(),
) {
	return targetAtBlock(catalog, page, payload, path, box)
}

/** A catalog whose one container takes a child that can hold nothing itself. */
export function albumCatalog(): BlockCatalog {
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
				configOrigin: 'test',
			},
		],
	}
}

export function albums(): PageDraft {
	return { blocks: [{ name: 'album', type: 'Album', config: {}, children: [] }] }
}

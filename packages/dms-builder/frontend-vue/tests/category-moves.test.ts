import { describe, expect, it } from 'vitest'
import { byCategoryOrder, categoryMoves } from '../app/runtime/categories'
import type { CategorySummary } from '../app/runtime/types'

/**
 * Moving a category one step in the menu writes the fewest places that put it
 * exactly one step away, among its own siblings.
 */

function menuAfter(categories: CategorySummary[], ref: string, delta: -1 | 1): string[] {
	const moves = categoryMoves(categories, ref, delta)
	return categories
		.map((entry) => ({
			...entry,
			order: moves.find((move) => move.ref === entry.ref)?.order ?? entry.order,
		}))
		.sort(byCategoryOrder)
		.map((entry) => entry.displayName)
}

describe('moving a category one step', () => {
	it('swaps two neighbours whose places no other sibling holds, and writes nothing else', () => {
		const categories = [
			{ ref: 'alpha', displayName: 'Alpha', order: 1 },
			{ ref: 'beta', displayName: 'Beta', order: 2 },
			{ ref: 'shop', displayName: 'Shop', order: 10 },
		]

		expect(categoryMoves(categories, 'beta', -1)).toEqual([
			{ ref: 'beta', order: 1 },
			{ ref: 'alpha', order: 2 },
		])
	})

	it('moves exactly one step when a third sibling shares the neighbour place', () => {
		const categories = [
			{ ref: 'zed', displayName: 'Zed', order: 1 },
			{ ref: 'alpha', displayName: 'Alpha', order: 2 },
			{ ref: 'y', displayName: 'Y', order: 2 },
		]

		expect(menuAfter(categories, 'zed', 1)).toEqual(['Alpha', 'Zed', 'Y'])
	})

	it('moves exactly one step among siblings without places', () => {
		const categories = [
			{ ref: 'a', displayName: 'A' },
			{ ref: 'b', displayName: 'B' },
			{ ref: 'c', displayName: 'C', order: 1 },
		]

		expect(menuAfter(categories, 'b', -1)).toEqual(['B', 'A', 'C'])
	})
})

import { describe, expect, it } from 'vitest'
import {
	itemPath,
	itemValue,
	treeRows,
	withItemAdded,
	withItemMoved,
	withItemPatched,
	withoutItem,
} from '../app/runtime/tree-panel'

/**
 * A tree's items, as the simple mode lists them one by one: added, renamed,
 * nested, moved and removed without a line of JSON. Each gets a value of its
 * own, which is how the tree tells apart the items it opens.
 */

const fruits = [
	{
		label: 'Fruits',
		value: 'fruits',
		children: [
			{ label: 'Apples', value: 'apples' },
			{ label: 'Pears', value: 'pears' },
		],
	},
	{ label: 'Vegetables', value: 'vegetables' },
]

describe('the items of a tree', () => {
	it('list each item, the items it holds under it', () => {
		expect(
			treeRows(fruits).map((row) => [row.path.join('.'), row.item.label, row.depth]),
		).toEqual([
			['0', 'Fruits', 0],
			['0.0', 'Apples', 1],
			['0.1', 'Pears', 1],
			['1', 'Vegetables', 0],
		])
	})

	it('take one more at the top, or inside an item, each with a value of its own', () => {
		const more = withItemAdded(fruits, null, 'New item')
		expect(more.at(-1)).toEqual({ label: 'New item', value: 'newItem' })

		const inside = withItemAdded(fruits, [1], 'New sub-item')
		expect(inside[1]).toEqual({
			label: 'Vegetables',
			value: 'vegetables',
			children: [{ label: 'New sub-item', value: 'newSubItem' }],
		})
	})

	it('give an item a value no sibling holds', () => {
		expect(itemValue('Apples', fruits[0]!.children)).toBe('apples2')
		expect(itemValue('!!!', [])).toBe('item')
	})

	it('keep their value when renamed, so what starts open still does', () => {
		const renamed = withItemPatched(fruits, [0, 1], { label: 'Pears (ripe)' })
		expect(renamed[0]!.children![1]).toEqual({ label: 'Pears (ripe)', value: 'pears' })
		expect(itemPath(renamed, [0, 1])).toBe('fruits.pears')
	})

	it('move among their siblings, and no further', () => {
		expect(withItemMoved(fruits, [0, 1], -1)[0]!.children!.map((item) => item.label)).toEqual([
			'Pears',
			'Apples',
		])
		expect(withItemMoved(fruits, [1], 1)).toEqual(fruits)
	})

	it('go with what they hold, and an item left empty holds nothing', () => {
		expect(withoutItem(fruits, [0]).map((item) => item.label)).toEqual(['Vegetables'])
		const emptied = withoutItem(withoutItem(fruits, [0, 0]), [0, 0])
		expect(emptied[0]).toEqual({ label: 'Fruits', value: 'fruits' })
	})

	it('drop an icon set to none', () => {
		const iconed = withItemPatched(fruits, [1], { icon: 'i-ph-carrot' })
		expect(withItemPatched(iconed, [1], { icon: undefined })[1]).toEqual({
			label: 'Vegetables',
			value: 'vegetables',
		})
	})
})

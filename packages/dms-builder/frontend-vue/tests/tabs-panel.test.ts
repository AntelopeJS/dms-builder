import { describe, expect, it } from 'vitest'
import {
	addTab,
	blocksLabel,
	duplicateTab,
	moveTab,
	patchTab,
	removeTab,
	tabLines,
} from '../app/runtime/tabs-panel'
import type { BlockDraft, DynamicSlots } from '../app/runtime/types'

/**
 * A tab set's tabs, as the simple mode's panel edits them. A tab is reached by
 * the region it declares, and the blocks attached to that region are the tab's
 * own: they move with it, are copied with it and go with it.
 */

const SLOTS: DynamicSlots = { optionPath: 'items', idKey: 'slot', labelKey: 'label' }

function tabSet(): BlockDraft {
	return {
		name: 'tabs',
		type: 'Tab',
		config: {
			items: [
				{ slot: 'overview', label: 'Overview', icon: 'i-ph-chart-line-up' },
				{ slot: 'orders', label: 'Orders', badge: 12, shortcut: 'o' },
				{ slot: 'customers', label: 'Customers' },
			],
			color: 'primary',
		},
		children: [
			{ name: 'kpi', type: 'KpiCard', slot: 'overview' },
			{ name: 'chart', type: 'ChartCard', slot: 'overview' },
			{ name: 'table', type: 'TableView', slot: 'orders' },
		],
	}
}

const ids = (block: BlockDraft) => tabLines(block, SLOTS).map((tab) => tab.id)

describe('the tabs of a tab set, one line each', () => {
	it('names each one and counts what it holds', () => {
		expect(tabLines(tabSet(), SLOTS)).toEqual([
			{ id: 'overview', label: 'Overview', icon: 'i-ph-chart-line-up', badge: '', disabled: false, blocks: 2 },
			{ id: 'orders', label: 'Orders', icon: undefined, badge: '12', disabled: false, blocks: 1 },
			{ id: 'customers', label: 'Customers', icon: undefined, badge: '', disabled: false, blocks: 0 },
		])
		expect([0, 1, 2].map(blocksLabel)).toEqual(['Empty', '1 block', '2 blocks'])
	})

	it('reads a badge given as details by its label', () => {
		const block = tabSet()
		patchTab(block, SLOTS, 'orders', { badge: { label: 'New', color: 'error' } })

		expect(tabLines(block, SLOTS)[1]?.badge).toBe('New')
	})
})

describe('a tab edited from its line', () => {
	it('keeps what the advanced view set on it, and drops what is emptied', () => {
		const block = tabSet()
		patchTab(block, SLOTS, 'orders', { label: 'Sales', badge: undefined, disabled: true })

		expect((block.config?.items as unknown[])[1]).toEqual({
			slot: 'orders',
			label: 'Sales',
			shortcut: 'o',
			disabled: true,
		})
	})

	it('adds one at the end, named after its rank', () => {
		const block = tabSet()

		expect(addTab(block, SLOTS)).toBe('tab4')
		expect((block.config?.items as unknown[]).at(-1)).toEqual({ slot: 'tab4', label: 'Tab 4' })
	})
})

describe('a tab duplicated', () => {
	it('lands beside the original, with a copy of each block it holds', () => {
		const block = tabSet()

		expect(duplicateTab(block, SLOTS, 'overview')).toBe('overview-copy')
		expect(ids(block)).toEqual(['overview', 'overview-copy', 'orders', 'customers'])
		expect((block.config?.items as unknown[])[1]).toEqual({
			slot: 'overview-copy',
			label: 'Overview copy',
			icon: 'i-ph-chart-line-up',
		})
		expect(
			block.children?.map((child) => [child.name, child.slot]),
			'named apart from the blocks they copy',
		).toEqual([
			['kpi', 'overview'],
			['chart', 'overview'],
			['table', 'orders'],
			['kpi2', 'overview-copy'],
			['chart2', 'overview-copy'],
		])
	})
})

describe('a tab deleted', () => {
	it('takes the blocks it held with it, which nothing would show', () => {
		const block = tabSet()

		expect(removeTab(block, SLOTS, 'overview')).toBe(true)
		expect(ids(block)).toEqual(['orders', 'customers'])
		expect(block.children?.map((child) => child.name)).toEqual(['table'])
	})
})

describe('a tab dragged onto another', () => {
	it('lands after a tab further down, its blocks still its own', () => {
		const block = tabSet()
		moveTab(block, SLOTS, 'overview', 'orders')

		expect(ids(block)).toEqual(['orders', 'overview', 'customers'])
		expect(tabLines(block, SLOTS)[1]?.blocks).toBe(2)
	})

	it('lands before a tab further up', () => {
		const block = tabSet()
		moveTab(block, SLOTS, 'customers', 'overview')

		expect(ids(block)).toEqual(['customers', 'overview', 'orders'])
	})

	it('stays where it is when dropped on itself', () => {
		const block = tabSet()
		moveTab(block, SLOTS, 'orders', 'orders')

		expect(ids(block)).toEqual(['overview', 'orders', 'customers'])
	})
})

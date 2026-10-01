import { describe, expect, it } from 'vitest'
import { optionGroups } from '../app/runtime/catalog'
import type { BlockTypeDescriptor } from '../app/runtime/types'

/**
 * The cards a block's settings are laid out in, where it has no panel of its
 * own. Every panel starts the same way: what the block reads, then what it
 * shows on the page.
 */
describe('the cards of a block without a panel of its own', () => {
	it('start with its data, then what it shows', () => {
		const kpi = {
			type: 'KpiCard',
			shapeSource: 'test',
			config: {
				title: { type: 'string', ui: { label: 'Title', group: 'content' } },
				color: { type: 'string', optional: true, ui: { label: 'Colour', group: 'appearance' } },
				fetchUrl: { type: 'string', optional: true, ui: { label: 'Data source', group: 'data' } },
			},
		} as BlockTypeDescriptor

		expect(optionGroups(kpi).map((group) => group.label)).toEqual([
			'Data',
			'Content',
			'Appearance',
		])
	})
})

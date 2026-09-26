import { describe, expect, it } from 'vitest'
import { heldBlockOptions } from '../app/runtime/catalog'
import type { OptionSchema } from '../app/runtime/types'

/**
 * The options of a block another one holds — a card's chart — as the panel
 * offers them. The holder supplies some itself, and those do nothing set on
 * the block it holds.
 */

const chart: Record<string, OptionSchema> = {
	title: { type: 'string', optional: true, ui: { group: 'content' } },
	fetchUrl: {
		type: 'string',
		optional: true,
		ui: { widget: 'dataSource', group: 'data' },
	},
	showGrid: {
		type: 'boolean',
		optional: true,
		ui: { widget: 'switch', group: 'appearance' },
	},
	rawCss: { type: 'array', optional: true, ui: { group: 'advanced', widget: 'json' } },
	syncGroup: {
		type: 'string',
		optional: true,
		ui: { group: 'behavior', advanced: true },
	},
	transport: { type: 'string', optional: true, ui: { hidden: true } },
}

const card: OptionSchema = {
	type: 'unknown',
	ui: { widget: 'block', supplies: ['title', 'fetchUrl'] },
}

function keys(entries: Array<[string, OptionSchema]>): string[] {
	return entries.map(([key]) => key)
}

describe('the options of a block another one holds', () => {
	it('leave out what the holder supplies, in either view', () => {
		expect(keys(heldBlockOptions(card, chart, true))).toEqual([
			'showGrid',
			'rawCss',
			'syncGroup',
		])
	})

	it('leave out what a developer sets, in the simple view', () => {
		expect(keys(heldBlockOptions(card, chart, false))).toEqual(['showGrid'])
	})

	it('are all offered under a holder that supplies nothing', () => {
		expect(keys(heldBlockOptions({ type: 'unknown' }, chart, true))).toEqual([
			'title',
			'fetchUrl',
			'showGrid',
			'rawCss',
			'syncGroup',
		])
	})
})

import { describe, expect, it } from 'vitest'
import { chartTypeLabel, heldBlock } from '../app/runtime/chart-card'
import { describeSource } from '../app/runtime/data-source'
import type { ResourceFieldStructure } from '../app/runtime/types'

const FIELDS = [
	{ name: 'amount', label: 'Amount', dataType: { $dataType: 'number' } },
	{ name: 'status', label: 'Status', dataType: { $dataType: 'string' } },
	{ name: 'createdAt', label: 'Created', dataType: { $dataType: 'date' } },
] as ResourceFieldStructure[]

const BOUNDS = [
	{ field: 'createdAt', op: 'ge', value: { $param: { name: 'from' } } },
	{ field: 'createdAt', op: 'le', value: { $param: { name: 'to' } } },
]

describe('what a source measures, in one line', () => {
	it('counts rows split by a column', () => {
		expect(
			describeSource(
				{ name: 'card', resource: 'order', params: { op: 'count', groupBy: 'status' } },
				FIELDS,
			),
		).toBe('Count of order rows, by Status')
	})

	it('sums a column along its dates, under a condition and the page period', () => {
		expect(
			describeSource(
				{
					name: 'card',
					resource: 'order',
					params: {
						op: 'sum',
						field: 'amount',
						groupBy: 'createdAt',
						bucket: 'month',
						where: [{ field: 'status', op: 'eq', value: 'paid' }, ...BOUNDS],
					},
					compare: true,
				},
				FIELDS,
			),
		).toBe(
			"Sum of Amount by month, only where Status is paid, on the page's period, against the one before",
		)
	})

	it('counts conditions it cannot say in a few words', () => {
		expect(
			describeSource(
				{
					name: 'card',
					resource: 'order',
					params: {
						where: [
							{ field: 'status', op: 'eq', value: 'paid' },
							{ field: 'amount', op: 'gt', value: '10' },
						],
					},
				},
				FIELDS,
			),
		).toBe('Count of order rows, 2 conditions')
	})

	it('says nothing of a source with no table', () => {
		expect(describeSource(undefined, FIELDS)).toBeUndefined()
	})
})

describe('a chart held by a card', () => {
	it('is named on its tile without the word every chart carries', () => {
		expect(chartTypeLabel('Line Chart', 'ChartLine')).toBe('Line')
		expect(chartTypeLabel('Heatmap', 'ChartHeatmap')).toBe('Heatmap')
		expect(chartTypeLabel(undefined, 'ChartRadialBar')).toBe('Radial Bar')
	})

	it('reads its type and options, or none', () => {
		expect(heldBlock({ $block: { type: 'ChartLine', config: { smooth: true } } })).toEqual({
			type: 'ChartLine',
			config: { smooth: true },
		})
		expect(heldBlock(undefined)).toEqual({ type: undefined, config: {} })
	})
})

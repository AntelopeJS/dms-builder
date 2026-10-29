import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { findAll, fire, textOf } from './support/render'
import {
	backend,
	builder,
	PREVIEW,
	setMode,
	settle,
	card,
	panel,
	pickTable,
	config,
	draftQuery,
	button,
	control,
	labels,
	fold,
	tiles,
	write,
} from './support/chart-card-panel-harness'

describe('the chart a card draws with', () => {
	it('is picked by how it draws, the common ones first', async () => {
		const root = await panel()

		expect(tiles(root).map((tile) => tile.props.label)).toEqual(['Column', 'Line'])
		expect(textOf(root), 'what the old menu called it').not.toContain('ChartColumn')
		fire(button(root, 'More types: scatter…'), 'click')
		await nextTick()
		expect(tiles(root).map((tile) => tile.props.label)).toEqual(['Column', 'Line', 'Scatter'])

		fire(tiles(root)[1]!, 'click')
		await nextTick()
		expect(config().chart).toEqual({ $block: { type: 'ChartLine', config: {} } })
	})

	it('keeps what the chart was set to when it draws another way', async () => {
		const root = await panel([
			card('chartCard', { chart: { $block: { type: 'ChartColumn', config: { color: 'success' } } } }),
		])
		expect(tiles(root)[0]!.props['aria-pressed']).toBe(true)

		fire(tiles(root)[1]!, 'click')
		await nextTick()
		expect(config().chart).toEqual({ $block: { type: 'ChartLine', config: { color: 'success' } } })
	})
})

describe('what a card measures', () => {
	it('starts the panel, before what the card shows on the page', async () => {
		const root = await panel()
		const titles = findAll(
			root,
			(node) =>
				(node.tag === 'section' && typeof node.props['aria-label'] === 'string') ||
				(node.tag === 'span' && ['Data', 'Headline', 'Look'].includes(textOf(node))),
		).map((node) => (node.tag === 'section' ? String(node.props['aria-label']) : textOf(node)))

		expect(titles.slice(0, 3)).toEqual(['Data', 'On the page', 'Chart'])
	})

	it('folds behind a line saying it, open until closed', async () => {
		const root = await panel()
		expect(fold(root, 'Data').props['aria-expanded']).toBe(true)
		expect(fold(root, 'Headline').props['aria-expanded']).toBe(false)
		expect(fold(root, 'Look').props['aria-expanded']).toBe(false)
		expect(textOf(fold(root, 'Data'))).toContain('Nothing measured yet')

		pickTable(root, 'order')
		await settle()
		write(control(root, 'USelectMenu', 'Split by'), 'status')
		await settle()

		expect(draftQuery()).toMatchObject({ resource: 'order', response: 'card' })
		expect(config().fetchUrl).toBe('/dms/pages/reports/sales/stats/chart-card')
		expect(textOf(fold(root, 'Data'))).toContain('Count of order rows, by Status')
	})

	it('draws no preview of its own: the card on the page shows it', async () => {
		const root = await panel()
		pickTable(root, 'order')
		await settle()
		write(control(root, 'USelectMenu', 'Split by'), 'status')
		await settle()

		expect(findAll(root, (node) => node.tag === 'DmsChart')).toHaveLength(0)
		expect(textOf(root)).not.toContain('Preview')
		expect(
			backend.calls.filter((call) => `${call.method} ${call.path}` === PREVIEW),
			'nothing read for a preview nobody sees',
		).toHaveLength(0)
	})

	it("shows each card's own source, not the one opened before it", async () => {
		const root = await panel([card('chartCard'), card('revenueChart')])
		builder.setDraftQuery({
			name: 'revenueChart',
			resource: 'order',
			template: 'series',
			params: { op: 'sum', field: 'amount', groupBy: 'createdAt', bucket: 'month' },
			response: 'card',
		})
		pickTable(root, 'order')
		await settle()

		builder.select('revenueChart')
		await settle()
		expect(textOf(fold(root, 'Data'))).toContain('Sum of Amount by month')
		expect(control(root, 'USelectMenu', 'Split by').props['model-value']).toBe('createdAt')
	})

	it('follows the page period on a date column, and compares with the one before', async () => {
		const root = await panel()
		pickTable(root, 'order')
		await settle()
		write(control(root, 'USelectMenu', 'Split by'), 'status')
		await settle()

		write(control(root, 'UCheckbox', 'Period'), true)
		await settle()
		expect(
			control(root, 'USelectMenu', 'Column the period bounds').props['model-value'],
			'split by a name, the period falls on the table’s date',
		).toBe('createdAt')

		write(control(root, 'USwitch', 'Compare with the previous period'), true)
		await settle()
		expect(draftQuery()).toMatchObject({
			compare: true,
			params: {
				where: [
					{ field: 'createdAt', op: 'ge', value: { $param: { name: 'from' } } },
					{ field: 'createdAt', op: 'le', value: { $param: { name: 'to' } } },
				],
			},
		})
		expect(config().periodScope).toBe('page')
		expect(textOf(fold(root, 'Data'))).toContain("on the page's period, against the one before")

		write(control(root, 'UCheckbox', 'Period'), false)
		await settle()
		expect(draftQuery()?.compare, 'unticked, the period and its comparison go').toBeUndefined()
		expect(config().periodScope).toBeUndefined()
	})

	it('says when the page’s code answers it, and builds it here only if asked', async () => {
		const root = await panel([card('chartCard', { fetchUrl: '/dms/pages/shop/board/stats/chart-card2' })])

		expect(textOf(fold(root, 'Data'))).toContain("From the page's code")
		expect(textOf(root)).toContain('GET /dms/pages/shop/board/stats/chart-card2')
		expect(findAll(root, (node) => node.props['aria-label'] === 'Tables')).toHaveLength(0)

		fire(button(root, 'Build it here instead'), 'click')
		await nextTick()
		expect(
			findAll(root, (node) => node.props['aria-label'] === 'Tables'),
			'the tables to measure, to pick one from',
		).toHaveLength(1)
		expect(config().fetchUrl, 'nothing written until a table is picked').toBe(
			'/dms/pages/shop/board/stats/chart-card2',
		)
	})
})

describe('the headline figure', () => {
	it('shows a variation only once the source compares', async () => {
		const root = await panel()
		builder.setDraftQuery({
			name: 'chartCard',
			resource: 'order',
			template: 'series',
			params: { op: 'count', groupBy: 'status' },
			response: 'card',
		})
		await nextTick()
		fire(fold(root, 'Headline'), 'click')
		await nextTick()

		expect(control(root, 'USwitch', 'Show the variation').props.disabled).toBe(true)
		expect(textOf(root)).toContain('Needs the comparison with the previous period, in Data.')
		expect(labels(root)).not.toContain('Previous period')

		builder.setDraftQuery({ ...draftQuery()!, compare: true })
		await nextTick()
		expect(control(root, 'USwitch', 'Show the variation').props.disabled).toBe(false)
		write(control(root, 'USwitch', 'Show the variation'), true)
		await nextTick()
		expect(config().showDelta).toBe(true)
		expect(labels(root)).toContain('This period')
		expect(labels(root)).toContain('Previous period')
		expect(textOf(fold(root, 'Headline'))).toContain('variation shown')
	})

	it('asks for the currency once the figure is one', async () => {
		const root = await panel()
		fire(fold(root, 'Headline'), 'click')
		await nextTick()
		expect(labels(root)).not.toContain('In')
		const shownAs = control(root, 'DmsSegmented', 'Shown as')
		expect((shownAs.props.items as { label: string }[]).map((item) => item.label)).toEqual([
			'Number',
			'Currency',
			'Percent',
			'Compact',
		])

		write(shownAs, 'currency')
		await nextTick()
		expect(config().valueFormat).toBe('currency')
		write(control(root, 'UInput', 'In'), 'eur')
		await nextTick()
		expect(config().currencyCode).toBe('EUR')
		expect(textOf(fold(root, 'Headline'))).toContain('Currency in EUR')

		write(control(root, 'DmsSegmented', 'Shown as'), 'number')
		await nextTick()
		expect(config().valueFormat, 'the default is left unwritten').toBeUndefined()
	})
})

describe('how a card looks', () => {
	it('takes a theme colour, its legend and the chart’s own switches', async () => {
		const root = await panel([
			card('chartCard', { chart: { $block: { type: 'ChartColumn', config: {} } } }),
		])
		fire(fold(root, 'Look'), 'click')
		await nextTick()

		fire(button(root, 'success'), 'click')
		await nextTick()
		expect(config().chart).toEqual({ $block: { type: 'ChartColumn', config: { color: 'success' } } })
		expect(textOf(fold(root, 'Look'))).toContain('success')

		expect(control(root, 'USwitch', 'Legend').props['model-value'], 'unset, as the card draws it').toBe(true)
		write(control(root, 'USwitch', 'Legend'), false)
		write(control(root, 'USwitch', 'Grid lines'), true)
		await nextTick()
		expect(config().showLegend, 'turned off for good, not back to the default').toBe(false)
		expect(control(root, 'USwitch', 'Legend').props['model-value']).toBe(false)
		expect(config().chart).toEqual({
			$block: { type: 'ChartColumn', config: { color: 'success', showGrid: true } },
		})
		expect(
			findAll(root, (node) => node.props['aria-label'] === 'Smooth line'),
			'a column has no line to smooth',
		).toHaveLength(0)
	})

	it('keeps the rest of the chart’s options under More options', async () => {
		const root = await panel([
			card('chartCard', { chart: { $block: { type: 'ChartColumn', config: {} } } }),
		])
		fire(fold(root, 'Look'), 'click')
		await nextTick()
		const shown = () =>
			findAll(root, (node) => node.tag === 'label').map((node) => textOf(node))
		expect(shown()).not.toContain('Column width')

		fire(button(root, 'More optionsHeight, width, value range, axes'), 'click')
		await nextTick()
		expect(shown()).toContain('Column width')
		expect(shown()).toContain('Height')
		expect(shown(), 'what the card supplies is not asked twice').not.toContain('Data source')
	})
})

describe('a chart card in the advanced view', () => {
	it('keeps every option as it was', async () => {
		setMode('advanced')
		const root = await panel()
		expect(findAll(root, (node) => node.props['aria-label'] === 'How it draws')).toHaveLength(0)
		expect(findAll(root, (node) => node.tag === 'label').map((node) => textOf(node))).toContain(
			'Value format',
		)
	})
})

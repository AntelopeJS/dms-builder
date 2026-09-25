import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneVNode, h, nextTick, type Component } from 'vue'
import ChartCardPanel from '../app/components/ChartCardPanel.vue'
import Config from '../app/components/Config.vue'
import DataSource from '../app/components/DataSource.vue'
import FoldCard from '../app/components/FoldCard.vue'
import Option from '../app/components/Option.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	findAll,
	fire,
	installDocumentStub,
	mount,
	stub,
	textOf,
	type TestNode,
} from './support/render'
import { useBuilderMode } from '../app/runtime/mode'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type {
	BlockCatalog,
	BlockNode,
	OptionSchema,
	ResourceStructure,
} from '../app/runtime/types'

/**
 * A chart card, as someone building a page sets one up in the simple mode: the
 * chart picked by how it draws, what it measures built from a table, and its
 * headline and look folded away behind a line each.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const RESOURCES = 'GET /api/builder/resources'
const RESOURCE = 'GET /api/builder/resource'
const PREVIEW = 'POST /api/builder/query-preview'
const { setMode } = useBuilderMode()

const CHART_TYPES = ['ChartColumn', 'ChartLine', 'ChartScatter']

const switchOption = (label: string): OptionSchema => ({
	type: 'boolean',
	optional: true,
	ui: { label, group: 'appearance', widget: 'switch' },
})

/** The shape of a chart block the card holds, as `chart-schemas` declares one. */
function chartBlock(type: string, label: string, icon: string, extra: Record<string, OptionSchema>) {
	return {
		type,
		componentName: 'dms-chart',
		label,
		icon,
		group: 'visualization',
		container: false,
		shapeSource: 'test',
		config: {
			title: { type: 'string', optional: true, ui: { label: 'Title', group: 'content' } },
			fetchUrl: { type: 'string', optional: true, ui: { label: 'Data source', group: 'data', widget: 'dataSource' } },
			color: { type: 'string', optional: true, ui: { label: 'Colour', group: 'appearance', widget: 'color' } },
			showTooltip: switchOption('Show tooltip'),
			height: { type: 'string', optional: true, ui: { label: 'Height', group: 'appearance' } },
			...extra,
		} as Record<string, OptionSchema>,
	}
}

/** `ChartCardSchema`, as the catalog reports it. */
function chartCatalog(catalog: BlockCatalog): BlockCatalog {
	const card = {
		type: 'ChartCard',
		componentName: 'dms-chart-card',
		label: 'Chart card',
		icon: 'i-ph-chart-line',
		group: 'visualization',
		container: false,
		shapeSource: 'test',
		config: {
			title: { type: 'string', ui: { label: 'Title', group: 'content' } },
			description: { type: 'string', optional: true, ui: { label: 'Description', group: 'content', widget: 'textarea' } },
			icon: { type: 'string', optional: true, ui: { label: 'Icon', group: 'appearance', widget: 'icon' } },
			chart: {
				type: 'unknown',
				'x-component': true,
				ui: {
					label: 'Chart',
					group: 'data',
					widget: 'block',
					blockTypes: CHART_TYPES,
					supplies: ['title', 'fetchUrl'],
				},
			},
			fetchUrl: {
				type: 'string',
				optional: true,
				ui: { label: 'Data source', group: 'data', widget: 'dataSource', responseShape: 'card', periodOption: 'periodScope' },
			},
			periodScope: { type: 'string', optional: true, ui: { label: 'Period scope', group: 'advanced' } },
			valueFormat: {
				type: 'string',
				optional: true,
				enum: ['number', 'currency', 'percent', 'compact'],
				ui: { label: 'Value format', group: 'appearance', widget: 'segmented' },
			},
			currencyCode: { type: 'string', optional: true, ui: { label: 'Currency', group: 'appearance' } },
			showDelta: switchOption('Show variation'),
			// What the card draws with the option unset.
			showLegend: { ...switchOption('Show legend'), default: true },
			primaryLabel: { type: 'string', optional: true, ui: { label: 'Series label', group: 'content' } },
			comparisonLabel: { type: 'string', optional: true, ui: { label: 'Comparison label', group: 'content' } },
		} as Record<string, OptionSchema>,
	}
	return {
		...catalog,
		blocks: [
			...catalog.blocks.filter((entry) => entry.type !== 'ChartCard'),
			card,
			chartBlock('ChartColumn', 'Column Chart', 'i-ph-chart-bar', {
				showGrid: switchOption('Show grid'),
				roundedCorners: switchOption('Rounded corners'),
				columnWidth: { type: 'number', optional: true, ui: { label: 'Column width', group: 'appearance', widget: 'number' } },
			}),
			chartBlock('ChartLine', 'Line Chart', 'i-ph-chart-line', {
				smooth: switchOption('Smooth'),
			}),
			chartBlock('ChartScatter', 'Scatter Chart', 'i-ph-chart-scatter', {}),
		],
	} as BlockCatalog
}

function orders(): ResourceStructure {
	return {
		ref: 'order',
		className: 'orderDataAPI',
		tableName: 'orders',
		route: '/api/order',
		version: 'v1',
		fields: [
			{ name: 'amount', label: 'Amount', dataType: { $dataType: 'number' } },
			{ name: 'status', label: 'Status', dataType: { $dataType: 'string' } },
			{ name: 'createdAt', label: 'Created', dataType: { $dataType: 'date' } },
		],
	}
}

/**
 * `UCollapsible` as the panel leans on it: its trigger says whether it is open
 * and turns it, and what it holds is there only while it is.
 */
const collapsible: Component = {
	name: 'UCollapsible',
	inheritAttrs: false,
	setup(_props, { slots, attrs }) {
		return () => {
			const open = attrs.open === true
			const turn = attrs['onUpdate:open'] as (open: boolean) => void
			const [trigger] = slots.default?.({ open }) ?? []
			return h('UCollapsible', attrs, [
				...(trigger
					? [cloneVNode(trigger, { 'aria-expanded': open, onClick: () => turn(!open) })]
					: []),
				...(open ? (slots.content?.() ?? []) : []),
			])
		}
	},
}

const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderChartCardPanel: ChartCardPanel as Component,
	DmsBuilderFoldCard: FoldCard as Component,
	DmsBuilderDataSource: DataSource as Component,
	DmsBuilderIconInput: stub('DmsBuilderIconInput'),
	UCollapsible: collapsible,
	UChip: stub('UChip'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

async function settle(): Promise<void> {
	for (let round = 0; round < 4; round += 1) {
		await vi.advanceTimersByTimeAsync(0)
		await nextTick()
	}
}

function card(name: string, config: Record<string, unknown> = {}): BlockNode {
	return { path: name, name, type: 'ChartCard', editable: true, config: { title: 'Orders', ...config } }
}

async function panel(blocks: BlockNode[] = [card('chartCard')]): Promise<TestNode> {
	backend.catalog = chartCatalog(backend.catalog)
	backend.answers[RESOURCES] = [
		{ ref: 'order', className: 'orderDataAPI', tableName: 'orders', route: '/api/order', fieldCount: 3 },
	]
	backend.answers[RESOURCE] = { ok: true, data: orders(), changes: [] }
	backend.structure = { ...backend.structure, blocks }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	builder.select(blocks[0]!.path)
	await vi.advanceTimersByTimeAsync(200)
	const tree = mount(Config, { components: parts() })
	mounted.push(tree.unmount)
	await settle()
	return tree.root
}

function config(name = 'chartCard'): Record<string, unknown> {
	return builder.session.value.draft?.blocks.find((block) => block.name === name)?.config ?? {}
}

function draftQuery(name = 'chartCard') {
	return builder.session.value.draft?.queries?.find((query) => query.name === name)
}

function button(root: TestNode, name: string): TestNode {
	const match = findAll(
		root,
		(node) =>
			(node.tag === 'button' || node.tag === 'UButton') &&
			(node.props['aria-label'] === name || node.props.label === name || textOf(node) === name),
	)[0]
	if (!match) {
		throw new Error(`no button ${name}`)
	}
	return match
}

/** A control by its name: its own label, or the one of the field holding it. */
function control(root: TestNode, tag: string, name: string): TestNode {
	const match = findAll(
		root,
		(node) =>
			node.tag === tag &&
			(node.props['aria-label'] === name ||
				node.props.label === name ||
				(node.parent?.tag === 'UFormField' && node.parent.props.label === name)),
	)[0]
	if (!match) {
		throw new Error(`no ${tag} ${name}`)
	}
	return match
}

/** What the panel's fields are called. */
function labels(root: TestNode): string[] {
	return findAll(root, (node) => node.tag === 'UFormField').map((node) =>
		String(node.props.label),
	)
}

/** A part of the panel that folds, by its title: the button, then what it says. */
function fold(root: TestNode, title: string): TestNode {
	const match = findAll(
		root,
		(node) =>
			node.tag === 'UButton' &&
			node.props['aria-expanded'] !== undefined &&
			textOf(node).startsWith(title),
	)[0]
	if (!match) {
		throw new Error(`no fold ${title}`)
	}
	return match
}

function tiles(root: TestNode): TestNode[] {
	const group = findAll(root, (node) => node.props['aria-label'] === 'How it draws')[0]
	return group ? findAll(group, (node) => node.tag === 'UButton') : []
}

function write(target: TestNode, value: unknown): void {
	const handler = target.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${target.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
	setMode('simple')
})

afterEach(() => {
	for (const unmount of mounted) unmount()
	mounted = []
	builder.close()
	setMode('simple')
	vi.useRealTimers()
})

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
	it('folds behind a line saying it, open until closed', async () => {
		const root = await panel()
		expect(fold(root, 'Data').props['aria-expanded']).toBe(true)
		expect(fold(root, 'Headline').props['aria-expanded']).toBe(false)
		expect(fold(root, 'Look').props['aria-expanded']).toBe(false)
		expect(textOf(fold(root, 'Data'))).toContain('Nothing measured yet')

		write(control(root, 'USelectMenu', 'From'), 'order')
		await settle()
		write(control(root, 'USelectMenu', 'Split by'), 'status')
		await settle()

		expect(draftQuery()).toMatchObject({ resource: 'order', response: 'card' })
		expect(config().fetchUrl).toBe('/reports/sales/stats/chart-card')
		expect(textOf(fold(root, 'Data'))).toContain('Count of order rows, by Status')
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
		write(control(root, 'USelectMenu', 'From'), 'order')
		await settle()

		builder.select('revenueChart')
		await settle()
		expect(textOf(fold(root, 'Data'))).toContain('Sum of Amount by month')
		expect(control(root, 'USelectMenu', 'Split by').props['model-value']).toBe('createdAt')
	})

	it('follows the page period on a date column, and compares with the one before', async () => {
		const root = await panel()
		write(control(root, 'USelectMenu', 'From'), 'order')
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
		const previews = backend.calls.filter((call) => `${call.method} ${call.path}` === PREVIEW)
		expect(
			(previews.at(-1)?.body as { args?: Record<string, unknown> })?.args,
			'the period before is read for the preview too',
		).toHaveProperty('compareFrom')
		expect(textOf(fold(root, 'Data'))).toContain("on the page's period, against the one before")

		write(control(root, 'UCheckbox', 'Period'), false)
		await settle()
		expect(draftQuery()?.compare, 'unticked, the period and its comparison go').toBeUndefined()
		expect(config().periodScope).toBeUndefined()
	})

	it('says when the page’s code answers it, and builds it here only if asked', async () => {
		const root = await panel([card('chartCard', { fetchUrl: '/shop/board/stats/chart-card2' })])

		expect(textOf(fold(root, 'Data'))).toContain("From the page's code")
		expect(textOf(root)).toContain('GET /shop/board/stats/chart-card2')
		expect(findAll(root, (node) => node.props['aria-label'] === 'From')).toHaveLength(0)

		fire(button(root, 'Build it here instead'), 'click')
		await nextTick()
		expect(findAll(root, (node) => node.props['aria-label'] === 'From')).toHaveLength(1)
		expect(config().fetchUrl, 'nothing written until a table is picked').toBe(
			'/shop/board/stats/chart-card2',
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

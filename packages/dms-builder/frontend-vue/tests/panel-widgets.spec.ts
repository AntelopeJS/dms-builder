import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DataSource from '../app/components/DataSource.vue'
import Option from '../app/components/Option.vue'
import {
	findAll,
	fire,
	mount,
	stub,
	textOf,
	type TestNode,
} from './support/render'
import type { OptionSchema, ResourceStructure } from '../app/runtime/types'
import {
	backend,
	builder,
	write,
	settle,
	tableParts,
	pickTable,
} from './support/panel-widgets-harness'

describe('a colour option', () => {
	const schema: OptionSchema = {
		type: 'string',
		optional: true,
		ui: { label: 'Rank colour', widget: 'color' },
	}

	it("offers the theme's colours by name, and still takes any other", async () => {
		const written: unknown[] = []
		const { root } = mount(Option, {
			props: {
				name: 'rankColor',
				schema,
				modelValue: undefined,
				'onUpdate:modelValue': (value: unknown) => written.push(value),
			},
		})
		await nextTick()

		const swatches = findAll(root, (node) => node.tag === 'UButton')
		expect(swatches.map((node) => node.props.label)).toEqual([
			'primary',
			'secondary',
			'success',
			'info',
			'warning',
			'error',
			'neutral',
		])
		fire(swatches[2]!, 'click')
		write(findAll(root, (node) => node.tag === 'UInput')[0]!, '#1f7aec')

		expect(written).toEqual(['success', '#1f7aec'])
	})
})

describe('an icon option', () => {
	const schema: OptionSchema = {
		type: 'string',
		optional: true,
		description: 'Icon name, e.g. `i-ph-trend-up`.',
		ui: { label: 'Icon', widget: 'icon' },
	}

	it("is picked by sight, the way a page's icon is", async () => {
		const written: unknown[] = []
		const { root } = mount(Option, {
			props: {
				name: 'icon',
				schema,
				modelValue: 'i-ph-trend-up',
				'onUpdate:modelValue': (value: unknown) => written.push(value),
			},
			components: { DmsBuilderIconPicker: stub('DmsBuilderIconPicker') },
		})
		await nextTick()

		const picker = findAll(root, (node) => node.tag === 'DmsBuilderIconPicker')[0]!
		expect(picker.props['model-value']).toBe('i-ph-trend-up')
		expect(picker.props.label).toBe('Choose the icon')
		expect(textOf(root), 'no name to type').not.toContain('Icon name, e.g.')

		write(picker, 'i-ph-currency-eur')
		expect(written).toEqual(['i-ph-currency-eur'])
	})
})

describe('a ranking read from a table', () => {
	function orders(): ResourceStructure {
		return {
			ref: 'order',
			className: 'Order',
			tableName: 'orders',
			route: '/api/order',
			version: 'r1',
			fields: [
				{ name: 'country', dataType: { $dataType: 'string' } },
				{ name: 'amount', dataType: { $dataType: 'number' } },
			] as ResourceStructure['fields'],
		}
	}

	function draftQuery(): Record<string, unknown> | undefined {
		return builder.session.value.draft?.queries?.find(
			(query) => query.name === 'topCountries',
		)?.params as Record<string, unknown> | undefined
	}

	it('ranks the groups by what was measured and keeps the first few', async () => {
		backend.answers['GET /api/builder/resources'] = [
			{ ref: 'order', className: 'Order', tableName: 'orders', route: '/api/order', fieldCount: 2 },
		]
		backend.answers['GET /api/builder/resource'] = {
			ok: true,
			data: orders(),
			changes: [],
		}
		backend.answers['POST /api/builder/query-preview'] = {
			ok: true,
			data: { body: { series: [{ x: 'BE', y: 12 }] } },
			changes: [],
		}
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(DataSource, {
			components: tableParts(),
			props: {
				modelValue: undefined,
				responseShape: 'items',
				blockName: 'topCountries',
			},
		})
		await nextTick()

		const picker = (name: string) =>
			findAll(
				root,
				(node) => node.tag === 'USelectMenu' && node.props['aria-label'] === name,
			)[0]!
		const refinement = (name: string) =>
			findAll(
				root,
				(node) => node.tag === 'UCheckbox' && node.props.label === name,
			)[0]!
		pickTable(root, 'order')
		await settle()
		write(picker('Split by'), 'country')
		await settle()

		// Ranking and keeping a few are refinements, ticked to be set.
		write(refinement('Sort'), true)
		write(refinement('Top groups'), true)
		await settle()
		write(picker('Sorted'), 'measure:desc')
		write(
			findAll(
				root,
				(node) => node.tag === 'UInput' && node.props.placeholder === 'all',
			)[0]!,
			'5',
		)
		await settle()

		expect(draftQuery()).toMatchObject({
			groupBy: 'country',
			orderBy: 'measure',
			direction: 'desc',
			limit: 5,
		})
	})

	it('ranks largest first before anyone sorts it, and previews the ranking', async () => {
		backend.answers['GET /api/builder/resources'] = [
			{ ref: 'order', className: 'Order', tableName: 'orders', route: '/api/order', fieldCount: 2 },
		]
		backend.answers['GET /api/builder/resource'] = {
			ok: true,
			data: orders(),
			changes: [],
		}
		backend.answers['POST /api/builder/query-preview'] = {
			ok: true,
			data: { body: { items: [{ id: 'BE', title: 'BE', value: 12 }] } },
			changes: [],
		}
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(DataSource, {
			components: tableParts(),
			props: {
				modelValue: undefined,
				responseShape: 'items',
				blockName: 'topCountries',
			},
		})
		await nextTick()

		pickTable(root, 'order')
		await settle()
		expect(textOf(root), 'what it still waits on').toContain(
			'Choose how to split the rows.',
		)
		write(
			findAll(
				root,
				(node) => node.tag === 'USelectMenu' && node.props['aria-label'] === 'Split by',
			)[0]!,
			'country',
		)
		await settle()

		expect(draftQuery()).toMatchObject({ orderBy: 'measure', direction: 'desc' })
		const sort = findAll(
			root,
			(node) => node.tag === 'UCheckbox' && node.props.label === 'Sort',
		)[0]!
		expect(sort.props['model-value'], 'the default, not a refinement').toBe(false)
		expect(textOf(root)).not.toContain('No rows match.')
		expect(findAll(root, (node) => node.tag === 'DmsChart')).toHaveLength(1)
	})

	it('shows what a source already configured answers when it is reopened', async () => {
		backend.answers['GET /api/builder/resources'] = [
			{ ref: 'order', className: 'Order', tableName: 'orders', route: '/api/order', fieldCount: 2 },
		]
		backend.answers['GET /api/builder/resource'] = {
			ok: true,
			data: orders(),
			changes: [],
		}
		backend.answers['POST /api/builder/query-preview'] = {
			ok: true,
			data: { body: { series: [{ x: 'BE', y: 12 }] } },
			changes: [],
		}
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		builder.setDraftQuery({
			name: 'topCountries',
			resource: 'order',
			template: 'series',
			params: { op: 'count', groupBy: 'country' },
			response: 'items',
		})
		const before = backend.calls.length

		const { root } = mount(DataSource, {
			components: tableParts(),
			props: {
				modelValue: '/dms/pages/reports/sales/stats/top-countries',
				responseShape: 'items',
				blockName: 'topCountries',
			},
		})
		await settle()

		expect(
			backend.calls
				.slice(before)
				.map((call) => `${call.method} ${call.path}`),
		).toContain('POST /api/builder/query-preview')
		expect(textOf(root)).not.toContain('No rows match.')
		const chart = findAll(root, (node) => node.tag === 'DmsChart')[0]
		expect(chart?.props['static-dataset']).toEqual([
			{ name: 'This period', data: [{ x: 'BE', y: 12 }] },
		])
	})

	it('reads the period before for its preview when it compares with it', async () => {
		backend.answers['GET /api/builder/resources'] = [
			{ ref: 'order', className: 'Order', tableName: 'orders', route: '/api/order', fieldCount: 3 },
		]
		const dated = orders()
		dated.fields = [
			...dated.fields,
			{ name: 'createdAt', dataType: { $dataType: 'date' } },
		] as ResourceStructure['fields']
		backend.answers['GET /api/builder/resource'] = { ok: true, data: dated, changes: [] }
		backend.answers['POST /api/builder/query-preview'] = {
			ok: true,
			data: { body: { value: 12, series: [{ x: 'BE', y: 12 }] } },
			changes: [],
		}
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(DataSource, {
			components: tableParts(),
			props: {
				modelValue: undefined,
				responseShape: 'card',
				periodOption: 'periodScope',
				blockName: 'revenueCard',
			},
		})
		await nextTick()
		const control = (tag: string, name: string) =>
			findAll(
				root,
				(node) =>
					node.tag === tag &&
					(node.props['aria-label'] === name || node.props.label === name),
			)[0]!

		pickTable(root, 'order')
		await settle()
		write(control('USelectMenu', 'Split by'), 'country')
		await settle()
		write(control('UCheckbox', 'Period'), true)
		await settle()
		write(control('USwitch', 'Compare with the previous period'), true)
		await settle()

		const previews = backend.calls.filter(
			(call) => `${call.method} ${call.path}` === 'POST /api/builder/query-preview',
		)
		expect(
			(previews.at(-1)?.body as { args?: Record<string, unknown> })?.args,
		).toHaveProperty('compareFrom')
	})

	it('leaves the other sources of the page answering the way they did', async () => {
		backend.structure = {
			...backend.structure,
			queries: [
				{
					name: 'revenueCard',
					endpoint: '/stats/revenue-card',
					resource: 'order',
					template: 'series',
					params: { op: 'count', groupBy: 'country' },
					response: 'card',
				},
			],
		}
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)

		builder.setDraftQuery({
			name: 'topCountries',
			resource: 'order',
			template: 'series',
			params: { op: 'count', groupBy: 'country' },
			response: 'items',
		})

		expect(
			builder.session.value.draft?.queries?.find(
				(query) => query.name === 'revenueCard',
			),
		).toMatchObject({ response: 'card' })
	})
})

describe('an option handed a table', () => {
	// What the catalog reports for a relation's `dataApiController`.
	const schema: OptionSchema = { type: 'unknown', 'x-controller': true }

	async function mountPicker(modelValue: unknown, written: unknown[]) {
		backend.answers['GET /api/builder/resources'] = [
			{ ref: 'order', className: 'Order', tableName: 'orders', route: '/api/order', fieldCount: 2 },
			{ ref: 'customer', className: 'Customer', tableName: 'customers', route: '/api/customer', fieldCount: 3 },
		]
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(Option, {
			props: {
				name: 'dataApiController',
				schema,
				modelValue,
				'onUpdate:modelValue': (value: unknown) => written.push(value),
			},
		})
		await nextTick()
		return root
	}

	it('offers the tables to pick from, and writes a reference to the one picked', async () => {
		const written: unknown[] = []
		const root = await mountPicker(undefined, written)

		const [picker] = findAll(root, (node) => node.tag === 'USelectMenu')
		expect(
			(picker!.props.items as Array<{ value: string }>).map((item) => item.value),
		).toEqual(['order', 'customer'])
		expect(
			findAll(root, (node) => node.tag === 'UTextarea'),
			'no JSON to type a class into',
		).toHaveLength(0)
		expect(
			findAll(root, (node) => node.tag === 'label').map((node) => textOf(node)),
		).toEqual(['Table *'])

		write(picker!, 'customer')
		expect(written).toEqual([{ $ref: { resource: 'customer' } }])
	})

	it('shows the table already written as the one picked', async () => {
		const root = await mountPicker({ $ref: { resource: 'order' } }, [])

		const [picker] = findAll(root, (node) => node.tag === 'USelectMenu')
		expect(picker!.props['model-value']).toBe('order')
	})
})

describe('a block nested in an option', () => {
	it('takes the options a nested data source writes together', async () => {
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		// A chart a card wraps, which can read its own points too.
		builder.session.value.catalog?.blocks.push({
			type: 'ChartLine',
			componentName: 'DmsChartLine',
			label: 'Line Chart',
			group: 'visualization',
			container: false,
			config: {
				fetchUrl: { type: 'string', optional: true, ui: { widget: 'dataSource' } },
				periodScope: { type: 'string', optional: true },
			},
			shapeSource: 'test',
		} as never)
		const written: unknown[] = []
		const { root } = mount(Option, {
			props: {
				name: 'chart',
				schema: {
					type: 'unknown',
					'x-component': true,
					ui: { blockTypes: ['ChartLine'] },
				},
				modelValue: { $block: { type: 'ChartLine', config: { smooth: true } } },
				'onUpdate:modelValue': (value: unknown) => written.push(value),
			},
		})
		await nextTick()

		const [source] = findAll(
			root,
			(node) => node.tag === 'DmsBuilderOption' && node.props.name === 'fetchUrl',
		)
		;(source!.props.onPatch as (patch: Record<string, unknown>) => void)({
			fetchUrl: '/dms/pages/reports/sales/stats/revenue',
			periodScope: 'page',
		})

		// Dropped, the query was saved and the chart never pointed at it.
		expect(written).toEqual([
			{
				$block: {
					type: 'ChartLine',
					config: {
						smooth: true,
						fetchUrl: '/dms/pages/reports/sales/stats/revenue',
						periodScope: 'page',
					},
				},
			},
		])
	})
})

describe('labels keyed by a closed set of values', () => {
	const values = {
		type: 'string',
		enum: ['last-7-days', 'ytd'],
		ui: { valueLabels: { 'last-7-days': 'Last 7 days', ytd: 'Year to date' } },
	} satisfies OptionSchema
	const schema: OptionSchema = {
		type: 'record',
		optional: true,
		keys: values,
		values: { type: 'string' },
		ui: { label: 'Range labels' },
	}

	function labelsPanel(modelValue: unknown, written: unknown[]): TestNode {
		return mount(Option, {
			props: {
				name: 'presetLabels',
				schema,
				modelValue,
				'onUpdate:modelValue': (value: unknown) => written.push(value),
			},
		}).root
	}

	it('offers one box per value, named for whoever builds the page', async () => {
		const written: unknown[] = []
		const root = labelsPanel({ ytd: 'This year' }, written)
		await nextTick()

		const boxes = findAll(root, (node) => node.tag === 'UInput')
		expect(boxes.map((node) => node.props.placeholder)).toEqual([
			'Last 7 days',
			'Year to date',
		])
		expect(boxes.map((node) => node.props['model-value'])).toEqual(['', 'This year'])
		expect(textOf(root)).not.toContain('last-7-days')
		expect(findAll(root, (node) => node.tag === 'UTextarea')).toHaveLength(0)

		write(boxes[0]!, 'Past week')
		expect(written).toEqual([{ ytd: 'This year', 'last-7-days': 'Past week' }])
	})

	it('leaves the option unset once every box is emptied', async () => {
		const written: unknown[] = []
		const root = labelsPanel({ ytd: 'This year' }, written)
		await nextTick()

		write(findAll(root, (node) => node.tag === 'UInput')[1]!, '')
		expect(written).toEqual([undefined])
	})

	it('names the values of a picker the same way', async () => {
		const { root } = mount(Option, {
			props: {
				name: 'defaultPreset',
				schema: { ...values, optional: true, ui: { ...values.ui, widget: 'select' } },
				modelValue: 'ytd',
			},
		})
		await nextTick()

		const [picker] = findAll(root, (node) => node.tag === 'USelectMenu')
		expect(picker!.props.items).toEqual([
			{ label: 'Last 7 days', value: 'last-7-days' },
			{ label: 'Year to date', value: 'ytd' },
		])
	})
})

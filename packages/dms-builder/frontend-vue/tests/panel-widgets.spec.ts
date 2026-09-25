import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import DataSource from '../app/components/DataSource.vue'
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
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { OptionSchema, ResourceStructure } from '../app/runtime/types'

/**
 * Two settings the panel used to leave to typing: a colour, which has names a
 * theme already defines, and how many of a ranking's groups a chart keeps.
 */

let backend: FakeBackend
let builder: BuilderController

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

/** Fire a control's own `update:modelValue`, the way a user's input does. */
function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

async function settle(): Promise<void> {
	for (let round = 0; round < 5; round += 1) {
		await vi.advanceTimersByTimeAsync(0)
	}
	await nextTick()
}

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
		const pill = (name: string) =>
			findAll(
				root,
				(node) =>
					node.tag === 'button' &&
					node.props['aria-pressed'] !== undefined &&
					textOf(node) === name,
			)[0]!
		write(picker('From'), 'order')
		await settle()
		write(picker('Split by'), 'country')
		await settle()

		// Ranking and keeping a few are refinements, ticked to be set.
		fire(pill('Sort'), 'click')
		fire(pill('Top groups'), 'click')
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
			props: {
				modelValue: '/reports/sales/stats/top-countries',
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
		expect(textOf(root)).toContain('BE')
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
			fetchUrl: '/reports/sales/stats/revenue',
			periodScope: 'page',
		})

		// Dropped, the query was saved and the chart never pointed at it.
		expect(written).toEqual([
			{
				$block: {
					type: 'ChartLine',
					config: {
						smooth: true,
						fetchUrl: '/reports/sales/stats/revenue',
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

describe('an entry that is one of two kinds of object', () => {
	const field: OptionSchema = {
		type: 'object',
		properties: { id: { type: 'string' }, type: { type: 'string' } },
	}
	const group: OptionSchema = {
		type: 'object',
		properties: { id: { type: 'string' }, fields: { type: 'array' } },
	}

	function tabs(schema: OptionSchema): unknown[] {
		const { root } = mount(Option, {
			props: { name: 'entry', schema, modelValue: {} },
		})
		return findAll(root, (node) => node.tag === 'UButton').map(
			(node) => node.props.label,
		)
	}

	it('calls each by the name its block gives it', async () => {
		const labels = tabs({
			type: 'union',
			oneOf: [
				{ ...group, ui: { label: 'Group of fields' } },
				{ ...field, ui: { label: 'Field' } },
			],
		})
		await nextTick()
		expect(labels).toEqual(['Group of fields', 'Field'])
	})

	it('tells the two apart when the block names neither', async () => {
		// Both would be "Details", and two tabs saying one word read as one.
		const labels = tabs({ type: 'union', oneOf: [group, field] })
		await nextTick()
		expect(labels).toEqual(['Details 1', 'Details 2'])
	})
})

describe('a value typed as data, such as a field default', () => {
	it('suggests nothing a reader would take for a value', async () => {
		const { root } = mount(Option, {
			props: {
				name: 'defaultValue',
				schema: { type: 'unknown', optional: true, ui: { label: 'Default value', widget: 'json' } },
				modelValue: undefined,
			},
		})
		await nextTick()
		const [box] = findAll(root, (node) => node.tag === 'UTextarea')
		expect(box, 'the box is there').toBeDefined()
		expect(box!.props.placeholder).toBe(undefined)
	})
})

describe('a default typed by the field it belongs to', () => {
	const schema: OptionSchema = {
		type: 'unknown',
		optional: true,
		ui: { label: 'Default value', widget: 'json', typedBy: 'type' },
	}

	function defaultOf(typedAs: unknown, modelValue?: unknown) {
		const written: unknown[] = []
		const { root } = mount(Option, {
			props: {
				name: 'defaultValue',
				schema,
				modelValue,
				typedAs,
				'onUpdate:modelValue': (value: unknown) => written.push(value),
			},
		})
		return { root, written }
	}

	const as = (id: string, config: Record<string, unknown> = {}) => ({
		$dataType: id,
		config,
	})

	it('is a number box for a number, which writes a number', async () => {
		const { root, written } = defaultOf(as('number'), 12)
		await nextTick()
		const [box] = findAll(root, (node) => node.tag === 'UInput')
		expect(box!.props.type).toBe('number')
		expect(box!.props['model-value']).toBe(12)

		write(box!, '42')
		expect(written).toEqual([42])
	})

	it('is a plain text box for text, with no quotes to type', async () => {
		const { root, written } = defaultOf(as('string'))
		await nextTick()
		expect(findAll(root, (node) => node.tag === 'UTextarea')).toHaveLength(0)

		write(findAll(root, (node) => node.tag === 'UInput')[0]!, 'Paris')
		expect(written).toEqual(['Paris'])
	})

	it('is a switch for yes or no', async () => {
		const { root } = defaultOf(as('boolean'), true)
		await nextTick()
		const [toggle] = findAll(root, (node) => node.tag === 'USwitch')
		expect(toggle!.props['model-value']).toBe(true)
	})

	it('is a date input for a date', async () => {
		const { root } = defaultOf(as('date'), '2026-09-24')
		await nextTick()
		const [box] = findAll(root, (node) => node.tag === 'UInput')
		expect(box!.props.type).toBe('date')
		expect(box!.props['model-value']).toBe('2026-09-24')
	})

	it('is a pick among the choices of a list', async () => {
		const { root } = defaultOf(
			as('select', { items: [{ label: 'Paid', value: 'paid' }] }),
			'paid',
		)
		await nextTick()
		const [picker] = findAll(root, (node) => node.tag === 'USelectMenu')
		expect(picker!.props.items).toEqual([{ label: 'Paid', value: 'paid' }])
		expect(picker!.props['model-value']).toBe('paid')
	})

	it('shows nothing for a value of another kind rather than mangling it', async () => {
		const { root } = defaultOf(as('number'), 'twelve')
		await nextTick()
		const [box] = findAll(root, (node) => node.tag === 'UInput')
		expect(box!.props['model-value']).toBe(undefined)
	})

	it('keeps the JSON box for a type with no input of its own', async () => {
		const { root } = defaultOf(as('relation'))
		await nextTick()
		expect(findAll(root, (node) => node.tag === 'UTextarea')).toHaveLength(1)
	})
})

describe('a switch left unset', () => {
	function switchOf(schema: OptionSchema, modelValue: unknown): TestNode {
		const { root } = mount(Option, {
			props: { name: 'delete', schema, modelValue },
		})
		return findAll(root, (node) => node.tag === 'USwitch')[0]!
	}

	// What a table does with no row action set: it offers deleting its rows.
	const offered: OptionSchema = {
		type: 'union',
		default: true,
		ui: { label: 'Deleting data', widget: 'switch' },
	}

	it('reads what the block does without it', async () => {
		const toggle = switchOf(offered, undefined)
		await nextTick()
		expect(toggle.props['model-value']).toBe(true)
	})

	it('reads what it was set to once set', async () => {
		const toggle = switchOf(offered, false)
		await nextTick()
		expect(toggle.props['model-value']).toBe(false)
	})

	it('reads off for a block that does nothing without it', async () => {
		const toggle = switchOf(
			{ type: 'boolean', optional: true, ui: { label: 'Row selection', widget: 'switch' } },
			undefined,
		)
		await nextTick()
		expect(toggle.props['model-value']).toBe(false)
	})
})

describe('an optional range left unset', () => {
	const schema: OptionSchema = {
		type: 'object',
		optional: true,
		ui: { label: 'Y range' },
		properties: {
			min: { type: 'number', ui: { label: 'Min' } },
			max: { type: 'number', ui: { label: 'Max' } },
		},
	}

	it('does not say the page is missing its bounds', async () => {
		const { root } = mount(Option, {
			props: { name: 'yRange', schema, modelValue: undefined },
			components: { DmsBuilderOption: Option as Component },
		})
		await nextTick()
		expect(textOf(root)).not.toContain('cannot be built')
	})

	it('says so once one bound is set without the other', async () => {
		const { root } = mount(Option, {
			props: { name: 'yRange', schema, modelValue: { min: 0 } },
			components: { DmsBuilderOption: Option as Component },
		})
		await nextTick()
		expect(textOf(root)).toContain('cannot be built')
	})
})

describe('a chart a card holds', () => {
	it('offers none of the settings the card supplies itself', async () => {
		backend.catalog = {
			...backend.catalog,
			blocks: [
				...backend.catalog.blocks,
				{
					type: 'ChartLine',
					componentName: 'DmsChart',
					label: 'Line chart',
					group: 'visualization',
					container: false,
					shapeSource: 'test',
					config: {
						fetchUrl: {
							type: 'string',
							optional: true,
							ui: { label: 'Data source', widget: 'dataSource' },
						},
						showGrid: {
							type: 'boolean',
							optional: true,
							ui: { label: 'Show grid', widget: 'switch' },
						},
					},
				},
			],
		}
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)

		const { root } = mount(Option, {
			props: {
				name: 'chart',
				schema: {
					type: 'unknown',
					'x-component': true,
					ui: {
						label: 'Chart',
						widget: 'block',
						blockTypes: ['ChartLine'],
						supplies: ['fetchUrl'],
					},
				},
				modelValue: { $block: { type: 'ChartLine', config: {} } },
			},
			components: {
				DmsBuilderOption: Option as Component,
				DmsBuilderDataSource: stub('DmsBuilderDataSource'),
			},
		})
		await nextTick()

		expect(textOf(root)).toContain('Show grid')
		expect(textOf(root)).not.toContain('Data source')
	})
})

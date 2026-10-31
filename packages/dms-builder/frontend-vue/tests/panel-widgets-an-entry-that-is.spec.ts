import { describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Option from '../app/components/Option.vue'
import { findAll, mount, stub, textOf, type TestNode } from './support/render'
import type { OptionSchema } from '../app/runtime/types'
import { backend, builder, write } from './support/panel-widgets-harness'

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
					configOrigin: 'test',
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

describe('a setting of an object left unset', () => {
	const schema: OptionSchema = {
		type: 'object',
		optional: true,
		ui: { label: 'Empty state' },
		properties: {
			title: { type: 'string', ui: { label: 'Title' } },
			description: { type: 'string', optional: true, ui: { label: 'Description' } },
		},
	}

	const stars = (root: TestNode) =>
		findAll(root, (node) => node.props.title === 'Required')

	it('is not marked required while nothing asks for it', async () => {
		const { root } = mount(Option, {
			props: { name: 'emptyState', schema, modelValue: undefined },
			components: { DmsBuilderOption: Option as Component },
		})
		await nextTick()
		expect(stars(root)).toHaveLength(0)
	})

	it('is marked once the object is set', async () => {
		const { root } = mount(Option, {
			props: { name: 'emptyState', schema, modelValue: { description: 'Soon' } },
			components: { DmsBuilderOption: Option as Component },
		})
		await nextTick()
		expect(stars(root)).toHaveLength(1)
	})
})

describe('a choice read as words', () => {
	it('names sizes as letters and draws tones in their colour', async () => {
		const sizes = mount(Option, {
			props: {
				name: 'size',
				schema: { type: 'string', enum: ['xs', 'sm', 'md'], ui: { label: 'Size' } },
				modelValue: 'sm',
			},
		})
		await nextTick()
		const segmented = findAll(sizes.root, (node) => node.tag === 'DmsSegmented')[0]!
		expect(
			(segmented.props.items as Array<{ label: string }>).map((item) => item.label),
		).toEqual(['XS', 'S', 'M'])

		const tones = mount(Option, {
			props: {
				name: 'tone',
				schema: {
					type: 'string',
					enum: ['neutral', 'primary', 'warning', 'error', 'muted'],
					ui: { label: 'Tone', widget: 'select' },
				},
				modelValue: undefined,
			},
		})
		await nextTick()
		const select = findAll(tones.root, (node) => node.tag === 'USelectMenu')[0]!
		expect(select.props.items).toEqual([
			{ label: 'Neutral', value: 'neutral', chip: { color: 'neutral' } },
			{ label: 'Primary', value: 'primary', chip: { color: 'primary' } },
			{ label: 'Warning', value: 'warning', chip: { color: 'warning' } },
			{ label: 'Error', value: 'error', chip: { color: 'error' } },
			{ label: 'Muted', value: 'muted' },
		])
	})

	it('draws the words its help quotes from code as code', async () => {
		const { root } = mount(Option, {
			props: {
				name: 'size',
				schema: {
					type: 'string',
					optional: true,
					description: '`sm` is the compact one-line banner.',
					ui: { label: 'Size', widget: 'text' },
				},
				modelValue: undefined,
			},
		})
		await nextTick()
		const code = findAll(root, (node) => node.tag === 'code')
		expect(code.map((node) => textOf(node))).toEqual(['sm'])
		expect(textOf(root)).not.toContain('`')
	})
})

describe('a link to another page', () => {
	const schema: OptionSchema = {
		type: 'string',
		optional: true,
		ui: { label: 'Link', widget: 'url' },
	}

	function pages(): void {
		builder.session.value.pages = [
			{ ref: '/shop/orders', id: 'orders', displayName: 'Orders', category: 'pages.shop', filepath: '' },
		]
	}

	it('is picked among the pages by name, which writes the address', async () => {
		pages()
		const written: unknown[] = []
		const { root } = mount(Option, {
			props: {
				name: 'to',
				schema,
				modelValue: undefined,
				'onUpdate:modelValue': (value: unknown) => written.push(value),
			},
		})
		await nextTick()
		const menu = findAll(root, (node) => node.tag === 'UDropdownMenu')[0]!
		const items = menu.props.items as Array<{ label: string; onSelect: () => void }>
		expect(items.map((item) => item.label)).toEqual(['Orders'])
		items[0]!.onSelect()
		expect(written).toEqual(['/shop/orders'])
	})

	it('names the page it leads to, and still takes an address typed', async () => {
		pages()
		const { root } = mount(Option, {
			props: { name: 'to', schema, modelValue: '/shop/orders' },
		})
		await nextTick()
		expect(textOf(root)).toContain('Leads to Orders')
		expect(findAll(root, (node) => node.tag === 'UInput')).toHaveLength(1)
	})

	it('is not offered for a route the page calls', async () => {
		pages()
		const { root } = mount(Option, {
			props: { name: 'submitUrl', schema, modelValue: undefined },
		})
		await nextTick()
		expect(findAll(root, (node) => node.tag === 'UDropdownMenu')).toHaveLength(0)
	})
})

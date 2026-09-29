import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Component } from 'vue'
import Config from '../app/components/Config.vue'
import FormFieldDetail from '../app/components/FormFieldDetail.vue'
import FormFields from '../app/components/FormFields.vue'
import FormPanel from '../app/components/FormPanel.vue'
import FormTarget from '../app/components/FormTarget.vue'
import TablePicker from '../app/components/TablePicker.vue'
import Option from '../app/components/Option.vue'
import OnThePage from '../app/components/OnThePage.vue'
import SubmitSettings from '../app/components/SubmitSettings.vue'
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
import type { ResourceStructure } from '../app/runtime/types'

/**
 * A form, as someone building a page sets one up in the simple mode: it saves
 * into a table they pick, asks for the columns they keep, and says what it
 * says once it is sent. No address is typed, and no key.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const RESOURCES = 'GET /api/builder/resources'
const RESOURCE = 'GET /api/builder/resource'
const { setMode } = useBuilderMode()

function summary(ref: string) {
	return {
		ref,
		className: `${ref}DataAPI`,
		tableName: `${ref}s`,
		route: `/api/${ref}`,
		fieldCount: 4,
	}
}

function orders(extra: Partial<ResourceStructure> = {}): ResourceStructure {
	return {
		ref: 'order',
		className: 'orderDataAPI',
		tableName: 'orders',
		route: '/api/order',
		version: 'v1',
		routes: ['list', 'get', 'create'],
		fields: [
			{ name: '_id', access: 'read', dataType: { $dataType: 'string' } },
			{
				name: 'amount',
				label: 'Amount',
				access: 'readwrite',
				required: true,
				dataType: { $dataType: 'number' },
			},
			{
				name: 'status',
				label: 'Status',
				access: 'readwrite',
				dataType: { $dataType: 'string' },
			},
			{
				name: 'note',
				label: 'Note',
				access: 'readwrite',
				dataType: { $dataType: 'rich_text' },
			},
		],
		...extra,
	}
}

/** A form bound to the orders, asking for amount and status. */
const BOUND = {
	submitUrl: '/api/order/new',
	submitUrlMethod: 'POST',
	fields: [
		{ id: 'amount', label: 'Amount', type: { $dataType: 'number' }, required: true },
		{ id: 'status', label: 'Status', type: { $dataType: 'string' } },
	],
}

/**
 * `UAlert`, its `actions` drawn as the buttons they are: the default stand-in
 * keeps them as a prop, where no click reaches them.
 */
const alert: Component = {
	name: 'UAlert',
	inheritAttrs: false,
	setup(_props, { attrs, slots }) {
		return () =>
			h('UAlert', attrs, [
				...Object.entries(slots).map(([id, render]) => h(`slot:${id}`, render?.() ?? [])),
				...((attrs.actions ?? []) as Array<Record<string, unknown>>).map((action) =>
					h('UButton', action),
				),
			])
	},
}

const parts = (): Record<string, Component> => ({
	UAlert: alert,
	DmsBuilderOption: Option as Component,
	DmsBuilderFormPanel: FormPanel as Component,
	DmsBuilderOnThePage: OnThePage as Component,
	DmsBuilderSubmitSettings: SubmitSettings as Component,
	DmsBuilderFormTarget: FormTarget as Component,
	DmsBuilderTablePicker: TablePicker as Component,
	DmsBuilderFormFields: FormFields as Component,
	DmsBuilderFormFieldDetail: FormFieldDetail as Component,
	DmsBuilderIconInput: stub('DmsBuilderIconInput'),
	DmsBuilderDataSource: stub('DmsBuilderDataSource'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

async function settle(): Promise<void> {
	for (let round = 0; round < 3; round += 1) {
		await vi.advanceTimersByTimeAsync(0)
		await nextTick()
	}
}

async function formPanel(
	config: Record<string, unknown> = {},
	structure: ResourceStructure = orders(),
): Promise<TestNode> {
	backend.answers[RESOURCES] = [summary('order')]
	backend.answers[RESOURCE] = { ok: true, data: structure, changes: [] }
	backend.structure = {
		...backend.structure,
		blocks: [
			{
				path: 'form',
				name: 'form',
				type: 'Form',
				editable: true,
				config: { fields: [], ...config },
			},
		],
	}
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	builder.select('form')
	await vi.advanceTimersByTimeAsync(200)
	const tree = mount(Config, { components: parts() })
	mounted.push(tree.unmount)
	await settle()
	return tree.root
}

function config(): Record<string, unknown> {
	return builder.session.value.draft?.blocks[0]?.config ?? {}
}

function fields(): Array<Record<string, unknown>> {
	return (config().fields ?? []) as Array<Record<string, unknown>>
}

function keys(): unknown[] {
	return fields().map((field) => field.id)
}

/** The labels on show: a form field's, or a bare `<label>`'s. */
function labels(root: TestNode): string[] {
	return findAll(root, (node) => node.tag === 'UFormField' || node.tag === 'label').map(
		(node) =>
			node.tag === 'UFormField'
				? String(node.props.label ?? '')
				: textOf(node).replace('*', '').trim(),
	)
}

function button(root: TestNode, name: string): TestNode {
	const match = findAll(
		root,
		(node) =>
			(node.tag === 'UButton' && node.props.label === name) ||
			((node.tag === 'button' || node.tag === 'UButton') &&
				node.props['aria-label'] === name),
	)[0]
	if (!match) {
		throw new Error(`no button ${name}`)
	}
	return match
}

function has(root: TestNode, name: string): boolean {
	try {
		button(root, name)
		return true
	} catch {
		return false
	}
}

function formField(root: TestNode, label: string): TestNode {
	const match = findAll(
		root,
		(node) => node.tag === 'UFormField' && node.props.label === label,
	)[0]
	if (!match) {
		throw new Error(`no field ${label}`)
	}
	return match
}

/** The control a form field holds, found the way a user finds it: by its label. */
function field(root: TestNode, label: string, tag = 'UInput'): TestNode {
	const match = findAll(formField(root, label), (node) => node.tag === tag)[0]
	if (!match) {
		throw new Error(`no ${tag} in the field ${label}`)
	}
	return match
}

/** The lines of the field list, which open a field each. */
function lines(root: TestNode): TestNode[] {
	return findAll(
		root,
		(node) =>
			node.tag === 'UButton' &&
			node.props['aria-expanded'] !== undefined &&
			!String(node.props['aria-label'] ?? '').startsWith('Table'),
	)
}

/** The field lines, by the title each shows: the first of its words, over its type. */
function rows(root: TestNode): string[] {
	return lines(root).map((line) => {
		const title = findAll(
			line,
			(node) =>
				node.tag === 'span' && !node.children.some((child) => child.kind === 'element'),
		)[0]
		return title ? textOf(title).trim() : ''
	})
}

function openRow(root: TestNode, at: number): void {
	fire(lines(root)[at]!, 'click')
}

/** Fire a control's own `update:modelValue`, the way a user's input does. */
function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
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

describe('a form placed a moment ago', () => {
	it('offers the tables to fill, and no address to type', async () => {
		const root = await formPanel()

		expect(textOf(root)).toContain('Pick the table it fills')
		expect(has(root, 'Table the form saves into: order')).toBe(false)
		const options = findAll(root, (node) => node.props.role === 'option')
		expect(options).toHaveLength(1)
		expect(textOf(options[0]!)).toContain('order')
		expect(textOf(options[0]!), 'the columns a row is written with').toContain(
			'3 columns',
		)
		expect(labels(root)).not.toContain('Submit to')
		expect(labels(root)).not.toContain('Load from')
		expect(textOf(root)).toContain('They appear here once a table is picked.')
		expect(textOf(root), 'what the table picker says in its place').not.toContain(
			'Still to fill in',
		)
	})

	it('asks for every column a row is written with once a table is picked', async () => {
		const root = await formPanel()
		const [order] = findAll(root, (node) => node.props.role === 'option')
		fire(order!, 'click')
		await settle()

		expect(config()).toMatchObject({
			submitUrl: '/api/order/new',
			submitUrlMethod: 'POST',
		})
		expect(keys(), 'sent under the column names').toEqual(['amount', 'status', 'note'])
		expect(rows(root)).toEqual(['Amount', 'Status', 'Note'])
		expect(textOf(root)).toContain('3 of its 3 columns in the form')
	})

	it('offers no table that takes no new rows', async () => {
		const root = await formPanel({}, orders({ routes: ['list', 'get'] }))
		const [order] = findAll(root, (node) => node.props.role === 'option')
		expect(order?.props.disabled).toBe(true)
		expect(textOf(order!)).toContain('Takes no new rows')
	})
})

describe('a form saving into a table', () => {
	it('lists what it asks for in order, and the columns it leaves out under them', async () => {
		const root = await formPanel(BOUND)

		expect(rows(root)).toEqual(['Amount', 'Status'])
		expect(textOf(root)).toContain('Not in the form')
		expect(textOf(root)).toContain('2 of its 3 columns in the form')

		fire(button(root, 'Add Note to the form'), 'click')
		await nextTick()
		expect(keys()).toEqual(['amount', 'status', 'note'])
	})

	it('keeps its fields when its own table is picked again', async () => {
		const root = await formPanel(BOUND)
		fire(button(root, 'Table the form saves into: order'), 'click')
		await settle()
		const [order] = findAll(root, (node) => node.props.role === 'option')
		fire(order!, 'click')
		await settle()

		expect(keys(), 'what the author left out stays out').toEqual(['amount', 'status'])
	})

	it('moves a field within the form', async () => {
		const root = await formPanel(BOUND)
		fire(button(root, 'Move Status up'), 'click')
		await nextTick()
		expect(keys()).toEqual(['status', 'amount'])

		fire(button(root, 'Move Status down'), 'click')
		await nextTick()
		expect(keys()).toEqual(['amount', 'status'])
	})

	it('keeps the field it has open when another moves past it', async () => {
		const root = await formPanel(BOUND)
		openRow(root, 1)
		await nextTick()

		fire(button(root, 'Move Amount down'), 'click')
		await nextTick()
		expect(keys()).toEqual(['status', 'amount'])
		expect(lines(root).map((line) => line.props['aria-expanded'])).toEqual([true, false])
		expect(field(root, 'Label').props['model-value']).toBe('Status')
	})

	it('says when a column the table needs is left out, and puts it back', async () => {
		const root = await formPanel(BOUND)
		expect(textOf(root)).not.toContain("The table can't save a row without")

		fire(button(root, 'Leave Amount out of the form'), 'click')
		await nextTick()
		expect(keys()).toEqual(['status'])
		const [warning] = findAll(root, (node) => node.tag === 'UAlert')
		expect(textOf(warning!)).toContain(
			"The table can't save a row without Amount: every submit will fail until it is in the form.",
		)

		fire(button(warning!, 'Add Amount to the form'), 'click')
		await nextTick()
		expect(keys()).toEqual(['status', 'amount'])
		expect(textOf(root)).not.toContain("The table can't save a row without")
	})

	it('keeps a field sent under its column when it is renamed on the form', async () => {
		const root = await formPanel(BOUND)
		openRow(root, 1)
		await nextTick()

		write(field(root, 'Label'), 'Order state')
		await nextTick()
		expect(fields()[1]).toMatchObject({ id: 'status', label: 'Order state' })
		expect(textOf(root)).toContain('Saved in the column Status')

		fire(button(root, 'Use its name'), 'click')
		await nextTick()
		expect(fields()[1]).toMatchObject({ id: 'status', label: 'Status' })
	})

	it('takes its type from the column, and holds required what the table needs', async () => {
		const root = await formPanel(BOUND)
		openRow(root, 0)
		await nextTick()

		expect(labels(root), 'the column says what type it is').not.toContain('Type')
		const required = field(root, 'Required', 'USwitch')
		expect(required.props['model-value']).toBe(true)
		expect(required.props.disabled).toBe(true)
		expect(formField(root, 'Required').props.description).toBe(
			"The table can't save a row without it.",
		)
	})

	it('leaves the opened field out from its own line', async () => {
		const root = await formPanel(BOUND)
		openRow(root, 1)
		await nextTick()
		fire(button(root, 'Leave it out of the form'), 'click')
		await nextTick()

		expect(keys()).toEqual(['amount'])
		expect(rows(root)).toEqual(['Amount'])
	})

	it('turns Create back on for a table whose API refuses new rows', async () => {
		const root = await formPanel(BOUND, orders({ routes: ['list', 'get'] }))
		expect(textOf(root)).toContain('Takes no new rows')

		fire(button(root, 'Turn Create on'), 'click')
		await settle()

		const call = backend.calls.find((entry) => entry.path === '/api/builder/resource/configure')
		expect(call?.body).toEqual({
			resource: 'order',
			patch: { routes: ['list', 'get', 'create'] },
		})
	})

	it('opens its table in the tables view', async () => {
		const root = await formPanel(BOUND)
		fire(button(root, 'Open the table'), 'click')
		await nextTick()

		expect(builder.session.value.view).toBe('resource')
		expect(builder.session.value.table).toEqual({
			ref: 'order',
			tab: 'fields',
			adding: false,
		})
	})

	it('gives the addresses back to the advanced view', async () => {
		setMode('advanced')
		const root = await formPanel(BOUND)
		expect(findAll(root, (node) => node.tag === 'DmsBuilderFormPanel')).toHaveLength(0)
		expect(labels(root)).toContain('Submit to')
		expect(labels(root)).toContain('Load from')
	})
})

describe('a form sending to an address', () => {
	const ADDRESSED = {
		submitUrl: '/test',
		submitUrlMethod: 'POST',
		fields: [{ id: 'test', label: 'aaa', type: { $dataType: 'number', config: {} } }],
	}

	it('says where it sends, and offers to save into a table instead', async () => {
		const root = await formPanel(ADDRESSED)
		expect(textOf(root)).toContain('Sends to')
		expect(textOf(root)).toContain('POST /test')
		expect(findAll(root, (node) => node.props.role === 'option')).toHaveLength(0)

		fire(button(root, 'Save into a table instead'), 'click')
		await settle()
		expect(findAll(root, (node) => node.props.role === 'option')).toHaveLength(1)
	})

	it('takes fields added by hand, keyed after their label', async () => {
		const root = await formPanel(ADDRESSED)
		fire(button(root, 'Add field'), 'click')
		await nextTick()

		write(field(root, 'New field'), 'Delivery date')
		await nextTick()
		fire(button(root, 'Add the field'), 'click')
		await nextTick()

		expect(fields()[1]).toEqual({
			id: 'deliveryDate',
			label: 'Delivery date',
			type: { $dataType: 'string', config: {} },
		})
		expect(rows(root)).toEqual(['aaa', 'Delivery date'])
	})
})

describe('a field opened', () => {
	const number = { $dataType: 'number', config: {} }

	it('takes a default in the input its type calls for', async () => {
		const root = await formPanel({
			fields: [{ id: 'qty', label: 'Quantity', type: number, defaultValue: 5 }],
		})
		openRow(root, 0)
		await nextTick()

		const boxes = findAll(
			root,
			(node) => node.tag === 'UInput' && node.props.type === 'number',
		)
		expect(boxes.map((box) => box.props['model-value'])).toContain(5)
	})

	it('drops its default when it changes to a type that cannot hold it', async () => {
		const root = await formPanel({
			fields: [{ id: 'qty', label: 'Quantity', type: number, defaultValue: 5 }],
		})
		openRow(root, 0)
		await nextTick()

		const [typePicker] = findAll(
			root,
			(node) =>
				node.tag === 'USelectMenu' &&
				node.props.placeholder === 'Choose a data type…',
		)
		write(typePicker!, 'string')
		await nextTick()

		expect(fields()[0]?.type).toMatchObject({ $dataType: 'string' })
		expect(fields()[0]).not.toHaveProperty('defaultValue')
	})
})

describe('what a form says and does once it is sent', () => {
	/** The switch the submit settings sit behind, named in its title. */
	function customSubmit(root: TestNode): TestNode {
		const match = findAll(
			root,
			(node) => node.tag === 'USwitch' && node.props['aria-label'] === 'Custom submit',
		)[0]
		if (!match) {
			throw new Error('no Custom submit switch')
		}
		return match
	}

	it('says its own words until it is told otherwise, behind one switch', async () => {
		const root = await formPanel(BOUND)
		const toggle = customSubmit(root)
		expect(toggle.props['model-value']).toBe(false)
		expect(labels(root)).not.toContain('On success')
		expect(labels(root), 'it stays on the page').not.toContain('After submission')

		write(toggle, true)
		await nextTick()
		expect(config()).toMatchObject({
			successMessage: 'Data has been successfully saved',
		})
		expect(config(), 'a failure says what the server answered').not.toHaveProperty(
			'errorMessage',
		)
		expect(config()).not.toHaveProperty('submitLabel')
		expect(labels(root)).toEqual(
			expect.arrayContaining(['Button text', 'On success', 'On failure', 'After submission']),
		)
		expect(field(root, 'On failure').props.placeholder).toBe("The server's message")
		expect(config(), 'still staying on the page').not.toHaveProperty(
			'redirectOnSuccess',
		)

		write(field(root, 'Button text'), 'Create the order')
		write(field(root, 'On failure'), 'Try again')
		write(field(root, 'After submission', 'USelectMenu'), '/shop/orders')
		await nextTick()
		write(customSubmit(root), false)
		await nextTick()
		for (const key of ['submitLabel', 'successMessage', 'errorMessage', 'redirectOnSuccess']) {
			expect(config()).not.toHaveProperty(key)
		}
		expect(labels(root)).not.toContain('On success')
	})

	it('is on for a form that already says something of its own', async () => {
		const root = await formPanel({ ...BOUND, submitLabel: 'Send' })
		expect(customSubmit(root).props['model-value']).toBe(true)
		expect(field(root, 'Button text').props['model-value']).toBe('Send')
	})

	it('is on for a form that already goes somewhere', async () => {
		const root = await formPanel({ ...BOUND, redirectOnSuccess: '/shop/orders' })
		expect(customSubmit(root).props['model-value']).toBe(true)
		expect(field(root, 'After submission', 'USelectMenu').props['model-value']).toBe(
			'/shop/orders',
		)
	})

	it('stays on the page, or goes to one picked among the pages', async () => {
		backend.answers['GET /api/builder/pages'] = [
			{
				ref: '/shop/orders',
				id: 'orders',
				displayName: 'Orders',
				category: 'pages.shop',
				filepath: 'src/orders/page.ts',
			},
		]
		backend.answers['GET /api/builder/categories'] = [
			{ ref: 'pages.shop', displayName: 'Shop' },
		]
		const root = await formPanel(BOUND)
		write(customSubmit(root), true)
		await nextTick()
		const then = field(root, 'After submission', 'USelectMenu')
		expect(then.props['model-value']).toBe('stay')
		const items = then.props.items as Array<Record<string, unknown>>
		expect(items.map((item) => item.label)).toEqual([
			'Stay on the page',
			'Shop',
			'Orders',
		])

		write(then, '/shop/orders')
		await nextTick()
		expect(config().redirectOnSuccess).toBe('/shop/orders')

		write(field(root, 'After submission', 'USelectMenu'), 'stay')
		await nextTick()
		expect(config()).not.toHaveProperty('redirectOnSuccess')
	})

	it('puts its labels beside the fields until they are asked above', async () => {
		const root = await formPanel(BOUND)
		const choices = findAll(
			root,
			(node) => node.props.role === 'group' && node.props['aria-label'] === 'Labels',
		)[0]!
		const buttons = findAll(choices, (node) => node.tag === 'button')
		const picked = buttons.find((node) => node.props['aria-pressed'] === true)
		expect(textOf(picked!).trim()).toBe('Beside the field')

		fire(buttons.find((node) => textOf(node).trim() === 'Above it')!, 'click')
		await nextTick()
		expect(config().fieldsOrientation).toBe('vertical')
	})

	it('groups its settings in three cards', async () => {
		const root = await formPanel(BOUND)
		expect(
			findAll(root, (node) => node.tag === 'section').map((node) => node.props['aria-label']),
		).toEqual(['Data', 'On the page', 'Custom submit'])
	})
})

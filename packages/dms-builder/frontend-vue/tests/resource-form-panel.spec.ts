import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Config from '../app/components/Config.vue'
import Option from '../app/components/Option.vue'
import ResourceFormPanel from '../app/components/ResourceFormPanel.vue'
import OnThePage from '../app/components/OnThePage.vue'
import SubmitSettings from '../app/components/SubmitSettings.vue'
import TableChoice from '../app/components/TableChoice.vue'
import TableLink from '../app/components/TableLink.vue'
import TablePicker from '../app/components/TablePicker.vue'
import { useBuilderMode } from '../app/runtime/mode'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockCatalog, ResourceStructure } from '../app/runtime/types'
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

/**
 * A table form, as someone building a page sets one up in the simple mode:
 * what it does with a row, and where it goes once sent — picked, never typed.
 * No path to write, and no variable.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const { setMode } = useBuilderMode()

/** Mirrors `ResourceFormSchema`: a mode to pick, a path to type, a row id read. */
const RESOURCE_FORM: BlockCatalog['blocks'][number] = {
	type: 'ResourceForm',
	componentName: 'dms-form',
	label: 'Table form',
	group: 'data',
	container: false,
	controllerArg: true,
	shapeSource: 'test',
	config: {
		mode: {
			type: 'string',
			enum: ['new', 'edit', 'view'],
			description: 'Create a row, edit one, or show one read-only.',
			ui: { label: 'Mode', order: 1, group: 'content' },
		},
		title: { type: 'string', optional: true, ui: { label: 'Title', group: 'content' } },
		description: {
			type: 'string',
			optional: true,
			ui: { label: 'Description', group: 'content', widget: 'textarea' },
		},
		submitLabel: {
			type: 'string',
			optional: true,
			ui: { label: 'Submit button label', group: 'content' },
		},
		successMessage: {
			type: 'string',
			optional: true,
			ui: {
				label: 'Success message',
				group: 'content',
				placeholder: 'Data has been successfully saved',
				optIn: 'Custom submit messages',
			},
		},
		errorMessage: {
			type: 'string',
			optional: true,
			ui: {
				label: 'Error message',
				group: 'content',
				placeholder: 'An unknown error occurred',
				optIn: 'Custom submit messages',
			},
		},
		fieldsOrientation: {
			type: 'string',
			optional: true,
			enum: ['horizontal', 'vertical'],
			ui: { label: 'Field orientation', group: 'layout', widget: 'segmented' },
		},
		redirectOnSuccess: {
			type: 'string',
			optional: true,
			description: "Path to open once saved; {{response._id}} is the row just written.",
			ui: { label: 'Then open', group: 'behavior' },
		},
		rowId: {
			type: 'string',
			optional: true,
			ui: { label: 'Row id from', group: 'advanced', placeholder: '{{query.id}}' },
		},
	},
}

function orders(): ResourceStructure {
	return {
		ref: 'order',
		className: 'orderDataAPI',
		tableName: 'orders',
		route: '/api/order',
		version: 'v1',
		routes: ['list', 'get', 'create', 'edit'],
		fields: [
			{ name: 'amount', label: 'Amount', dataType: { $dataType: 'number' } },
			{ name: 'status', label: 'Status', dataType: { $dataType: 'string' } },
			{ name: 'createdAt', label: 'Created', dataType: { $dataType: 'date' } },
		],
	}
}

const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderResourceFormPanel: ResourceFormPanel as Component,
	DmsBuilderOnThePage: OnThePage as Component,
	DmsBuilderSubmitSettings: SubmitSettings as Component,
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	DmsBuilderDataSource: stub('DmsBuilderDataSource'),
	DmsBuilderTableChoice: TableChoice as Component,
	DmsBuilderTableLink: TableLink as Component,
	DmsBuilderTablePicker: TablePicker as Component,
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

async function tableForm(config: Record<string, unknown> = { mode: 'new' }): Promise<TestNode> {
	backend.catalog.blocks.push(RESOURCE_FORM)
	backend.answers['GET /api/builder/resources'] = [
		{
			ref: 'order',
			className: 'orderDataAPI',
			tableName: 'orders',
			route: '/api/order',
			fieldCount: 3,
		},
	]
	backend.answers['GET /api/builder/resource'] = { ok: true, data: orders(), changes: [] }
	backend.answers['GET /api/builder/pages'] = [
		{
			ref: '/shop/orders',
			id: 'orders',
			displayName: 'Orders',
			category: 'pages.shop',
			filepath: 'src/orders/page.ts',
		},
		{
			ref: '/shop/order',
			id: 'order',
			displayName: 'Order',
			category: 'pages.shop',
			filepath: 'src/order/page.ts',
		},
	]
	backend.answers['GET /api/builder/categories'] = [
		{ ref: 'pages.shop', displayName: 'Shop' },
	]
	backend.structure = {
		...backend.structure,
		blocks: [
			{
				path: 'form',
				name: 'form',
				type: 'ResourceForm',
				editable: true,
				controller: 'order',
				config,
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

function labels(root: TestNode): string[] {
	return findAll(root, (node) => node.tag === 'UFormField').map((node) =>
		String(node.props.label ?? ''),
	)
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

function field(root: TestNode, label: string, tag: string): TestNode {
	const match = findAll(formField(root, label), (node) => node.tag === tag)[0]
	if (!match) {
		throw new Error(`no ${tag} in the field ${label}`)
	}
	return match
}

function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

/** Every word the panel shows, and every prop it hands a control. */
function everything(root: TestNode): string {
	return [
		textOf(root),
		...findAll(root, () => true).map((node) => JSON.stringify(node.props, (_key, value) =>
			typeof value === 'function' ? undefined : value,
		)),
	].join('\n')
}

const OPEN_ROW = 'Open it on the row just saved'

/** A button, found by the words it shows. */
function button(root: TestNode, words: string): TestNode {
	const match = findAll(
		root,
		(node) => node.tag === 'button' && textOf(node).trim().includes(words),
	)[0]
	if (!match) {
		throw new Error(`no button ${words}`)
	}
	return match
}

/** The words of the choice pressed in a group of buttons, named by its label. */
function pressed(root: TestNode, group: string): string | undefined {
	const holder = findAll(
		root,
		(node) => node.props.role === 'group' && node.props['aria-label'] === group,
	)[0]
	const on = holder
		? findAll(holder, (node) => node.tag === 'button' && node.props['aria-pressed'] === true)
		: []
	return on[0] ? textOf(on[0]).trim() : undefined
}

/** The cards of the panel, by their names. */
function cards(root: TestNode): string[] {
	return findAll(root, (node) => node.tag === 'section').map((node) =>
		String(node.props['aria-label'] ?? ''),
	)
}

/** The switch the submit settings sit behind, named in its card's title. */
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

describe('a table form in the simple mode', () => {
	it('shows its settings in three cards, with no path and no variable', async () => {
		const root = await tableForm()

		expect(cards(root)).toEqual(['Data', 'On the page', 'Custom submit'])
		expect(everything(root)).not.toContain('{{')
		for (const word of ['Then open', 'Mode', 'Database table', 'Custom submit messages']) {
			expect(textOf(root)).not.toContain(word)
			expect(labels(root)).not.toContain(word)
		}
		expect(labels(root), 'where it goes is behind the switch').not.toContain(
			'After submission',
		)
	})

	it('picks its table in its own card, the way every panel does', async () => {
		const root = await tableForm()
		builder.session.value.resources = [
			...builder.session.value.resources,
			{ ref: 'invoice', className: 'invoiceDataAPI', tableName: 'invoices', route: '/api/invoice', fieldCount: 2 },
		]
		await settle()
		const table = findAll(
			root,
			(node) =>
				node.tag === 'UButton' &&
				node.props['aria-label'] === 'Table the form works on: order',
		)[0]!
		expect(textOf(table), 'what the table is to the form, under its name').toContain(
			'The table its fields come from',
		)

		fire(table, 'click')
		await settle()
		const invoice = findAll(
			root,
			(node) => node.props.role === 'option' && textOf(node).startsWith('invoice'),
		)[0]!
		fire(invoice, 'click')
		await settle()
		expect(builder.session.value.draft?.blocks[0]?.controller).toBe('invoice')
	})

	it('says what it does with a row, one mode at a time', async () => {
		const root = await tableForm()
		expect(pressed(root, 'What the form does')).toBe('Creates')
		expect(textOf(root)).toContain("Adds a new row each time it's sent.")

		fire(button(root, 'Edits'), 'click')
		await nextTick()
		expect(config().mode).toBe('edit')
		expect(pressed(root, 'What the form does')).toBe('Edits')
		expect(textOf(root)).toContain('The row the page is opened on, saved with the changes.')
	})

	it('says a form that does nothing yet is still to be told what to do', async () => {
		const root = await tableForm({})
		expect(pressed(root, 'What the form does')).toBeUndefined()
		expect(textOf(root)).toContain('Pick what the form does with a row.')
		expect(textOf(root), 'said once, where it is picked').not.toContain('Still to fill in')
	})

	it('says what it asks of the table, and leads to the table to change it', async () => {
		const root = await tableForm()
		expect(textOf(root)).toContain('3 of its 3 columns in the form')
		expect(textOf(root)).toContain(
			'Fields belong to the table: editing them changes every page that uses it.',
		)

		const open = findAll(
			root,
			(node) => node.tag === 'UButton' && node.props.label === 'Open the table',
		)[0]!
		fire(open, 'click')
		expect(builder.session.value.workspace).toBe('tables')
		expect(builder.session.value.table?.ref).toBe('order')
	})

	it('puts its labels beside the fields until they are asked above', async () => {
		const root = await tableForm()
		expect(pressed(root, 'Labels')).toBe('Beside the field')

		fire(button(root, 'Above it'), 'click')
		await nextTick()
		expect(config().fieldsOrientation).toBe('vertical')
		expect(pressed(root, 'Labels')).toBe('Above it')
	})
})

describe('where a table form goes once it is sent', () => {
	it('stays on the page, or goes to one picked among the pages', async () => {
		const root = await tableForm()
		write(customSubmit(root), true)
		await nextTick()
		const then = field(root, 'After submission', 'USelectMenu')
		expect(then.props['model-value']).toBe('stay')
		expect(labels(root), 'nothing to open on a row while it stays').not.toContain(OPEN_ROW)

		write(then, '/shop/orders')
		await nextTick()
		expect(config().redirectOnSuccess).toBe('/shop/orders')

		write(field(root, 'After submission', 'USelectMenu'), 'stay')
		await nextTick()
		expect(config()).not.toHaveProperty('redirectOnSuccess')
	})

	it('opens the page on the row it created once the box is ticked', async () => {
		const root = await tableForm({ mode: 'new', redirectOnSuccess: '/shop/order' })
		const box = field(root, OPEN_ROW, 'USwitch')
		expect(box.props['model-value']).toBe(false)

		write(box, true)
		await nextTick()
		expect(config().redirectOnSuccess).toBe('/shop/order?id={{response._id}}')
		expect(field(root, 'After submission', 'USelectMenu').props['model-value']).toBe(
			'/shop/order',
		)

		write(field(root, 'After submission', 'USelectMenu'), '/shop/orders')
		await nextTick()
		expect(config().redirectOnSuccess, 'another page keeps the box').toBe(
			'/shop/orders?id={{response._id}}',
		)

		write(field(root, OPEN_ROW, 'USwitch'), false)
		await nextTick()
		expect(config().redirectOnSuccess).toBe('/shop/orders')
	})

	it('opens the page on the row it edits, read where the form reads it', async () => {
		const root = await tableForm({ mode: 'edit', redirectOnSuccess: '/shop/order' })
		write(field(root, OPEN_ROW, 'USwitch'), true)
		await nextTick()
		expect(config().redirectOnSuccess).toBe('/shop/order?id={{query.id}}')
	})

	it('follows the mode, so the row stays the one it saved', async () => {
		const root = await tableForm({
			mode: 'new',
			redirectOnSuccess: '/shop/order?id={{response._id}}',
		})
		expect(field(root, OPEN_ROW, 'USwitch').props['model-value']).toBe(true)

		fire(button(root, 'Edits'), 'click')
		await nextTick()
		expect(config()).toMatchObject({
			mode: 'edit',
			redirectOnSuccess: '/shop/order?id={{query.id}}',
		})

		fire(button(root, 'Shows'), 'click')
		await nextTick()
		expect(config().redirectOnSuccess, 'kept for the mode that comes next').toBe(
			'/shop/order?id={{query.id}}',
		)
		expect(cards(root), 'showing a row sends nothing').toEqual(['Data', 'On the page'])
	})

	it('keeps an address written in code as the choice it is', async () => {
		const root = await tableForm({
			mode: 'new',
			redirectOnSuccess: '/shop/order/{{response._id}}/edit',
		})
		const then = field(root, 'After submission', 'USelectMenu')
		expect(then.props['model-value']).toBe('/shop/order/{{response._id}}/edit')
		const items = then.props.items as Array<Record<string, unknown>>
		expect(items.map((item) => item.label)).toContain('/shop/order/{{response._id}}/edit')
		expect(field(root, OPEN_ROW, 'USwitch').props['model-value']).toBe(false)
	})
})

describe('a table form in the advanced view', () => {
	it('is edited option by option, as the block declares them', async () => {
		setMode('advanced')
		const root = await tableForm()
		expect(findAll(root, (node) => node.tag === 'DmsBuilderResourceFormPanel')).toHaveLength(0)
		expect(cards(root), 'the generic cards, not the panel\'s').not.toContain('Data')
		expect(cards(root)).toContain('Table')
		expect(textOf(root)).toContain('Database table')
	})
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Bar from '../app/components/Bar.vue'
import Config from '../app/components/Config.vue'
import FieldDetail from '../app/components/FieldDetail.vue'
import FieldForm from '../app/components/FieldForm.vue'
import FieldGrid from '../app/components/FieldGrid.vue'
import Option from '../app/components/Option.vue'
import Overlay from '../app/components/Overlay.vue'
import ResourcePanel from '../app/components/ResourcePanel.vue'
import TableApi from '../app/components/TableApi.vue'
import TableSettings from '../app/components/TableSettings.vue'
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
import type { BlockNode, ResourceStructure } from '../app/runtime/types'

/**
 * What someone who never wrote a line of the app reaches the database through:
 * the tables, from the bar, whether or not a block reads one yet — a grid of
 * every field, a field added by picking its type — and the deletions that take
 * rows with them, which are never one click away.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

/**
 * Mount a part of the tables panel, and unmount it once the test is over: left
 * mounted, it keeps watching the shared session, and the table reads it starts
 * land in the next test.
 */
const mountPanel: typeof mount = (component, options) => {
	const tree = mount(component, options)
	mounted.push(tree.unmount)
	return tree
}

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const RESOURCES = 'GET /api/builder/resources'
const RESOURCE = 'GET /api/builder/resource'

function ticket(extra: Partial<ResourceStructure> = {}): ResourceStructure {
	return {
		ref: 'ticket',
		className: 'Ticket',
		tableName: 'tickets',
		route: '/api/ticket',
		version: 'r1',
		fields: [
			{
				name: 'title',
				label: 'Title',
				dataType: { $dataType: 'string' },
				listable: true,
			} as ResourceStructure['fields'][number],
		],
		...extra,
	}
}

function summary(ref: string) {
	return { ref, className: 'Ticket', tableName: 'tickets', route: `/api/${ref}`, fieldCount: 1 }
}

/** The panel's own parts, registered the way the layer's loader names them. */
const parts = (): Record<string, Component> => ({
	DmsBuilderFieldGrid: FieldGrid as Component,
	DmsBuilderFieldDetail: FieldDetail as Component,
	DmsBuilderFieldForm: FieldForm as Component,
	DmsBuilderTableApi: TableApi as Component,
	DmsBuilderTableSettings: TableSettings as Component,
})

async function openEditor(blocks: BlockNode[] = []): Promise<void> {
	backend.structure = { ...backend.structure, blocks }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
}

function buttonLabelled(root: TestNode, label: string): TestNode {
	const found = findAll(
		root,
		(node) => node.tag === 'UButton' && node.props.label === label,
	)[0]
	if (!found) {
		throw new Error(`no button labelled "${label}"`)
	}
	return found
}

/** A button of the panel's own, by what it says or is called. */
function button(root: TestNode, text: string): TestNode {
	const found = findAll(
		root,
		(node) =>
			node.tag === 'UButton' &&
			(node.props['aria-label'] === text || textOf(node).includes(text)),
	)[0]
	if (!found) {
		throw new Error(`no button reading "${text}"`)
	}
	return found
}

/** A control of the framework's, by the prop that names it. */
function control(
	root: TestNode,
	tag: string,
	prop: string,
	value: string,
): TestNode {
	const found = findAll(
		root,
		(node) => node.tag === tag && node.props[prop] === value,
	)[0]
	if (!found) {
		throw new Error(`no <${tag}> with ${prop} "${value}"`)
	}
	return found
}

/** Switch the open table to one of its tabs, by what the tab reads. */
function openTab(root: TestNode, label: string): void {
	const strip = findAll(root, (node) => node.tag === 'UTabs')[0]
	const items = (strip?.props.items ?? []) as { label: string; value: string }[]
	const tab = items.find((item) => item.label === label)
	if (!strip || !tab) {
		throw new Error(`no tab reading "${label}"`)
	}
	write(strip, tab.value)
}

function input(root: TestNode, placeholder: string): TestNode {
	const found = findAll(
		root,
		(node) => node.tag === 'UInput' && node.props.placeholder === placeholder,
	)[0]
	if (!found) {
		throw new Error(`no input reading "${placeholder}"`)
	}
	return found
}

/** Fire a control's own `update:modelValue`, the way a user's input does. */
function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

function deletions(): string[] {
	return backend.calledPaths().filter((call) => call.startsWith('DELETE '))
}

/** Let a write and the reads it triggers answer, then render what they left. */
async function settle(): Promise<void> {
	for (let round = 0; round < 5; round += 1) {
		await vi.advanceTimersByTimeAsync(0)
	}
	await nextTick()
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
})

afterEach(() => {
	for (const unmount of mounted) unmount()
	mounted = []
	builder.close()
	useBuilderMode().setMode('simple')
	vi.useRealTimers()
})

describe('the tables, from the bar', () => {
	it('are one click away, with no block selected, on the list of them', async () => {
		await openEditor()
		const { root } = mount(Bar)
		await nextTick()

		fire(buttonLabelled(root, 'Tables'), 'click')

		expect(builder.session.value.view).toBe('resource')
		expect(builder.session.value.table).toBeNull()
	})

	it('open on the table the selected block reads', async () => {
		await openEditor([
			{
				path: 'block',
				name: 'block',
				type: 'Text',
				editable: true,
				controller: 'ticket',
				config: {},
			},
		])
		builder.select('block')

		builder.setView('resource')

		expect(builder.session.value.table).toEqual({
			ref: 'ticket',
			tab: 'fields',
			adding: false,
		})
	})

	it('let a project with none create its first one, and open it under the ref it gets', async () => {
		await openEditor()
		builder.setView('resource')
		const { root } = mountPanel(ResourcePanel, { components: parts() })
		await nextTick()
		expect(textOf(root)).toContain('No table yet')

		// The engine names the ref; the panel follows it rather than what was typed.
		backend.answers['POST /api/builder/resources'] = {
			ok: true,
			data: { ref: 'support_ticket' },
			changes: [],
		}
		backend.answers[RESOURCES] = [summary('support_ticket')]
		backend.answers[RESOURCE] = {
			ok: true,
			data: { ...ticket(), ref: 'support_ticket' },
			changes: [],
		}
		write(input(root, 'Product'), 'Support ticket')
		await nextTick()
		fire(buttonLabelled(root, 'Create table'), 'click')
		await settle()

		expect(builder.session.value.table).toEqual({
			ref: 'support_ticket',
			tab: 'fields',
			adding: false,
		})
	})

	it('are climbed out of one step at a time', async () => {
		await openEditor()
		builder.setView('resource')
		builder.session.value.table = { ref: 'ticket', tab: 'fields', adding: true }

		builder.back()
		expect(builder.session.value.table, 'out of the new field').toEqual({
			ref: 'ticket',
			tab: 'fields',
			adding: false,
		})
		builder.back()
		expect(builder.session.value.table, 'out of the table').toBeNull()
		expect(builder.session.value.view).toBe('resource')
		builder.back()
		expect(builder.session.value.view, 'out of the tables').toBe('library')
	})
})

describe('a table, open', () => {
	async function panelOnTicket(
		structure: ResourceStructure = ticket(),
	): Promise<TestNode> {
		backend.answers[RESOURCES] = [summary('ticket')]
		backend.answers[RESOURCE] = { ok: true, data: structure, changes: [] }
		await openEditor()
		builder.setView('resource')
		const { root } = mountPanel(ResourcePanel, { components: parts() })
		await settle()
		expect(textOf(root), 'listed with what it holds').toContain('1 field')
		fire(button(root, 'ticket'), 'click')
		await settle()
		return root
	}

	it('writes a tick of the grid straight away', async () => {
		const root = await panelOnTicket()

		write(control(root, 'UCheckbox', 'aria-label', 'Title: Search'), true)
		await settle()

		const written = backend.calls.find(
			(call) => call.method === 'PUT' && call.path === '/api/builder/resource/fields',
		)
		expect(written?.body).toEqual({
			path: 'ticket#title',
			patch: { searchable: true },
		})
	})

	it('adds a field from its own step, and comes back to the grid', async () => {
		backend.catalog = {
			...backend.catalog,
			dataTypes: [
				{ id: 'string', config: {} },
				{ id: 'number', config: {} },
			],
		}
		const root = await panelOnTicket()
		fire(buttonLabelled(root, 'Add field'), 'click')
		await nextTick()
		expect(builder.session.value.table?.adding).toBe(true)

		backend.answers[RESOURCE] = {
			ok: true,
			data: ticket({
				fields: [
					...ticket().fields,
					{ name: 'priority', label: 'Priority', dataType: { $dataType: 'number' } },
				],
			}),
			changes: [],
		}
		write(input(root, 'Price'), 'Priority')
		fire(buttonLabelled(root, 'Number'), 'click')
		await nextTick()
		fire(buttonLabelled(root, 'Add field'), 'click')
		await settle()

		const added = backend.calls.find(
			(call) => call.method === 'POST' && call.path === '/api/builder/resource/fields',
		)
		expect(added?.body).toMatchObject({
			resource: 'ticket',
			field: { name: 'priority', label: 'Priority', dataType: { $dataType: 'number' } },
		})
		expect(builder.session.value.table?.adding).toBe(false)
	})

	it('asks before a field and its column go', async () => {
		const root = await panelOnTicket()
		fire(button(root, 'Title'), 'click')
		await nextTick()

		fire(buttonLabelled(root, 'Remove field'), 'click')
		await settle()

		expect(backend.confirms).toHaveLength(1)
		expect(backend.confirms[0]).toMatchObject({
			confirmLabel: 'Remove the field and its data',
			confirmColor: 'error',
		})
		expect(backend.confirms[0]?.description).toContain('drops its column')
		expect(deletions()).toEqual(['DELETE /api/builder/resource/fields'])
	})

	it('keeps a field and its column when the author says no', async () => {
		const root = await panelOnTicket()
		fire(button(root, 'Title'), 'click')
		await nextTick()

		backend.confirmAnswer = false
		fire(buttonLabelled(root, 'Remove field'), 'click')
		await settle()

		expect(backend.confirms, 'asked').toHaveLength(1)
		expect(deletions()).toEqual([])
	})

	it("asks for the table's name before it and every row in it go", async () => {
		const root = await panelOnTicket()
		openTab(root, 'Settings')
		await nextTick()

		const confirm = () => buttonLabelled(root, 'Delete the table and its rows')
		expect(confirm().props.disabled, 'nothing typed yet').toBe(true)
		write(input(root, 'ticket'), 'tick')
		await nextTick()
		expect(confirm().props.disabled, 'not its name').toBe(true)
		expect(deletions()).toEqual([])

		write(input(root, 'ticket'), 'ticket')
		await nextTick()
		expect(confirm().props.disabled).toBe(false)
		fire(confirm(), 'click')
		await settle()

		expect(deletions()).toEqual(['DELETE /api/builder/resource'])
		expect(builder.session.value.table, 'back on the list').toBeNull()
	})

	it('never switches off the last route it serves', async () => {
		const root = await panelOnTicket(ticket({ routes: ['list'] }))
		openTab(root, 'API')
		await nextTick()

		const toggle = (label: string) => control(root, 'USwitch', 'label', label)
		expect(toggle('List').props.disabled).toBe(true)
		expect(toggle('Create').props.disabled).toBe(false)

		write(toggle('Create'), true)
		await settle()
		const configured = backend.calls.find(
			(call) => call.path === '/api/builder/resource/configure',
		)
		expect(configured?.body).toEqual({
			resource: 'ticket',
			patch: { routes: ['list', 'create'] },
		})
	})
})

describe('a new field', () => {
	it('picks its type among tiles named for whoever picks one, by family', async () => {
		backend.catalog = {
			...backend.catalog,
			dataTypes: [
				{ id: 'made_up', config: {} },
				{ id: 'relation', config: {} },
				{ id: 'string', config: {} },
			],
		}
		await openEditor()
		const { root } = mountPanel(FieldForm, { props: { resource: 'ticket' } })
		await nextTick()

		const tiles = findAll(
			root,
			(node) => node.tag === 'UButton' && 'aria-pressed' in node.props,
		).map((node) => node.props.label)
		expect(tiles, 'known ones first, a registered one last').toEqual([
			'Text',
			'Row of another table',
			'Made up',
		])
		expect(textOf(root)).toContain('Links to other tables')
	})

	it('takes its key from the label, and refuses one the table already holds', async () => {
		backend.answers[RESOURCE] = { ok: true, data: ticket(), changes: [] }
		await openEditor()
		await builder.loadResource('ticket')
		const submitted: unknown[] = []
		const { root } = mountPanel(FieldForm, {
			props: { resource: 'ticket', onSubmit: (spec: unknown) => submitted.push(spec) },
		})
		await nextTick()

		write(input(root, 'Price'), 'Title')
		await nextTick()
		expect(control(root, 'UFormField', 'label', 'Label').props.error).toContain(
			'already has a title field',
		)
		expect(buttonLabelled(root, 'Add field').props.disabled).toBe(true)

		write(input(root, 'Price'), 'Delivery date')
		await nextTick()
		fire(buttonLabelled(root, 'Add field'), 'click')

		expect(submitted).toEqual([
			{
				name: 'deliveryDate',
				label: 'Delivery date',
				dataType: { $dataType: 'string' },
				listable: true,
				selectable: true,
			},
		])
	})

	it('waits, as a relation, for the table it points at', async () => {
		backend.catalog = {
			...backend.catalog,
			dataTypes: [
				{ id: 'string', config: {} },
				{ id: 'relation', config: {} },
			],
		}
		await openEditor()
		const { root } = mountPanel(FieldForm, { props: { resource: 'ticket' } })
		await nextTick()

		write(input(root, 'Price'), 'Customer')
		fire(buttonLabelled(root, 'Row of another table'), 'click')
		await nextTick()

		expect(buttonLabelled(root, 'Add field').props.disabled).toBe(true)
		expect(
			findAll(
				root,
				(node) =>
					node.tag === 'USelectMenu' && node.props.placeholder === 'Choose a table…',
			),
		).toHaveLength(1)
	})
})

describe('a write that went through with a warning', () => {
	const shell = (): Record<string, Component> => ({
		DmsBuilderBar: stub('DmsBuilderBar'),
		DmsBuilderCanvas: stub('DmsBuilderCanvas'),
		DmsBuilderRail: stub('DmsBuilderRail'),
		DmsBuilderBlockMenu: stub('DmsBuilderBlockMenu'),
	})
	const fallback = {
		code: 'datatype_fallback',
		message: 'field "rank" dataType "made_up" has no DB-type mapping',
	}

	it('says what it had to settle for, once, until dismissed', async () => {
		backend.answers[RESOURCE] = { ok: true, data: ticket(), changes: [] }
		await openEditor()
		backend.answers['POST /api/builder/resource/fields'] = {
			ok: true,
			data: { path: 'ticket#rank' },
			changes: [],
			warnings: [fallback],
		}
		const field = { name: 'rank', dataType: { $dataType: 'made_up' } }
		await builder.addField('ticket', field)
		await builder.addField('ticket', field)
		const { root } = mount(Overlay, { components: shell() })
		await nextTick()

		const listed = findAll(root, (node) => node.tag === 'li').map(textOf)
		expect(listed).toEqual([fallback.message])

		const alert = findAll(root, (node) => node.tag === 'UAlert')[0]!
		expect(alert.props.close).toMatchObject({ 'aria-label': 'Dismiss the warnings' })
		fire(alert, 'update:open')
		await nextTick()
		expect(findAll(root, (node) => node.tag === 'li')).toHaveLength(0)
	})
})

describe('a block that reads a table', () => {
	const panel = (): Record<string, Component> => ({
		DmsBuilderOption: Option as Component,
		DmsBuilderIconInput: stub('DmsBuilderIconInput'),
		DmsBuilderDataSource: stub('DmsBuilderDataSource'),
		USelectMenu: stub('USelectMenu'),
		USwitch: stub('USwitch'),
		UTextarea: stub('UTextarea'),
	})

	async function selected(type: string): Promise<TestNode> {
		backend.catalog = {
			...backend.catalog,
			blocks: [
				...backend.catalog.blocks,
				{
					type,
					componentName: `Dms${type}`,
					label: type,
					group: 'data',
					container: false,
					config: {},
					shapeSource: 'test',
					controllerArg: true,
				},
			],
		}
		backend.answers[RESOURCE] = { ok: true, data: ticket(), changes: [] }
		await openEditor([
			{
				path: 'block',
				name: 'block',
				type,
				editable: true,
				controller: 'ticket',
				config: {},
			},
		])
		builder.select('block')
		await settle()
		const { root } = mount(Config, { components: panel() })
		await settle()
		return root
	}

	// The simple view sets a table's search on its columns, in the table's own
	// panel; the advanced one keeps the picker.
	it('offers the search bar only on the table that has one', async () => {
		useBuilderMode().setMode('advanced')
		const table = await selected('TableView')
		expect(findAll(table, (node) => node.tag === 'label').map(textOf)).toContain(
			'Search field',
		)
	})

	it('leaves it off a form over the same table', async () => {
		const form = await selected('ResourceForm')
		const shown = findAll(form, (node) => node.tag === 'label').map(textOf)
		expect(shown).toContain('Database table')
		expect(shown).not.toContain('Search field')
	})

	it('no longer switches the export from the block', async () => {
		const table = await selected('TableView')
		expect(textOf(table)).not.toContain('Data export')
	})
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Config from '../app/components/Config.vue'
import Option from '../app/components/Option.vue'
import TableActions from '../app/components/TableActions.vue'
import TableColumns from '../app/components/TableColumns.vue'
import TablePanel from '../app/components/TablePanel.vue'
import TableSource from '../app/components/TableSource.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	fakeEvent,
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
 * A table, as someone building a page sets one up in the simple mode: the
 * table it lists, picked rather than named, that table's columns beside it,
 * how its rows come and are called, and what people can do with them.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const RESOURCES = 'GET /api/builder/resources'
const RESOURCE = 'GET /api/builder/resource'
const FIELDS = 'PUT /api/builder/resource/fields'
const CONFIGURE = 'POST /api/builder/resource/configure'
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
		routes: ['list', 'get', 'create', 'edit', 'delete'],
		fields: [
			{
				name: 'amount',
				label: 'Amount',
				access: 'readwrite',
				listable: true,
				sortable: true,
				filterable: true,
				dataType: { $dataType: 'number' },
			},
			{
				name: 'status',
				label: 'Status',
				access: 'readwrite',
				listable: true,
				filterable: true,
				dataType: { $dataType: 'string' },
			},
			{
				name: 'created',
				label: 'Created',
				access: 'readwrite',
				listable: true,
				sortable: true,
				dataType: { $dataType: 'date' },
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

const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderTablePanel: TablePanel as Component,
	DmsBuilderTableSource: TableSource as Component,
	DmsBuilderTableColumns: TableColumns as Component,
	DmsBuilderTableActions: TableActions as Component,
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

async function tablePanel(
	block: { controller?: string; config?: Record<string, unknown> } = {},
	structure: ResourceStructure = orders(),
): Promise<TestNode> {
	backend.answers[RESOURCES] = [summary('order'), summary('invoice')]
	backend.answers[RESOURCE] = { ok: true, data: structure, changes: [] }
	backend.structure = {
		...backend.structure,
		blocks: [
			{
				path: 'table',
				name: 'table',
				type: 'TableView',
				editable: true,
				...(block.controller ? { controller: block.controller } : {}),
				config: block.config ?? {},
			},
		],
	}
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	builder.select('table')
	await vi.advanceTimersByTimeAsync(200)
	const tree = mount(Config, { components: parts() })
	mounted.push(tree.unmount)
	await settle()
	return tree.root
}

function node() {
	return builder.session.value.draft?.blocks[0]
}

function config(): Record<string, unknown> {
	return node()?.config ?? {}
}

function labels(root: TestNode): string[] {
	return findAll(root, (candidate) => candidate.tag === 'label').map((label) =>
		textOf(label).replace('*', '').trim(),
	)
}

function control(root: TestNode, tag: string, name: string): TestNode {
	const match = findAll(
		root,
		(candidate) =>
			candidate.tag === tag &&
			(candidate.props['aria-label'] === name ||
				candidate.props.id === name ||
				candidate.props.label === name),
	)[0]
	if (!match) {
		throw new Error(`no ${tag} ${name}`)
	}
	return match
}

function button(root: TestNode, name: string): TestNode {
	const match = findAll(
		root,
		(candidate) =>
			(candidate.tag === 'button' || candidate.tag === 'UButton') &&
			(candidate.props['aria-label'] === name || candidate.props.label === name),
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

function toggle(root: TestNode, name: string): TestNode {
	return control(root, 'USwitch', name)
}

/** Fire a control's own `update:modelValue`, the way a user's input does. */
function write(target: TestNode, value: unknown): void {
	const handler = target.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${target.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

/** The rows of the column grid, which each carry a column's switches. */
function columnRows(root: TestNode): TestNode[] {
	return findAll(root, (candidate) => candidate.props.draggable !== undefined)
}

function fieldWrites(): Array<{ path?: unknown; patch?: unknown }> {
	return backend.calls
		.filter((call) => `${call.method} ${call.path}` === FIELDS)
		.map((call) => call.body as { path?: unknown; patch?: unknown })
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

describe('a table placed a moment ago', () => {
	it('offers the tables to list rather than a menu of resources', async () => {
		const root = await tablePanel()

		expect(textOf(root)).toContain('Pick the table it lists')
		expect(labels(root)).not.toContain('Database table')
		expect(textOf(root), 'what the picker says in its place').not.toContain(
			'Still to fill in',
		)
		const options = findAll(root, (candidate) => candidate.props.role === 'option')
		expect(options.map(textOf)).toEqual(['invoice4 columns', 'order4 columns'])
		expect(textOf(root), 'nothing to set before a table is picked').not.toContain(
			'What people can do',
		)
	})

	it('lists the table picked, and shows its columns', async () => {
		const root = await tablePanel()
		const order = findAll(root, (candidate) => candidate.props.role === 'option')[1]
		fire(order!, 'click')
		await settle()

		expect(node()?.controller).toBe('order')
		expect(has(root, 'Table it lists: order')).toBe(true)
		expect(columnRows(root).map(textOf)).toEqual(['Amount', 'Status', 'Created', 'Note'])
		expect(textOf(root)).toContain('What people can do')
	})

	it('offers no table whose rows cannot be listed', async () => {
		const root = await tablePanel({}, orders({ routes: ['get', 'create'] }))
		const [invoice] = findAll(root, (candidate) => candidate.props.role === 'option')
		expect(invoice?.props.disabled).toBe(true)
		expect(textOf(invoice!)).toContain("Can't list its rows")
	})
})

describe('the columns of the table it lists', () => {
	it('shows whether each shows, is searched and filtered, and writes it at once', async () => {
		const root = await tablePanel({ controller: 'order' })

		expect(toggle(root, 'Show Amount').props['model-value']).toBe(true)
		expect(toggle(root, 'Show Note').props['model-value']).toBe(false)
		expect(toggle(root, 'Filters offer Status').props['model-value']).toBe(true)
		expect(toggle(root, 'Search reads Status').props['model-value']).toBe(false)

		write(toggle(root, 'Search reads Status'), true)
		await settle()
		expect(fieldWrites()).toEqual([
			{ path: 'order#status', patch: { searchable: true } },
		])
		expect(config(), 'the page itself is left as it was').toEqual({})
	})

	it('moves a column with the arrow keys, writing each rank that changes', async () => {
		const root = await tablePanel({ controller: 'order' })
		fire(button(root, 'Move Status'), 'keydown', {
			...fakeEvent('keydown'),
			key: 'ArrowUp',
		} as ReturnType<typeof fakeEvent>)
		await settle()

		expect(fieldWrites()).toEqual([
			{ path: 'order#status', patch: { order: 1 } },
			{ path: 'order#amount', patch: { order: 2 } },
			{ path: 'order#created', patch: { order: 3 } },
			{ path: 'order#note', patch: { order: 4 } },
		])
	})

	it('moves a column dropped on another to its place', async () => {
		const root = await tablePanel({ controller: 'order' })
		const [amount, , , note] = columnRows(root)
		fire(note!, 'dragstart')
		fire(amount!, 'dragover')
		fire(amount!, 'drop')
		await settle()

		expect(
			fieldWrites().map((entry) => entry.path),
			'the column dropped first, the others after it',
		).toEqual(['order#note', 'order#amount', 'order#status', 'order#created'])
	})

	it('forgets what named the old columns when another table is listed', async () => {
		const root = await tablePanel({
			controller: 'order',
			config: { labelKey: 'status', defaultSort: { field: 'created', desc: true } },
		})
		fire(button(root, 'Table it lists: order'), 'click')
		await nextTick()
		const invoice = findAll(root, (candidate) => candidate.props.role === 'option')[0]
		fire(invoice!, 'click')
		await settle()

		expect(node()?.controller).toBe('invoice')
		expect(config()).toEqual({})
	})
})

describe('how its rows come and are called', () => {
	it('sorts by a column the table sorts by, a date newest first', async () => {
		const root = await tablePanel({ controller: 'order' })
		const menu = control(root, 'USelectMenu', 'Rows come sorted by')
		const offered = (menu.props.items as Array<{ value: string }>).map(
			(item) => item.value,
		)
		expect(offered, 'only the columns it sorts by').toEqual(['#none', 'amount', 'created'])

		write(menu, 'created')
		await nextTick()
		expect(config().defaultSort).toEqual({ field: 'created', desc: true })

		fire(button(root, 'Oldest first'), 'click')
		await nextTick()
		expect(config().defaultSort).toEqual({ field: 'created' })

		write(control(root, 'USelectMenu', 'Rows come sorted by'), '#none')
		await nextTick()
		expect(config().defaultSort).toBeUndefined()
	})

	it('reads a number largest first, and a sort written in code as it is', async () => {
		const root = await tablePanel({
			controller: 'order',
			config: { defaultSort: { field: 'amount', desc: true } },
		})
		expect(button(root, 'Largest first').props['aria-pressed']).toBe(true)
		expect(button(root, 'Smallest first').props['aria-pressed']).toBe(false)
	})

	it('names a row by a column it shows', async () => {
		const root = await tablePanel({ controller: 'order' })
		const menu = control(root, 'USelectMenu', 'Rows are called by')
		expect(
			(menu.props.items as Array<{ value: string }>).map((item) => item.value),
		).toEqual(['#none', 'amount', 'status', 'created'])

		write(menu, 'status')
		await nextTick()
		expect(config().labelKey).toBe('status')

		write(control(root, 'USelectMenu', 'Rows are called by'), '#none')
		await nextTick()
		expect(config().labelKey).toBeUndefined()
	})
})

describe('what people can do', () => {
	it('reads an action left unset the way the table does, and leaves it unset', async () => {
		const root = await tablePanel({ controller: 'order' })

		expect(toggle(root, 'Add rows').props['model-value']).toBe(true)
		expect(toggle(root, 'Select several rows').props['model-value']).toBe(false)

		write(toggle(root, 'Add rows'), false)
		await nextTick()
		expect(config().rowActions).toEqual({ add: false })

		write(toggle(root, 'Add rows'), true)
		await nextTick()
		expect(config(), 'no empty list of actions left behind').toEqual({})
	})

	it('keeps the rule an action runs under when it is turned off', async () => {
		const rule = { field: 'status', equals: 'pending' }
		const root = await tablePanel({
			controller: 'order',
			config: { rowActions: { edit: { rule } } },
		})
		expect(toggle(root, 'Edit rows').props['model-value']).toBe(true)
		expect(
			toggle(root, 'Open rows read-only').props.disabled,
			'rows the rule leaves out are read only',
		).toBe(false)

		write(toggle(root, 'Edit rows'), false)
		await nextTick()
		expect(config().rowActions).toEqual({ edit: { rule, isEnabled: false } })
	})

	it('offers opening a row read-only once editing no longer opens it', async () => {
		const root = await tablePanel({ controller: 'order' })
		expect(toggle(root, 'Open rows read-only').props.disabled).toBe(true)
		expect(textOf(root)).toContain('Edit already opens the row')

		write(toggle(root, 'Edit rows'), false)
		await nextTick()
		expect(toggle(root, 'Open rows read-only').props.disabled).toBe(false)

		write(toggle(root, 'Open rows read-only'), true)
		await nextTick()
		expect(config().rowActions).toEqual({ edit: false, details: true })
	})

	it('archives only on a table with a column to mark archived rows', async () => {
		const root = await tablePanel({ controller: 'order' })
		expect(toggle(root, 'Archive rows').props.disabled).toBe(true)
		expect(textOf(root)).toContain('order has no column to mark archived rows')
	})

	it('archives, restores, and deletes only what was archived', async () => {
		const structure = orders({
			routes: ['list', 'get', 'create', 'edit', 'delete', 'archive'],
		})
		structure.fields.push({
			name: 'archived',
			label: 'Archived',
			access: 'readwrite',
			archiveField: true,
			dataType: { $dataType: 'boolean' },
		})
		const root = await tablePanel({ controller: 'order' }, structure)
		expect(textOf(root)).toContain('Erases it for good')
		expect(has(root, 'Restore archived rows')).toBe(false)

		write(toggle(root, 'Archive rows'), true)
		await nextTick()
		expect(config().archiveMode).toBe(true)
		expect(textOf(root)).toContain('Marked in the column Archived')
		expect(textOf(root)).toContain('Archived rows only, for good')
		expect(toggle(root, 'Restore archived rows').props['model-value']).toBe(true)

		write(toggle(root, 'Archive rows'), false)
		await nextTick()
		expect(config(), 'off, the switch is not written at all').toEqual({})
	})

	it('says when the API refuses an action, and serves the route', async () => {
		const root = await tablePanel(
			{ controller: 'order' },
			orders({ routes: ['list', 'get', 'create', 'delete'] }),
		)
		const alerts = findAll(root, (candidate) => candidate.props.role === 'alert')
		expect(alerts).toHaveLength(1)
		expect(textOf(alerts[0]!)).toContain(
			'The API of order has Update turned off, so every edit will be refused.',
		)

		fire(button(root, 'Turn Update on'), 'click')
		await settle()
		const configured = backend.calls.find(
			(call) => `${call.method} ${call.path}` === CONFIGURE,
		)
		expect(configured?.body).toEqual({
			resource: 'order',
			patch: { routes: ['list', 'get', 'create', 'delete', 'edit'] },
		})
	})

	it('turns the refused action off instead, if asked', async () => {
		const root = await tablePanel(
			{ controller: 'order' },
			orders({ routes: ['list', 'get', 'create', 'delete'] }),
		)
		fire(button(root, 'Turn editing off'), 'click')
		await nextTick()
		expect(config().rowActions).toEqual({ edit: false })
		expect(findAll(root, (candidate) => candidate.props.role === 'alert')).toHaveLength(0)
	})
})

describe('a table in the advanced view', () => {
	it('keeps every option, the table menu and the search field', async () => {
		setMode('advanced')
		const root = await tablePanel({ controller: 'order' })

		expect(textOf(root)).not.toContain('What people can do')
		expect(labels(root)).toContain('Database table')
		expect(labels(root)).toContain('Search field')
		expect(labels(root)).toContain('Table title')
		expect(textOf(root)).toContain('Ghost delete')
	})
})

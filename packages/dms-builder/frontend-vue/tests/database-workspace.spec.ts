import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DatabaseConnect from '../app/components/DatabaseConnect.vue'
import DatabaseProposal from '../app/components/DatabaseProposal.vue'
import DatabaseRelation from '../app/components/DatabaseRelation.vue'
import type {
	AnalysisState,
	MappingProposal,
	ProposedField,
	ProposedResource,
} from '../app/runtime/database-types'
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
 * The Database workspace: the analysis's proposal decided in the builder and
 * applied as one `MapResources`, a few rows shown to the integrator and kept
 * nowhere, and the wiring written only after its diff was shown.
 */

let backend: FakeBackend
let unmount: (() => void) | undefined
let stored: Map<string, string>

installDocumentStub()

function proposed<T>(value: T, rule = 'R6') {
	return { value, rule, kind: 'default' as const }
}

function field(column: string): ProposedField {
	return {
		column,
		native: 'text',
		accepts: ['string'],
		declared: proposed('string', 'F3'),
		label: proposed(column, 'L2'),
		listable: proposed(true, 'FL'),
		filterable: proposed(false, 'FL'),
		sortable: proposed(false, 'FL'),
		searchable: proposed(false, 'FL'),
	}
}

const CUSTOMERS: ProposedResource = {
	relation: 'erp.customers',
	tableView: proposed(true),
	writable: proposed(false, 'W1'),
	label: proposed('name', 'L1'),
	title: proposed('Customers', 'L2'),
	fields: [field('code'), field('name')],
	leftOut: [],
	writes: { insert: false, update: false, delete: false },
}

const PROPOSAL: MappingProposal = {
	connection: 'erp',
	module: 'erp-tables',
	database: { engine: 'postgresql 17.5', role: 'erp_reader', writes: 'none' },
	resources: [CUSTOMERS],
	excluded: [],
	open: [],
}

const DONE: AnalysisState = {
	id: 'job-1',
	connection: 'erp',
	status: 'done',
	progress: { relations: 1, described: 1, toProfile: 1, profiled: 1, timeouts: 0 },
	proposal: PROPOSAL,
}

const COMPONENTS = {
	USelect: stub('USelect'),
	USwitch: stub('USwitch'),
	DmsEyebrow: stub('DmsEyebrow'),
	DmsBuilderDatabaseRelation: DatabaseRelation,
	DmsBuilderDiffView: stub('DmsBuilderDiffView'),
}

function button(root: TestNode, name: string): TestNode {
	const match = findAll(
		root,
		(node) => node.tag === 'UButton' && (node.props.label === name || textOf(node).trim() === name),
	)[0]
	if (!match) {
		throw new Error(`no button ${name}`)
	}
	return match
}

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(10)
	await nextTick()
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	stored = new Map()
	Object.assign(globalThis, {
		localStorage: {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
			removeItem: (key: string) => stored.delete(key),
		},
	})
	backend.answers['POST /api/builder/database/analyse'] = { ok: true, data: { ...DONE, status: 'running', proposal: undefined }, changes: [] }
	backend.answers['GET /api/builder/database/analysis'] = { ok: true, data: DONE, changes: [] }
	backend.answers['POST /api/builder/database/map'] = {
		ok: true,
		data: { resources: [{ relation: 'erp.customers', ref: 'erp/erp/customers', files: [] }], leftOut: [] },
		changes: [],
	}
	backend.answers['GET /api/builder/database/mapping'] = { ok: true, data: [], changes: [] }
	backend.answers['POST /api/builder/database/sample'] = {
		relation: 'erp.customers',
		columns: ['code', 'name'],
		rows: [[{ text: 'C0000001', truncated: false }, { text: 'Ada Lovelace', truncated: false }]],
		sample: null,
	}
})

afterEach(() => {
	unmount?.()
	Reflect.deleteProperty(globalThis, 'localStorage')
	vi.useRealTimers()
})

async function proposalPanel(): Promise<TestNode> {
	const mounted = mount(DatabaseProposal, {
		props: { connection: 'erp', module: 'erp-tables' },
		components: COMPONENTS,
	})
	unmount = mounted.unmount
	fire(button(mounted.root, 'Analyse'), 'click')
	await settle()
	return mounted.root
}

describe('the Database workspace', () => {
	it('analyses, writes nothing, and applies the proposal as one MapResources', async () => {
		const root = await proposalPanel()
		expect(backend.calledPaths()).not.toContain('POST /api/builder/database/map')
		expect(textOf(root)).toContain('erp.customers')

		fire(button(root, 'Apply'), 'click')
		await settle()
		expect(backend.calledPaths()).not.toContain('POST /api/builder/database/map')
		expect(textOf(root)).toContain('Applying will:')
		fire(button(root, 'Confirm'), 'click')
		await settle()

		const map = backend.calls.filter((call) => call.path === '/api/builder/database/map')
		expect(map).toHaveLength(1)
		expect(map[0]?.body).toMatchObject({
			module: 'erp-tables',
			connection: 'erp',
			resources: [{ relation: 'erp.customers', label: 'name', tableView: true, writable: false }],
		})
		expect(textOf(root)).toContain('Applied.')
	})

	it('shows a few rows to the integrator when a relation opens, and keeps them in no draft', async () => {
		const root = await proposalPanel()
		fire(button(root, 'erp.customers'), 'click')
		await settle()

		expect(textOf(root)).toContain('Ada Lovelace')
		expect([...stored.values()].join('')).not.toContain('Ada Lovelace')
		const sample = backend.calls.find((call) => call.path === '/api/builder/database/sample')
		expect(sample?.body).toEqual({ connection: 'erp', relation: 'erp.customers', limit: 20 })
	})
})

function select(root: TestNode, predicate: (node: TestNode) => boolean): TestNode {
	const match = findAll(root, (node) => node.tag === 'USelect' && predicate(node))[0]
	if (!match) {
		throw new Error('no such select')
	}
	return match
}

describe('a question the analysis left open', () => {
	const LABEL = {
		id: 'label:erp.customers',
		kind: 'label' as const,
		relation: 'erp.customers',
		question: 'Which column names a row of erp.customers?',
		options: [
			{ value: 'code', title: 'code (the key)' },
			{ value: 'name', title: 'name' },
		],
		proposed: 'name',
	}
	const PURPOSE = {
		id: 'purpose:erp.audit',
		kind: 'purpose' as const,
		relation: 'erp.audit',
		question: 'What should erp.audit become?',
		options: [],
		proposed: null,
		resource: { ...CUSTOMERS, relation: 'erp.audit', title: proposed('Audit', 'L2') },
	}

	function withOpen(): void {
		const customers: ProposedResource = {
			...CUSTOMERS,
			rows: 4000,
			profiledRows: 40,
			fields: [
				{ ...field('code'), profile: { traits: [], nulls: 0, distinct: 40 } },
				{ ...field('name'), profile: { traits: [], nulls: 10, distinct: 25 } },
			],
		}
		backend.answers['GET /api/builder/database/analysis'] = {
			ok: true,
			data: { ...DONE, proposal: { ...PROPOSAL, resources: [customers], open: [LABEL, PURPOSE] } },
			changes: [],
		}
	}

	it('is asked at the control it decides, with counts and a preview of sampled rows', async () => {
		withOpen()
		const root = await proposalPanel()
		expect(textOf(root)).not.toContain(LABEL.question)
		expect(textOf(root)).toContain('1 to decide')
		fire(button(root, 'erp.customers'), 'click')
		await settle()

		expect(textOf(root)).toContain(LABEL.question)
		const label = select(root, (node) => node.props.placeholder === 'No label')
		expect(label.props.items).toEqual([
			{ label: 'code · the key · 100% filled · 40 values', value: 'code' },
			{ label: 'name · 75% filled · 25 values', value: 'name' },
		])
		expect(textOf(root)).toContain('Sampled rows read:')
		expect(textOf(root)).toContain('Ada Lovelace')

		fire(label, 'update:modelValue', 'code' as never)
		await settle()
		expect(textOf(root)).not.toContain(LABEL.question)
		expect(textOf(root)).toContain('C0000001')
		expect([...stored.values()].join('')).not.toContain('Ada Lovelace')
		expect([...stored.values()].join('')).not.toContain('C0000001')

		fire(button(root, 'Apply'), 'click')
		await settle()
		fire(button(root, 'Confirm'), 'click')
		await settle()
		const map = backend.calls.find((call) => call.path === '/api/builder/database/map')
		expect(map?.body).toMatchObject({ resources: [{ relation: 'erp.customers', label: 'code' }] })
		expect(JSON.stringify(map?.body)).not.toContain('Ada Lovelace')
	})

	it('settles what a relation becomes from plain choices in its panel', async () => {
		withOpen()
		const root = await proposalPanel()
		fire(button(root, 'erp.audit'), 'click')
		await settle()
		expect(textOf(root)).toContain(PURPOSE.question)

		fire(button(root, 'Counted in stats, no page'), 'click')
		await settle()
		expect(textOf(root)).not.toContain(PURPOSE.question)
		fire(button(root, 'Apply'), 'click')
		await settle()
		expect(textOf(root)).toContain('applied meanwhile as:')
		fire(button(root, 'Confirm'), 'click')
		await settle()
		const map = backend.calls.find((call) => call.path === '/api/builder/database/map')
		expect(map?.body).toMatchObject({
			resources: [{ relation: 'erp.customers' }, { relation: 'erp.audit', tableView: false }],
		})
	})
})

describe('a relation the module maps already', () => {
	const ORDERS: ProposedResource = {
		...CUSTOMERS,
		relation: 'erp.orders',
		label: proposed('number', 'L1'),
		title: proposed('Orders', 'L2'),
		fields: [field('number'), { ...field('customer'), relation: { ...proposed('erp.customers', 'F4'), implied: false } }],
	}

	async function mappedPanel(): Promise<TestNode> {
		backend.answers['GET /api/builder/database/mapping'] = {
			ok: true,
			data: [
				{ ref: 'erp/erp/customers', resource: CUSTOMERS, included: ['code', 'name'] },
				{ ref: 'erp/erp/orders', resource: ORDERS, included: ['number', 'customer'] },
			],
			changes: [],
		}
		const mounted = mount(DatabaseProposal, {
			props: { connection: 'erp', module: 'erp-tables' },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		return mounted.root
	}

	async function makeEditable(root: TestNode, relation: string): Promise<void> {
		fire(button(root, relation), 'click')
		await settle()
		const toggle = findAll(root, (node) => node.tag === 'USwitch' && node.props.label === 'Rows can be edited')[0]!
		fire(toggle, 'update:modelValue', true as never)
		await settle()
	}

	it('is listed, opened with its current choices, and has nothing to apply until changed', async () => {
		backend.answers['GET /api/builder/database/mapping'] = {
			ok: true,
			data: [{ ref: 'erp/erp/customers', resource: CUSTOMERS, included: ['name'] }],
			changes: [],
			warnings: [{ code: 'relation_missing', message: 'erp.legacy is mapped, but the database no longer has it' }],
		}
		const mounted = mount(DatabaseProposal, {
			props: { connection: 'erp', module: 'erp-tables' },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		expect(textOf(mounted.root)).toContain('erp.legacy is mapped, but the database no longer has it')
		fire(button(mounted.root, 'erp.customers'), 'click')
		await settle()
		expect(button(mounted.root, 'Apply changes').props.disabled).toBe(true)
		expect(textOf(mounted.root)).toContain('No changes to apply.')
	})

	it('marks every changed table unsaved and applies them in one MapResources', async () => {
		const root = await mappedPanel()
		await makeEditable(root, 'erp.customers')
		await makeEditable(root, 'erp.orders')
		expect(findAll(root, (node) => node.tag === 'UBadge' && textOf(node).trim() === 'unsaved')).toHaveLength(2)
		expect(textOf(root)).toContain('Not saved yet: Customers, Orders.')

		fire(button(root, 'Apply changes (2 tables)'), 'click')
		await settle()
		const map = backend.calls.filter((call) => call.path === '/api/builder/database/map')
		expect(map).toHaveLength(1)
		expect(map[0]?.body).toMatchObject({
			resources: [
				{ relation: 'erp.customers', writable: true },
				{ relation: 'erp.orders', writable: true },
			],
		})
		expect(map[0]?.body).not.toHaveProperty('excluded')
		expect(textOf(root)).toContain('Saved Customers, Orders. The pages update once the module reloads')
	})

	it('says which tables show a new label through the columns pointing at it', async () => {
		const root = await mappedPanel()
		fire(button(root, 'erp.customers'), 'click')
		await settle()
		fire(select(root, (node) => node.props.placeholder === 'No label'), 'update:modelValue', 'code' as never)
		await settle()
		fire(button(root, 'Apply changes'), 'click')
		await settle()
		expect(textOf(root)).toContain('The columns pointing at them in Orders show the new label too.')
	})

	it('keeps a change not applied yet when the panel closes and opens again', async () => {
		const root = await mappedPanel()
		await makeEditable(root, 'erp.customers')
		unmount?.()
		const reopened = await mappedPanel()
		expect(findAll(reopened, (node) => node.tag === 'UBadge' && textOf(node).trim() === 'unsaved')).toHaveLength(1)
		const customers = findAll(reopened, (node) => node.tag === 'UButton' && textOf(node).includes('erp.customers'))[0]!
		fire(customers, 'click')
		await settle()
		fire(button(reopened, 'Apply changes'), 'click')
		await settle()
		const map = backend.calls.filter((call) => call.path === '/api/builder/database/map')
		expect(map.at(-1)?.body).toMatchObject({ resources: [{ relation: 'erp.customers', writable: true }] })
	})

	it('says next to Apply changes why it could not save, and keeps the change', async () => {
		backend.answers['POST /api/builder/database/map'] = {
			ok: false,
			error: { code: 'invalid_config', issues: [{ pointer: '', message: 'relation erp.customers has no column "name"' }] },
		}
		const root = await mappedPanel()
		await makeEditable(root, 'erp.customers')
		fire(button(root, 'Apply changes'), 'click')
		await settle()
		expect(textOf(root)).toContain('relation erp.customers has no column "name"')
		expect(textOf(root)).not.toContain('Saved')
		expect(findAll(root, (node) => node.tag === 'UBadge' && textOf(node).trim() === 'unsaved')).toHaveLength(1)
	})
})

describe('connecting a database', () => {
	function inputs(root: TestNode): TestNode[] {
		return findAll(root, (node) => node.tag === 'UInput')
	}

	it('keeps the password when a write is refused, so the retry does not drop it', async () => {
		backend.answers['GET /api/builder/database/project'] = { modules: [] }
		backend.answers['POST /api/builder/database/project'] = { ok: true, data: { files: [] }, changes: [] }
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		const [name, , host, , database, user, password] = inputs(mounted.root)
		for (const [input, value] of [[name, 'erp'], [host, 'db.example'], [database, 'erp'], [user, 'reader'], [password, 's3cret']] as const) {
			fire(input!, 'update:modelValue', value as never)
		}
		await settle()
		fire(button(mounted.root, 'Show the changes'), 'click')
		await settle()
		backend.answers['POST /api/builder/database/project'] = {
			ok: false,
			error: { code: 'invalid_config', issues: [{ pointer: '', message: '.env is not ignored by git' }] },
		}
		fire(button(mounted.root, 'Write them'), 'click')
		await settle()
		expect(textOf(mounted.root)).toContain('.env is not ignored by git')
		expect(inputs(mounted.root)[6]?.props.modelValue).toBe('s3cret')
	})

	it('refuses a host that carries a port, before showing anything', async () => {
		backend.answers['GET /api/builder/database/project'] = { modules: [] }
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		const [name, , host, , database, user] = inputs(mounted.root)
		for (const [input, value] of [[name, 'erp'], [host, 'db.example:5433'], [database, 'erp'], [user, 'reader']] as const) {
			fire(input!, 'update:modelValue', value as never)
		}
		await settle()
		expect(button(mounted.root, 'Show the changes').props.disabled).toBe(true)
		expect(textOf(mounted.root)).toContain('no spaces, port or path')
	})

	it('writes nothing until the diff was shown', async () => {
		backend.answers['POST /api/builder/database/project'] = { ok: true, data: { files: [] }, changes: [] }
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await nextTick()
		expect(button(mounted.root, 'Write them').props.disabled).toBe(true)
	})
})

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
		expect(textOf(root)).toContain('Apply writes, in one change')
		fire(button(root, 'Write it'), 'click')
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

	it('shows a few rows to the integrator, and keeps them in no draft', async () => {
		const root = await proposalPanel()
		fire(button(root, 'erp.customers'), 'click')
		await settle()
		fire(button(root, 'Sample rows'), 'click')
		await settle()

		expect(textOf(root)).toContain('Ada Lovelace')
		expect([...stored.values()].join('')).not.toContain('Ada Lovelace')
		const sample = backend.calls.find((call) => call.path === '/api/builder/database/sample')
		expect(sample?.body).toEqual({ connection: 'erp', relation: 'erp.customers', limit: 20 })
	})
})

describe('a relation the module maps already', () => {
	it('is listed, opened with its current choices, and mapped again on its own', async () => {
		backend.answers['GET /api/builder/database/mapping'] = {
			ok: true,
			data: [{ ref: 'erp/erp/customers', resource: CUSTOMERS, included: ['name'] }],
			changes: [],
		}
		const mounted = mount(DatabaseProposal, {
			props: { connection: 'erp', module: 'erp-tables' },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		fire(button(mounted.root, 'erp.customers'), 'click')
		await settle()
		fire(button(mounted.root, 'Map again'), 'click')
		await settle()

		const map = backend.calls.filter((call) => call.path === '/api/builder/database/map')
		expect(map).toHaveLength(1)
		expect(map[0]?.body).toMatchObject({
			resources: [{ relation: 'erp.customers', fields: [{ column: 'name' }] }],
		})
		expect(map[0]?.body).not.toHaveProperty('excluded')
	})
})

describe('connecting a database', () => {
	it('writes nothing until the diff was shown', async () => {
		backend.answers['POST /api/builder/database/project'] = { ok: true, data: { files: [] }, changes: [] }
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await nextTick()
		expect(button(mounted.root, 'Write them').props.disabled).toBe(true)
	})
})

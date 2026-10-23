import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	answerItem,
	connectSteps,
	draftFromMapped,
	draftFromProposal,
	includeResource,
	KEEP_MAPPING_DRAFT_MS,
	mergedDraft,
	remapInput,
	settledInput,
	storedMappingDraft,
	storeMappingDraft,
	unanswered,
} from '../app/runtime/database'
import type {
	MappedRelation,
	MappingProposal,
	ProposedField,
	ProposedResource,
} from '../app/runtime/database-types'

/**
 * The builder's decision code over a mapping proposal: the draft the
 * integrator edits, and the one `MapResources` call Apply sends.
 */

function proposed<T>(value: T, rule = 'R6') {
	return { value, rule, kind: 'default' as const }
}

function field(column: string, relation?: string): ProposedField {
	const base: ProposedField = {
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
	if (relation) {
		base.relation = { ...proposed(relation, 'F4'), implied: false }
	}
	return base
}

function resource(relation: string, fields: ProposedField[], label: string | null): ProposedResource {
	return {
		relation,
		tableView: proposed(true),
		writable: proposed(false, 'W1'),
		label: proposed(label, 'L1'),
		title: proposed(relation.split('.')[1], 'L2'),
		fields,
		leftOut: [],
		writes: { insert: false, update: false, delete: false },
	}
}

const PROPOSAL: MappingProposal = {
	connection: 'erp',
	module: 'erp-tables',
	database: { engine: 'postgresql 17.5', role: 'erp_reader', writes: 'none' },
	resources: [
		resource('erp.customers', [field('code'), field('name')], 'name'),
		resource('erp.orders', [field('id'), field('customer_code', 'erp.customers')], 'id'),
	],
	excluded: [{ relation: 'erp.schema_migrations', reason: 'a migration tool', rule: 'R4' }],
	open: [
		{
			id: 'purpose:legacy.t_cst',
			kind: 'purpose',
			relation: 'legacy.t_cst',
			question: 'What does legacy.t_cst hold?',
			options: [],
			proposed: null,
			resource: resource('legacy.t_cst', [field('id'), field('c01')], 'id'),
		},
		{
			id: 'label:erp.orders',
			kind: 'label',
			relation: 'erp.orders',
			question: 'Which column names an order?',
			options: [],
			proposed: 'id',
		},
	],
}

describe('a mapping draft', () => {
	it('starts as the proposal: proposed relations in, a relation asked about out', () => {
		const draft = draftFromProposal(PROPOSAL)
		expect(draft.resources.map((entry) => [entry.relation, entry.include])).toEqual([
			['erp.customers', true],
			['erp.orders', true],
			['legacy.t_cst', false],
		])
	})

	it('sends the proposal as it stands, with the analysis exclusions recorded', () => {
		const input = settledInput(PROPOSAL, draftFromProposal(PROPOSAL))
		expect(input.resources.map((entry) => entry.relation)).toEqual(['erp.customers', 'erp.orders'])
		expect(input.excluded).toEqual([{ relation: 'erp.schema_migrations', reason: 'a migration tool' }])
		const orders = input.resources[1]
		expect(orders.fields[1]).toEqual({
			column: 'customer_code',
			label: 'customer_code',
			listable: true,
			filterable: false,
			sortable: false,
			searchable: false,
			relation: 'erp.customers',
		})
	})

	it('maps a relation once its purpose is answered, and records one decided against', () => {
		const draft = draftFromProposal(PROPOSAL)
		const [purpose, label] = PROPOSAL.open
		answerItem(draft, purpose, 'statsOnly')
		answerItem(draft, label, 'customer_code')
		const input = settledInput(PROPOSAL, draft)
		expect(input.resources.find((entry) => entry.relation === 'legacy.t_cst')?.tableView).toBe(false)
		expect(input.resources.find((entry) => entry.relation === 'erp.orders')?.label).toBe('customer_code')
		expect(unanswered(PROPOSAL, draft)).toEqual([])
		answerItem(draft, purpose, 'excluded')
		expect(settledInput(PROPOSAL, draft).excluded).toContainEqual({
			relation: 'legacy.t_cst',
			reason: 'decided against in the builder',
		})
	})

	it('keeps a relation column onto a TableView the module maps already, and drops one onto anything else', () => {
		const invoices = resource('erp.invoices', [field('id'), field('order_ref', 'erp.archive')], 'id')
		const proposal: MappingProposal = { ...PROPOSAL, resources: [invoices] }
		const draft = draftFromProposal(proposal)
		const dropped = settledInput(proposal, draft).resources[0]
		expect(dropped.fields[1].relation).toBeUndefined()
		const kept = settledInput(proposal, draft, new Set(['erp.archive'])).resources[0]
		expect(kept.fields[1].relation).toBe('erp.archive')
	})

	it('sends no title for one emptied, so the page keeps its default', () => {
		const draft = draftFromProposal(PROPOSAL)
		draft.resources[0].title = '  '
		expect(settledInput(PROPOSAL, draft).resources[0]).not.toHaveProperty('title')
	})

	it('drops a relation column whose target is no longer a TableView of the mapping', () => {
		const draft = draftFromProposal(PROPOSAL)
		includeResource(draft, 'erp.customers', false)
		const orders = settledInput(PROPOSAL, draft).resources.find((entry) => entry.relation === 'erp.orders')
		expect(orders?.fields[1].relation).toBeUndefined()
		expect(orders?.fields[1].declared).toBe('string')
	})
})

describe('a mapping draft kept in the browser', () => {
	let stored: Map<string, string>

	beforeEach(() => {
		stored = new Map()
		Object.assign(globalThis, {
			localStorage: {
				getItem: (key: string) => stored.get(key) ?? null,
				setItem: (key: string, value: string) => stored.set(key, value),
				removeItem: (key: string) => stored.delete(key),
			},
		})
	})

	afterEach(() => {
		Reflect.deleteProperty(globalThis, 'localStorage')
	})

	it('comes back over the next proposal, and holds no profile or row', () => {
		const draft = draftFromProposal(PROPOSAL)
		includeResource(draft, 'erp.orders', false)
		storeMappingDraft(draft, 1000)
		const kept = storedMappingDraft('erp', 'erp-tables', 2000)
		const merged = mergedDraft(PROPOSAL, kept)
		expect(merged.resources.find((entry) => entry.relation === 'erp.orders')?.include).toBe(false)
		expect([...stored.values()].join('')).not.toMatch(/traits|rows/)
	})

	it('is kept per module, and forgotten when it is a week old', () => {
		storeMappingDraft(draftFromProposal(PROPOSAL), 0)
		expect(storedMappingDraft('erp', 'other-tables', 1)).toBeUndefined()
		expect(storedMappingDraft('erp', 'erp-tables', 1)).toBeDefined()
		expect(storedMappingDraft('erp', 'erp-tables', KEEP_MAPPING_DRAFT_MS + 1)).toBeUndefined()
	})

	it('meets a proposal that changed field by field: dropped columns go, new ones come, a type no longer accepted resets', () => {
		const kept = draftFromProposal(PROPOSAL)
		const customers = kept.resources[0]
		customers.fields[0].label = 'Customer code'
		customers.fields[1].declared = 'number'
		customers.fields.push({ ...customers.fields[1], column: 'gone' })
		customers.writable = true
		const changed: MappingProposal = {
			...PROPOSAL,
			resources: [
				resource('erp.customers', [field('code'), field('name'), field('segment')], 'name'),
				PROPOSAL.resources[1],
			],
		}
		const merged = mergedDraft(changed, kept).resources[0]
		expect(merged.writable).toBe(true)
		expect(merged.fields.map((entry) => entry.column)).toEqual(['code', 'name', 'segment'])
		expect(merged.fields[0].label).toBe('Customer code')
		expect(merged.fields[1].declared).toBe('string')
		expect(settledInput(changed, mergedDraft(changed, kept)).resources).toHaveLength(2)
	})
})

describe('the wiring of a database', () => {
	const form = {
		connection: 'erp',
		providerModule: 'postgres-erp',
		generatedModule: 'erp-tables',
		variable: 'ERP_DATABASE_URL',
		postgresVersion: '^0.2.0',
		dmsPinned: false,
		withDmsAi: true,
	}

	it('adds the provider, the generated module, the mongodb priority and a connection per consumer', () => {
		const steps = connectSteps(form)
		expect(steps.map((step) => `${step.op}:${step.id}`)).toEqual([
			'AddModule:postgres-erp',
			'CreateLocalModule:erp-tables',
			'ConfigureModule:mongodb',
			'ConfigureModule:dms-builder',
			'ConfigureModule:dms-ai',
		])
		expect(JSON.stringify(steps)).not.toMatch(/postgres:\/\//)
	})

	it('leaves mongodb and dms-ai alone when the project needs neither', () => {
		const steps = connectSteps({ ...form, dmsPinned: true, withDmsAi: false })
		expect(steps.map((step) => step.id)).toEqual(['postgres-erp', 'erp-tables', 'dms-builder'])
	})
})

describe('a relation the module maps already', () => {
	const mapped: MappedRelation = {
		ref: 'erp/erp/customers',
		resource: resource('erp.customers', [field('code'), field('name'), field('email')], 'name'),
		included: ['name', 'email'],
	}

	it('opens with its current choices, the columns it declares in', () => {
		const draft = draftFromMapped(mapped)
		expect(draft.fields.map((entry) => [entry.column, entry.include])).toEqual([
			['code', false],
			['name', true],
			['email', true],
		])
	})

	it('is mapped again on its own, from its changed draft', () => {
		const draft = draftFromMapped(mapped)
		draft.fields[2].include = false
		draft.writable = true
		const input = remapInput('erp', 'erp-tables', draft, new Set())
		expect(input.resources).toHaveLength(1)
		expect(input.resources[0]).toMatchObject({ relation: 'erp.customers', writable: true, label: 'name' })
		expect(input.resources[0].fields.map((entry) => entry.column)).toEqual(['name'])
		expect(input).not.toHaveProperty('excluded')
	})
})

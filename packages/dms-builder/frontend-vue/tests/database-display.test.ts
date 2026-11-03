import { describe, expect, it } from 'vitest'
import { draftFromMapped, draftFromProposal, remapInput, settledInput } from '../app/runtime/database'
import type {
	ColumnDisplay,
	MappedRelation,
	MappingProposal,
	ProposedField,
	ProposedResource,
} from '../app/runtime/database-types'

/** A column's display and a relation's tabs travel from the proposal to the call Apply sends, and from a mapped relation to a remap. */

const STATUS: ColumnDisplay = {
	kind: 'badge',
	items: [
		{ value: 'paid', label: 'Paid', tone: 'success' },
		{ value: 'pending', label: 'Pending', tone: 'warning' },
	],
}

function proposed<T>(value: T, rule: string) {
	return { value, rule, kind: 'default' as const }
}

function field(column: string, declared: string, display?: ColumnDisplay, filterable = true): ProposedField {
	const base: ProposedField = {
		column,
		native: declared,
		accepts: [declared],
		declared: proposed(declared, 'F3'),
		label: proposed(column, 'L2'),
		listable: proposed(true, 'FL'),
		filterable: proposed(filterable, 'FL'),
		sortable: proposed(false, 'FL'),
		searchable: proposed(false, 'FL'),
	}
	if (display) {
		base.display = proposed(display, display.kind === 'badge' ? 'D1' : 'D2')
	}
	return base
}

function orders(fields: ProposedField[]): ProposedResource {
	return {
		relation: 'shop.orders',
		tableView: proposed(true, 'R6'),
		writable: proposed(false, 'W1'),
		label: proposed('reference', 'L1'),
		title: proposed('Orders', 'L2'),
		tabs: proposed({ column: 'status' }, 'T1'),
		fields,
		leftOut: [],
		writes: { insert: false, update: false, delete: false },
	}
}

function proposalOf(resource: ProposedResource): MappingProposal {
	return {
		connection: 'shop',
		module: 'shop-tables',
		database: { engine: 'postgresql 17', role: 'reader', writes: 'none' },
		resources: [resource],
		excluded: [],
		open: [],
	}
}

const FIELDS = [field('status', 'string', STATUS), field('total', 'number', { kind: 'price' }), field('note', 'string')]

describe('the display of columns and the tabs of a relation in the draft', () => {
	it('sends the proposed badge, price and tabs to MapResources, and a plain column as plain', () => {
		const proposal = proposalOf(orders(FIELDS))
		const input = settledInput(proposal, draftFromProposal(proposal))
		const [sent] = input.resources
		expect(sent.tabs).toEqual({ column: 'status' })
		expect(sent.fields.map((entry) => [entry.column, entry.display])).toEqual([
			['status', STATUS],
			['total', { kind: 'price' }],
			['note', null],
		])
	})

	it('sends no display for a column the draft redeclared, and no tabs over it', () => {
		const proposal = proposalOf(orders(FIELDS))
		const draft = draftFromProposal(proposal)
		draft.resources[0].fields[0].declared = 'number'
		const [sent] = settledInput(proposal, draft).resources
		expect(sent.fields[0].display).toBeNull()
		expect(sent.tabs).toBeNull()
	})

	it('sends no tabs over a column left out or not filterable, nor for a relation with no TableView', () => {
		const proposal = proposalOf(orders(FIELDS))
		const left = draftFromProposal(proposal)
		left.resources[0].fields[0].include = false
		expect(settledInput(proposal, left).resources[0].tabs).toBeNull()
		const unfiltered = draftFromProposal(proposal)
		unfiltered.resources[0].fields[0].filterable = false
		expect(settledInput(proposal, unfiltered).resources[0].tabs).toBeNull()
		const stats = draftFromProposal(proposal)
		stats.resources[0].tableView = false
		expect(settledInput(proposal, stats).resources[0].tabs).toBeNull()
	})

	it('keeps what a mapped relation holds when it is mapped again from its read-back', () => {
		const mapped: MappedRelation = {
			ref: 'shop/shop/orders',
			resource: orders(FIELDS),
			included: ['status', 'total', 'note'],
		}
		const [sent] = remapInput('shop', 'shop-tables', [draftFromMapped(mapped)], new Set()).resources
		expect(sent.tabs).toEqual({ column: 'status' })
		expect(sent.fields[0].display).toEqual(STATUS)
		expect(sent.fields[1].display).toEqual({ kind: 'price' })
	})

	it('turns a display off when the draft sets it to null', () => {
		const proposal = proposalOf(orders(FIELDS))
		const draft = draftFromProposal(proposal)
		draft.resources[0].fields[0].display = null
		const [sent] = settledInput(proposal, draft).resources
		expect(sent.fields[0].display).toBeNull()
		expect(sent.tabs).toBeNull()
	})
})

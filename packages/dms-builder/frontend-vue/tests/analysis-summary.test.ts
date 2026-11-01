import { describe, expect, it } from 'vitest'
import { analysisSummary } from '../app/runtime/analysis-summary'
import { assistantMessage } from '../app/runtime/database-build'
import type { MappingProposal, ProposedField, ProposedResource } from '../app/runtime/database-types'

function proposed<T>(value: T) {
	return { value, rule: 'R1', kind: 'default' as const }
}

function field(column: string, extra: Partial<ProposedField> = {}): ProposedField {
	const choice = <T>(value: T) => proposed(value)
	return {
		column,
		native: 'text',
		accepts: [],
		declared: proposed('string'),
		label: proposed(column),
		listable: choice(true),
		filterable: choice(true),
		sortable: choice(true),
		searchable: choice(false),
		...extra,
	}
}

const ORDERS: ProposedResource = {
	relation: 'public.orders',
	tableView: proposed(true),
	writable: proposed(false),
	label: proposed('number'),
	title: proposed('Orders'),
	rows: 1200,
	leftOut: [],
	writes: { insert: false, update: false, delete: false },
	fields: [
		field('ordered_at', { profile: { traits: ['time-axis'], range: { min: '2024-01-02', max: '2025-06-30' } } }),
		field('total', { profile: { traits: ['measure'] } }),
		field('status', {
			profile: {
				traits: ['enum-like'],
				categories: [
					{ value: 'paid', rows: 900 },
					{ value: 'open', rows: 300 },
				],
			},
		}),
		field('customer_id', { relation: { ...proposed('public.customers'), implied: false } }),
	],
}

const PROPOSAL: MappingProposal = {
	connection: 'shop',
	module: 'shop-tables',
	database: { engine: 'postgresql', role: 'reader', writes: 'none' },
	resources: [ORDERS],
	excluded: [{ relation: 'public.audit_log', reason: 'a log', rule: 'R3' }],
	open: [],
}

describe('analysisSummary', () => {
	it('carries rows, time axis range, measures, categories, label and relations in one block', () => {
		const text = analysisSummary(PROPOSAL)
		expect(text).toContain('public.orders (1200 rows, page)')
		expect(text).toContain('label number')
		expect(text).toContain('ordered_at 2024-01-02 to 2025-06-30')
		expect(text).toContain('measures: total')
		expect(text).toContain('status: paid (900), open (300)')
		expect(text).toContain('customer_id -> public.customers')
		expect(text).toContain('public.audit_log (a log)')
	})

	it('rides in the assistant hand-off only when a proposal is given', () => {
		expect(assistantMessage('shop', 'shop-tables')).not.toContain('Analysis summary')
		expect(assistantMessage('shop', 'shop-tables', PROPOSAL)).toContain('Analysis summary')
	})
})

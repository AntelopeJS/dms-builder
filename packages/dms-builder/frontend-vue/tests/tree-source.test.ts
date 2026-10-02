import { describe, expect, it } from 'vitest'
import {
	branchingOf,
	defaultLabel,
	linksTo,
	nextRanking,
	parentTree,
	relationTarget,
	rowsLevel,
	selfRelation,
	treeProblem,
	withBranching,
	withRanking,
} from '../app/runtime/tree-source'
import type { ResourceFieldStructure, ResourceStructure } from '../app/runtime/types'

/**
 * A tree read from tables, as the panel builds it: which way it branches, the
 * columns that link one table to another, and what is still missing before the
 * DMS can read it.
 */

const field = (name: string, $dataType: string, target?: string): ResourceFieldStructure => ({
	name,
	dataType: {
		$dataType,
		...(target ? { config: { dataApiController: { $ref: { resource: target } } } } : {}),
	},
})

const table = (ref: string, fields: ResourceFieldStructure[]): ResourceStructure => ({
	ref,
	className: ref,
	tableName: `${ref}s`,
	route: `/api/${ref}`,
	fields: [field('_id', 'string'), ...fields],
	version: '1',
})

const category = table('category', [field('name', 'string'), field('parent', 'relation', 'category')])
const customer = table('customer', [field('name', 'string')])
const order = table('order', [
	field('amount', 'number'),
	field('customer', 'relation', 'customer'),
	field('createdAt', 'date'),
])

describe('the columns linking tables', () => {
	it('name the table a relation column points at', () => {
		expect(relationTarget(order.fields[2]!)).toBe('customer')
		expect(relationTarget(order.fields[1]!)).toBeUndefined()
	})

	it('find the column of a table pointing at its own rows', () => {
		expect(selfRelation(category)).toBe('parent')
		expect(selfRelation(customer)).toBeUndefined()
	})

	it('find the columns of other tables pointing at a table', () => {
		expect(linksTo([category, customer, order], 'customer')).toEqual([
			{ resource: 'order', field: 'customer' },
		])
	})
})

describe('the way a tree branches', () => {
	it('is read off its levels', () => {
		expect(branchingOf({ levels: [{ resource: 'order', by: 'status' }, { resource: 'order' }] })).toBe(
			'columns',
		)
		expect(branchingOf(parentTree(category))).toBe('parent')
		expect(
			branchingOf({
				levels: [{ resource: 'customer' }, { resource: 'order', link: 'customer' }],
			}),
		).toBe('linked')
	})

	it('starts each way afresh from the same table, keeping the branches loaded as opened', () => {
		const lazy = { levels: [{ resource: 'category', label: ['name'] }], lazy: true }
		expect(withBranching(lazy, 'parent', category)).toEqual({
			levels: [{ resource: 'category', label: ['name'], parent: 'parent' }],
			lazy: true,
		})
		expect(withBranching(lazy, 'columns', order).levels).toEqual([
			{ resource: 'order', label: ['createdAt', 'amount'] },
		])
	})

	it('ranks by columns, ending on the rows or on a count', () => {
		const spec = withRanking(
			{ levels: [{ resource: 'order', label: ['amount'] }] },
			[{ by: 'status' }, { by: 'createdAt', every: 'month' }],
			{ label: ['amount'] },
		)
		expect(spec.levels).toEqual([
			{ resource: 'order', by: 'status' },
			{ resource: 'order', by: 'createdAt', every: 'month' },
			{ resource: 'order', label: ['amount'] },
		])
		expect(rowsLevel(withRanking(spec, [{ by: 'status' }], undefined))).toBeUndefined()
	})
})

describe('what a tree picks before anyone does', () => {
	it('names a row by its first text, or by when and how much, never by another row', () => {
		expect(defaultLabel(category)).toEqual(['name'])
		expect(defaultLabel(order), 'no text: the date, then the amount').toEqual([
			'createdAt',
			'amount',
		])
		expect(defaultLabel(category, ['name']), 'nor by what its branch already says').toEqual([])
	})

	it('ranks first by a value many rows share, a number last', () => {
		const status = table('ticket', [
			field('amount', 'number'),
			field('openedAt', 'date'),
			field('state', 'status'),
		])
		expect(nextRanking(status, [])).toBe('state')
		expect(nextRanking(status, ['state'])).toBe('openedAt')
		expect(nextRanking(status, ['state', 'openedAt'])).toBe('amount')
		expect(nextRanking(status, ['state', 'openedAt', 'amount'])).toBeUndefined()
	})
})

describe('what a tree still misses', () => {
	it('is said in a sentence, or nothing once it can be read', () => {
		expect(treeProblem({ levels: [] })).toBe('Pick the table it reads.')
		expect(treeProblem({ levels: [{ resource: 'order', by: '' }] })).toMatch(/ranks by/)
		expect(
			treeProblem({ levels: [{ resource: 'customer' }, { resource: 'order' }] }),
		).toMatch(/links to the one above/)
		expect(treeProblem(parentTree(category))).toBeUndefined()
	})
})

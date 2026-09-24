import { describe, expect, it } from 'vitest'
import {
	askedColumns,
	boundTo,
	fieldFor,
	fillableColumns,
	formTableOf,
	takesRows,
	withColumn,
	withoutColumn,
} from '../app/runtime/form-table'
import type { ResourceStructure, ResourceSummary } from '../app/runtime/types'

/**
 * A form saving into a table: the table is the one whose create route the form
 * submits to, and each column it asks for is a field sent under its name.
 */

const orders: ResourceSummary = {
	ref: 'order',
	className: 'orderDataAPI',
	tableName: 'orders',
	route: '/api/order',
	fieldCount: 4,
}

function structure(): ResourceStructure {
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
				dataType: { $dataType: 'number', config: { min: 0 } },
			},
			{ name: 'createdAt', access: 'readwrite', dataType: { $dataType: 'date' } },
			{ name: 'legacy', access: 'readwrite', opaque: true },
		],
	}
}

describe('the table a form saves into', () => {
	it('is the one whose create route the form submits to', () => {
		expect(formTableOf({ submitUrl: '/api/order/new' }, [orders])).toBe(orders)
		expect(formTableOf({ submitUrl: '/test' }, [orders])).toBe(undefined)
		expect(formTableOf({}, [orders])).toBe(undefined)
	})

	it('takes rows unless its routes say it does not', () => {
		expect(takesRows(structure())).toBe(true)
		expect(takesRows({ ...structure(), routes: ['list'] })).toBe(false)
		expect(takesRows({ ...structure(), routes: undefined })).toBe(true)
	})
})

describe('the columns a form can ask for', () => {
	it('are those a row is written with, and none the builder cannot read', () => {
		expect(fillableColumns(structure()).map((column) => column.name)).toEqual([
			'amount',
			'createdAt',
		])
	})

	it('each make a field sent under the column name, with its label and type', () => {
		const [amount, createdAt] = fillableColumns(structure())
		expect(fieldFor(amount!)).toEqual({
			id: 'amount',
			label: 'Amount',
			type: { $dataType: 'number', config: { min: 0 } },
			required: true,
		})
		expect(fieldFor(createdAt!)).toEqual({
			id: 'createdAt',
			label: 'Created at',
			type: { $dataType: 'date', config: {} },
		})
	})
})

describe('a form bound to a table', () => {
	it('submits to its create route, loads from nowhere, and asks for every column', () => {
		const options = boundTo(orders, fillableColumns(structure()))
		expect(options).toMatchObject({
			submitUrl: '/api/order/new',
			submitUrlMethod: 'POST',
			fetchUrl: undefined,
		})
		expect(askedColumns(options.fields)).toEqual(new Set(['amount', 'createdAt']))
	})

	it('asks for a column once it is ticked, and stops once it is not', () => {
		const [amount, createdAt] = fillableColumns(structure())
		const fields = [fieldFor(amount!)]
		const more = withColumn(fields, createdAt!)
		expect(askedColumns(more)).toEqual(new Set(['amount', 'createdAt']))

		expect(askedColumns(withoutColumn(more, 'amount'))).toEqual(
			new Set(['createdAt']),
		)
	})

	it('finds a column asked for inside a group, and takes it out of there', () => {
		const grouped = [{ id: 'details', label: 'Details', fields: [{ id: 'amount' }] }]
		expect(askedColumns(grouped).has('amount')).toBe(true)
		expect(withoutColumn(grouped, 'amount')).toEqual([
			{ id: 'details', label: 'Details', fields: [] },
		])
	})
})

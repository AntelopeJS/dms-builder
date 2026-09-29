import { describe, expect, it } from 'vitest'
import { readAfterSubmit, writeAfterSubmit } from '../app/runtime/after-submit'
import { savedRowOf } from '../app/runtime/resource-form-panel'

/**
 * Where a form goes once sent is one address on the block, the row it opens a
 * page on a variable inside it. The simple mode reads it as a page and a box
 * ticked, and writes the variable itself.
 */

describe('where a form goes once sent', () => {
	it('stays on the page when it holds no address', () => {
		expect(readAfterSubmit(undefined, true)).toBeUndefined()
		expect(readAfterSubmit('', true)).toBeUndefined()
		expect(writeAfterSubmit(undefined, true, '{{response._id}}')).toBeUndefined()
	})

	it('reads a page opened on the row just saved as the page, ticked', () => {
		expect(readAfterSubmit('/shop/order?id={{response._id}}', true)).toEqual({
			page: '/shop/order',
			openRow: true,
		})
		expect(readAfterSubmit('/shop/order?id={{query.id}}', true)).toEqual({
			page: '/shop/order',
			openRow: true,
		})
		expect(readAfterSubmit('/shop/orders', true)).toEqual({
			page: '/shop/orders',
			openRow: false,
		})
	})

	it('keeps any other address whole, as written in code', () => {
		for (const written of [
			'/shop/order/{{response._id}}',
			'/shop/order?id={{response._id}}&tab=2',
			'/shop/order?ref={{response._id}}',
		]) {
			expect(readAfterSubmit(written, true)).toEqual({
				page: written,
				openRow: false,
			})
		}
	})

	it('reads no row off for a form that cannot open a page on one', () => {
		expect(readAfterSubmit('/shop/order?id={{response._id}}', false)).toEqual({
			page: '/shop/order?id={{response._id}}',
			openRow: false,
		})
	})

	it('writes the row it saved into the address, when it knows it', () => {
		expect(writeAfterSubmit('/shop/order', true, '{{response._id}}')).toBe(
			'/shop/order?id={{response._id}}',
		)
		expect(writeAfterSubmit('/shop/order', false, '{{response._id}}')).toBe(
			'/shop/order',
		)
		expect(writeAfterSubmit('/shop/order', true, undefined)).toBe('/shop/order')
	})
})

describe('the row a table form saves', () => {
	it('is the one it created, or the one it edits', () => {
		expect(savedRowOf('new', undefined)).toBe('{{response._id}}')
		expect(savedRowOf('edit', undefined)).toBe('{{query.id}}')
		expect(savedRowOf('edit', '{{params.id}}')).toBe('{{params.id}}')
	})

	it('is none for a form showing a row, or doing nothing yet', () => {
		expect(savedRowOf('view', undefined)).toBeUndefined()
		expect(savedRowOf(undefined, undefined)).toBeUndefined()
	})
})

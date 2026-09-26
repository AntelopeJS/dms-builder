import { describe, expect, it } from 'vitest'
import { fitsEditor, typedEditor } from '../app/runtime/typed-values'

/**
 * The input a field's default takes, read off the field's own data type.
 */

const as = (id: string, config: Record<string, unknown> = {}) => ({
	$dataType: id,
	config,
})

describe('the input a data type calls for', () => {
	it('is a number box for the kinds of number', () => {
		for (const id of ['number', 'price', 'percentage']) {
			expect(typedEditor(as(id))?.kind, id).toBe('number')
		}
	})

	it('is a text box for the kinds of text, and a larger one for rich text', () => {
		for (const id of ['string', 'email', 'phone', 'url']) {
			expect(typedEditor(as(id))?.kind, id).toBe('text')
		}
		expect(typedEditor(as('rich_text'))?.kind).toBe('longText')
	})

	it('is a switch, a date or a time for those', () => {
		expect(typedEditor(as('boolean'))?.kind).toBe('switch')
		expect(typedEditor(as('date'))?.kind).toBe('date')
		expect(typedEditor(as('string_time'))?.kind).toBe('time')
	})

	it('offers the choices of a list, and says whether it takes several', () => {
		const editor = typedEditor(
			as('select', {
				items: [{ label: 'Paid', value: 'paid' }, { value: 'sent' }, { label: 'x' }],
				multiple: true,
			}),
		)
		expect(editor).toEqual({
			kind: 'select',
			items: [
				{ label: 'Paid', value: 'paid' },
				{ label: 'sent', value: 'sent' },
			],
			multiple: true,
		})
	})

	it('is nothing for a type with no input of its own, which keeps the JSON box', () => {
		expect(typedEditor(as('relation'))).toBe(undefined)
		expect(typedEditor(as('date', { range: true })), 'a range of dates').toBe(
			undefined,
		)
		expect(typedEditor(undefined), 'no type chosen yet').toBe(undefined)
	})
})

describe('a value the input can show', () => {
	it('is of the kind the input holds', () => {
		expect(fitsEditor(3, { kind: 'number' })).toBe(true)
		expect(fitsEditor('3', { kind: 'number' })).toBe(false)
		expect(fitsEditor(false, { kind: 'switch' })).toBe(true)
		expect(fitsEditor('2026-09-24', { kind: 'date' })).toBe(true)
		expect(fitsEditor('tomorrow', { kind: 'date' })).toBe(false)
		expect(fitsEditor('09:30', { kind: 'time' })).toBe(true)
	})

	it('is one of the choices of a list, or several of them', () => {
		const items = [{ label: 'Paid', value: 'paid' }]
		expect(fitsEditor('paid', { kind: 'select', items })).toBe(true)
		expect(fitsEditor('lost', { kind: 'select', items })).toBe(false)
		expect(fitsEditor(['paid'], { kind: 'select', items, multiple: true })).toBe(
			true,
		)
	})
})

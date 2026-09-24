import { describe, expect, it } from 'vitest'
import { deriveKeys, keyFrom } from '../app/runtime/keys'
import { testCatalog } from './support/builder-harness'
import type { PageDraft } from '../app/runtime/types'

/**
 * The keys the simple mode writes, from the labels they follow.
 *
 * A key is the name a form's field is sent under. Written by the builder, it
 * follows its label; written by anyone else, it is never touched.
 */

const catalog = testCatalog()
const text = { $dataType: 'string', config: {} }

function form(fields: unknown[]): PageDraft {
	return { blocks: [{ name: 'form', type: 'Form', config: { fields } }] }
}

function keysOf(draft: PageDraft): unknown[] {
	const fields = (draft.blocks[0]?.config?.fields ?? []) as Array<
		Record<string, unknown>
	>
	return fields.map((field) => field.id)
}

function derived(fields: unknown[], before?: unknown[]): PageDraft {
	const draft = form(fields)
	deriveKeys(draft, before ? form(before) : null, catalog)
	return draft
}

describe('the key a label gives', () => {
	it('is the label in camel case, stripped to letters and digits', () => {
		expect(keyFrom('Delivery date')).toBe('deliveryDate')
		expect(keyFrom('Montant TTC (€)')).toBe('montantTtc')
		expect(keyFrom('Field 1')).toBe('field1')
	})

	it('drops the accents a key cannot carry, and keeps the letters', () => {
		expect(keyFrom('Délai éventuel')).toBe('delaiEventuel')
	})

	it('is nothing for a label that holds no letter or digit', () => {
		expect(keyFrom('—')).toBe(undefined)
		expect(keyFrom('')).toBe(undefined)
		expect(keyFrom(undefined)).toBe(undefined)
	})
})

describe('a key the builder writes', () => {
	it('is written for a field that has none, from its label', () => {
		expect(keysOf(derived([{ label: 'Amount', type: text }]))).toEqual(['amount'])
	})

	it('is named after the kind of entry when there is no label yet', () => {
		expect(keysOf(derived([{ type: text }]))).toEqual(['field'])
	})

	it('follows the label while it is still the key the label gave', () => {
		const before = [{ id: 'amount', label: 'Amount', type: text }]
		const after = [{ id: 'amount', label: 'Total', type: text }]
		expect(keysOf(derived(after, before))).toEqual(['total'])
	})

	it('follows it through the number that kept it apart from another', () => {
		const before = [
			{ id: 'amount', label: 'Amount', type: text },
			{ id: 'amount2', label: 'Amount', type: text },
		]
		const after = [
			{ id: 'amount', label: 'Amount', type: text },
			{ id: 'amount2', label: 'Tax', type: text },
		]
		expect(keysOf(derived(after, before))).toEqual(['amount', 'tax'])
	})

	it('never takes a key another field already holds', () => {
		expect(
			keysOf(
				derived([
					{ label: 'Amount', type: text },
					{ id: 'amount', label: 'Something else', type: text },
				]),
			),
		).toEqual(['amount2', 'amount'])
	})
})

describe('a key someone else wrote', () => {
	it('is kept when the label changes', () => {
		const before = [{ id: 'test', label: 'aaa', type: text }]
		const after = [{ id: 'test', label: 'Amount', type: text }]
		expect(keysOf(derived(after, before))).toEqual(['test'])
	})

	it('is kept when it was just typed, even over what the label would give', () => {
		const before = [{ id: 'amount', label: 'Amount', type: text }]
		const after = [{ id: 'sum', label: 'Amount', type: text }]
		expect(keysOf(derived(after, before))).toEqual(['sum'])
	})

	it('is left alone on a block kept as written', () => {
		const draft: PageDraft = { blocks: [{ name: 'form', preserve: true }] }
		deriveKeys(draft, null, catalog)
		expect(draft.blocks[0]).toEqual({ name: 'form', preserve: true })
	})
})

import { describe, expect, it } from 'vitest'
import {
	actionOn,
	actionTurned,
	columnsInOrder,
	ruled,
	serves,
} from '../app/runtime/table-panel'
import type { ResourceStructure } from '../app/runtime/types'

describe('a row action, as a table reads it', () => {
	it('is what the table does when left unset', () => {
		expect(actionOn(undefined, true)).toBe(true)
		expect(actionOn(undefined, false)).toBe(false)
	})

	it('is on under a rule unless the rule turns it off', () => {
		expect(actionOn({ rule: { field: 'a' } }, false)).toBe(true)
		expect(actionOn({ isEnabled: false, rule: { field: 'a' } }, true)).toBe(false)
	})

	it('goes back to unset when turned back to what the table does', () => {
		expect(actionTurned(false, true, true)).toBeUndefined()
		expect(actionTurned(undefined, false, true)).toBe(false)
		expect(actionTurned(undefined, true, false)).toBe(true)
	})

	it('keeps its rule when turned off', () => {
		const rule = { field: 'status', equals: 'paid' }
		expect(actionTurned({ rule }, false, true)).toEqual({ rule, isEnabled: false })
		expect(ruled({ rule })).toBe(true)
		expect(ruled(true)).toBe(false)
	})
})

describe('a table, as its block lists it', () => {
	it('lays its columns out by rank, the unranked first in their order', () => {
		const fields = [
			{ name: 'c', order: 2 },
			{ name: 'a' },
			{ name: 'b', order: 1 },
			{ name: 'd' },
		]
		expect(columnsInOrder(fields).map((field) => field.name)).toEqual([
			'a',
			'd',
			'b',
			'c',
		])
	})

	it('serves every route when its API names none', () => {
		const table = { routes: ['list', 'get'] } as ResourceStructure
		expect(serves(table, 'list')).toBe(true)
		expect(serves(table, 'edit')).toBe(false)
		expect(serves({ routes: undefined } as ResourceStructure, 'edit')).toBe(true)
	})
})

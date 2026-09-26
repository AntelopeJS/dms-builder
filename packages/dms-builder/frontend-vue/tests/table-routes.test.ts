import { describe, expect, it } from 'vitest'
import { servedWith, serves } from '../app/runtime/table-routes'
import type { ResourceStructure } from '../app/runtime/types'

/** The routes a table's API serves, as every panel reads them. */

describe('the routes a table serves', () => {
	it('are the ones its API names', () => {
		const table = { routes: ['list', 'get'] } as ResourceStructure
		expect(serves(table, 'list')).toBe(true)
		expect(serves(table, 'create')).toBe(false)
	})

	it('are all of them when its API names none', () => {
		expect(serves({ routes: undefined } as ResourceStructure, 'edit')).toBe(true)
		expect(serves(undefined, 'create')).toBe(true)
	})

	it('take one more route turned on, the others kept', () => {
		const table = { routes: ['list', 'get'] } as ResourceStructure
		expect(servedWith(table, 'create')).toEqual(['list', 'get', 'create'])
		expect(servedWith(table, 'list')).toEqual(['list', 'get'])
	})
})

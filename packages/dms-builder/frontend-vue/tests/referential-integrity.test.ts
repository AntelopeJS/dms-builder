import { describe, expect, it } from 'vitest'
import { describeError } from '../app/runtime/errors'

/**
 * A delete the engine refuses because something else still points at the
 * target: a table another table relates to, a category holding pages.
 */
describe('a delete refused over what still depends on it', () => {
	it('names what has to go first', () => {
		expect(
			describeError(
				{ code: 'referential_integrity', blockedBy: ['invoice', 'ticket'] },
				null,
			),
		).toBe('Still used by invoice, ticket. Remove those first.')
	})

	it('falls back to a generic sentence when it names nothing', () => {
		expect(
			describeError({ code: 'referential_integrity', blockedBy: [] }, null),
		).toBe('Something still depends on this.')
	})
})

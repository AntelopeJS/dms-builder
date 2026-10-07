import { describe, expect, it } from 'vitest'
import {
	fixedGapPatch,
	shownSpacerRoom,
	spacerAxis,
	spacerRoom,
	spacerRoomPatch,
} from '../app/runtime/spacer-panel'

/**
 * A spacer's three numbers, read as the room it takes and written back from
 * the way picked. The DMS lays it out as a flex item: `grow` its share of the
 * free room, `minSize` and `maxSize` the bounds of its size.
 */

describe('the room a spacer takes, read off its numbers', () => {
	it('is all the free room for a spacer set to nothing', () => {
		expect(spacerRoom({})).toBe('fill')
		expect(spacerRoom({ grow: 3 })).toBe('fill')
	})

	it('is a gap when it does not grow and is held to one size', () => {
		expect(spacerRoom({ grow: 0, minSize: '24px', maxSize: '24px' })).toBe('fixed')
	})

	it('is bounded when either bound is set', () => {
		expect(spacerRoom({ minSize: '16px' })).toBe('bounded')
		expect(spacerRoom({ maxSize: '10%' })).toBe('bounded')
		expect(
			spacerRoom({ grow: 1, minSize: '24px', maxSize: '24px' }),
			'one size, but growing into it',
		).toBe('bounded')
	})

	it('takes an empty bound for none', () => {
		expect(spacerRoom({ minSize: '', maxSize: '  ' })).toBe('fill')
	})
})

describe('what picking a way writes', () => {
	it('drops the bounds to fill the room, keeping a share of at least one', () => {
		expect(spacerRoomPatch('fill', { grow: 2, minSize: '8px' })).toEqual({
			grow: 2,
			minSize: undefined,
			maxSize: undefined,
		})
		expect(spacerRoomPatch('fill', { grow: 0, minSize: '8px', maxSize: '8px' })).toEqual({
			grow: 1,
			minSize: undefined,
			maxSize: undefined,
		})
	})

	it('holds a gap to a size, the bound already set or a default one', () => {
		expect(spacerRoomPatch('fixed', {})).toEqual({ grow: 0, minSize: '24px', maxSize: '24px' })
		expect(spacerRoomPatch('fixed', { maxSize: '3rem' })).toEqual({
			grow: 0,
			minSize: '3rem',
			maxSize: '3rem',
		})
	})

	it('keeps the bounds there are to bound the room', () => {
		expect(spacerRoomPatch('bounded', { grow: 2 })).toEqual({
			grow: 2,
			minSize: undefined,
			maxSize: undefined,
		})
		expect(spacerRoomPatch('bounded', { grow: 0, minSize: '24px', maxSize: '24px' })).toEqual({
			grow: 1,
			minSize: '24px',
			maxSize: '24px',
		})
	})

	it("writes a gap's size as both bounds", () => {
		expect(fixedGapPatch('32px')).toEqual({ grow: 0, minSize: '32px', maxSize: '32px' })
		expect(fixedGapPatch('')).toEqual({ grow: 0, minSize: undefined, maxSize: undefined })
	})
})

describe('the way the panel shows', () => {
	it('is the one picked while its bounds are still to set', () => {
		expect(shownSpacerRoom('bounded', { grow: 1 })).toBe('bounded')
	})

	it("is the one picked while a gap's size is retyped", () => {
		expect(shownSpacerRoom('fixed', { grow: 0 })).toBe('fixed')
	})

	it('is the one the numbers make once they no longer fit the pick', () => {
		expect(shownSpacerRoom('fixed', { grow: 1 }), 'an undo took the gap back').toBe('fill')
		expect(shownSpacerRoom('fill', { minSize: '8px' })).toBe('bounded')
		expect(shownSpacerRoom(null, { grow: 0, minSize: '8px', maxSize: '8px' })).toBe('fixed')
	})
})

describe('what a spacer\'s share counts in', () => {
	it('is columns in a row of the grid, lines stacked between blocks, else its part', () => {
		expect(spacerAxis('GridRow')).toBe('columns')
		expect(spacerAxis(null), 'among the page\'s blocks').toBe('lines')
		expect(spacerAxis('Tab')).toBe('lines')
		expect(spacerAxis('VStack')).toBe('lines')
		expect(spacerAxis('HStack')).toBe('share')
	})

	it('reads a stacked spacer\'s lines as the free room, not as bounds', () => {
		expect(spacerRoom({ grow: 2, minSize: '48px' })).toBe('fill')
		expect(spacerRoom({ minSize: '24px' })).toBe('fill')
		expect(spacerRoom({ grow: 2, minSize: '30px' })).toBe('bounded')
		expect(spacerRoom({ grow: 2, minSize: '48px', maxSize: '80px' })).toBe('bounded')
	})

	it('fills as many lines as its share once stacked', () => {
		expect(spacerRoomPatch('fill', { grow: 0, minSize: '8px', maxSize: '8px' }, 'lines')).toEqual({
			grow: 1,
			minSize: '24px',
			maxSize: undefined,
		})
		expect(spacerRoomPatch('fill', { grow: 2, minSize: '8px' }, 'share')).toEqual({
			grow: 2,
			minSize: undefined,
			maxSize: undefined,
		})
	})
})

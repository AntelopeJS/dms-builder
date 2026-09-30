/**
 * A spacer, as the simple mode's panel edits it: by how much room it takes
 * rather than by the three numbers that say so.
 *
 * The DMS lays a spacer out as a flex item: `grow` is its share of the room
 * left free, and `minSize` / `maxSize` bound its size, across the row or down
 * the column it sits in. The panel offers the three behaviours those numbers
 * make, and writes the numbers for the one picked.
 */

/** The block the simple mode edits with a panel of its own. */
export const SPACER_BLOCK = 'Spacer'

/** The options that panel edits: all of the spacer's. */
export const SPACER_PANEL_OPTIONS = new Set(['minSize', 'maxSize', 'grow'])

/** What a spacer grows by when nothing says: the DMS's own default. */
export const SPACER_DEFAULT_GROW = 1

/** The gap a spacer turned fixed starts from, until the author sets one. */
export const FIXED_GAP = '24px'

/**
 * How much room a spacer takes:
 *
 * - `fill`, all the room left free, pushing the blocks around it apart;
 * - `fixed`, always the same size, a gap;
 * - `bounded`, the room left free, between a minimum and a maximum.
 */
export type SpacerRoom = 'fill' | 'fixed' | 'bounded'

export const SPACER_ROOMS: ReadonlyArray<{
	room: SpacerRoom
	label: string
	description: string
}> = [
	{
		room: 'fill',
		label: 'All the free room',
		description: 'Pushes the blocks around it apart.',
	},
	{
		room: 'fixed',
		label: 'A fixed gap',
		description: 'Always the same size, say 24px.',
	},
	{
		room: 'bounded',
		label: 'The free room, within limits',
		description: 'Grows, but between a minimum and a maximum.',
	},
]

function length(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** The share of the free room a spacer takes. */
export function spacerGrow(config: Record<string, unknown>): number {
	return typeof config.grow === 'number' ? config.grow : SPACER_DEFAULT_GROW
}

/**
 * The behaviour a spacer's numbers make. A spacer that does not grow and is
 * held to one size is a gap; one held by either bound, a bounded one; any
 * other takes the room it is given.
 */
export function spacerRoom(config: Record<string, unknown>): SpacerRoom {
	const min = length(config.minSize)
	const max = length(config.maxSize)
	if (min !== undefined && min === max && spacerGrow(config) === 0) {
		return 'fixed'
	}
	return min !== undefined || max !== undefined ? 'bounded' : 'fill'
}

/**
 * What picking a behaviour writes. Each keeps what it can of the one before:
 * a gap turned bounded keeps its size as both bounds, a share kept through a
 * gap comes back as it was left — at least one, or the spacer takes nothing.
 */
export function spacerRoomPatch(
	room: SpacerRoom,
	config: Record<string, unknown>,
): Record<string, unknown> {
	const share = Math.max(spacerGrow(config), 1)
	const min = length(config.minSize)
	const max = length(config.maxSize)
	switch (room) {
		case 'fill':
			return { grow: share, minSize: undefined, maxSize: undefined }
		case 'fixed': {
			const size = min ?? max ?? FIXED_GAP
			return { grow: 0, minSize: size, maxSize: size }
		}
		case 'bounded':
			return { grow: share, minSize: min, maxSize: max }
	}
}

/**
 * The behaviour the panel shows: the one picked, while the numbers still fit
 * it, else the one the numbers make.
 *
 * A pick can be ahead of the numbers — bounds not set yet, a gap's size
 * emptied while it is retyped — and the panel keeps showing it rather than
 * jumping to another. Numbers it no longer fits, an undo for one, win.
 */
export function shownSpacerRoom(
	picked: SpacerRoom | null,
	config: Record<string, unknown>,
): SpacerRoom {
	const made = spacerRoom(config)
	const grow = spacerGrow(config)
	const unbounded =
		length(config.minSize) === undefined && length(config.maxSize) === undefined
	const fits: Record<SpacerRoom, boolean> = {
		fill: made === 'fill',
		fixed: made === 'fixed' || (grow === 0 && unbounded),
		bounded: made !== 'fixed' && grow > 0,
	}
	return picked && fits[picked] ? picked : made
}

/** A gap's size, written as both bounds so the spacer holds to it. */
export function fixedGapPatch(size: string): Record<string, unknown> {
	const value = length(size)
	return { grow: 0, minSize: value, maxSize: value }
}

import { FILTER_WORDS, MEASURE_WORDS } from '../runtime/data-source'
import type { QueryPoint, QueryResponseShape } from '../runtime/types'

/** Measures a source can take, in the order someone reaches for them. */
export const MEASURES = Object.entries(MEASURE_WORDS).map(([value, label]) => ({
	label,
	value,
}))

export const BUCKETS = [
	{ label: 'by Day', value: 'day' },
	{ label: 'by Month', value: 'month' },
	{ label: 'by Quarter', value: 'quarter' },
	{ label: 'by Year', value: 'year' },
]

export const FILTER_OPS = Object.entries(FILTER_WORDS).map(([value, label]) => ({
	label,
	value,
}))

/** A preview is narrow: its labels lie flat, the ones that would overlap left out. */
export const PREVIEW_X_AXIS = { rotate: 0, hideOverlappingLabels: true }

/** The most groups a series keeps, as the engine bounds it. */
export const MAX_LIMIT = 1000

/**
 * The scope a card bound to a period follows: the one a period selector drives
 * when nobody named another, so a page with one selector needs no wiring.
 */
export const PAGE_PERIOD_SCOPE = 'page'

/**
 * What a source may be refined by beyond what it measures. Each is off until
 * ticked, and unticking one puts it back as the source is without it.
 */
export type Refinement = 'sort' | 'top' | 'conditions' | 'period'

export const REFINEMENTS: { kind: Refinement; label: string }[] = [
	{ kind: 'sort', label: 'Sort' },
	{ kind: 'top', label: 'Top groups' },
	{ kind: 'conditions', label: 'Conditions' },
	{ kind: 'period', label: 'Period' },
]

export interface DraftFilter {
	field: string
	op: string
	value: string
}

/**
 * A filter as the engine takes it. The value is not a string: a period bound is
 * written as a parameter the route supplies, not as a literal.
 */
export interface QueryFilter {
	field: string
	op: string
	value: unknown
}

/** The block option this editor writes the URL into. */
export const PROP = 'fetchUrl'
/**
 * The arrangements that rank their groups: a top list reads largest first until
 * someone sorts it otherwise, where a chart keeps its groups along their axis.
 */
export const RANKED_SHAPES = new Set(['items'])

/** The arrangements the engine knows how to build a route for. */
export const RESPONSE_SHAPES: QueryResponseShape[] = [
	'series',
	'card',
	'value',
	'items',
]

/* ---- what it answers ---------------------------------------------------- */

/** A point as either arrangement writes one; a card's `y` may be unmeasured. */
export function asPoint(entry: unknown): QueryPoint | undefined {
	const point = entry as { x?: unknown; y?: unknown }
	if (point === null || typeof point !== 'object' || !('x' in point)) {
		return undefined
	}
	return {
		x: point.x as number | string,
		y: typeof point.y === 'number' ? point.y : 0,
	}
}

/** The points of a series, whether handed bare or inside a named chart series. */
export function pointsOf(series: unknown): QueryPoint[] {
	if (!Array.isArray(series)) {
		return []
	}
	const direct = series.map(asPoint).filter((point) => point !== undefined)
	if (direct.length === series.length) {
		return direct as QueryPoint[]
	}
	const data = (series[0] as { data?: unknown })?.data
	return Array.isArray(data)
		? (data.map(asPoint).filter((point) => point !== undefined) as QueryPoint[])
		: []
}

/** A ranking's entries as points: each group by its title, at its value. */
export function itemPoints(items: unknown): QueryPoint[] {
	if (!Array.isArray(items)) {
		return []
	}
	return items
		.filter(
			(item): item is { id?: unknown; title?: unknown; value: number } =>
				typeof (item as { value?: unknown })?.value === 'number',
		)
		.map((item) => ({ x: String(item.title ?? item.id ?? ''), y: item.value }))
}

/** The props DataSource takes. */
export interface Props {
	/** The URL currently written on the block, if any. */
	modelValue: unknown
	/** What the block does with the answer, from its own declaration. */
	responseShape?: string
	/** The block's period option, written alongside when a period is bound. */
	periodOption?: string
	/** The block being configured, used to name the query it reads. */
	blockName: string
	/**
	 * Whether the block's own editor shows no preview: a chart card draws on the
	 * page itself as it is set up, and a second chart in the panel says nothing
	 * more.
	 */
	withoutPreview?: boolean
}

/** The events DataSource emits. */
export interface Emits {
	/** The URL to write on the block, plus any sibling option it implies. */
	patch: [Record<string, unknown>]
}

/** The emit function DataSource's parts are handed. */
export type EmitFn = <Event extends keyof Emits>(
	event: Event,
	...payload: Emits[Event]
) => void

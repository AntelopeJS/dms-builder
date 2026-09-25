/**
 * A chart card, as the simple mode's panel edits it: what it is called, the
 * chart it draws with, the source it measures, its headline figure, and how it
 * looks.
 */

/** The block the simple mode edits with a panel of its own. */
export const CHART_CARD_BLOCK = 'ChartCard'

/**
 * The options that panel edits. Whatever else the block declares is still
 * offered the way any block's options are.
 */
export const CHART_CARD_PANEL_OPTIONS = new Set([
	'title',
	'description',
	'icon',
	'chart',
	'fetchUrl',
	'valueFormat',
	'currencyCode',
	'showDelta',
	'showLegend',
	'primaryLabel',
	'comparisonLabel',
])

/** The chart types offered first, in the order someone reaches for them. */
export const MAIN_CHART_TYPES = [
	'ChartColumn',
	'ChartBar',
	'ChartLine',
	'ChartArea',
	'ChartDonut',
	'ChartPie',
]

/** The types drawn along a line, which the source's preview draws as one. */
export const LINE_CHART_TYPES = new Set([
	'ChartLine',
	'ChartArea',
	'ChartRangeArea',
	'ChartMixed',
])

/** The chart's switches the Look card sets itself, where the chart has them. */
export const LOOK_SWITCHES = [
	{ key: 'showTooltip', label: 'Figures on hover', icon: 'i-ph-chat-centered-text' },
	{ key: 'showGrid', label: 'Grid lines', icon: 'i-ph-grid-four' },
	{ key: 'roundedCorners', label: 'Rounded corners', icon: 'i-ph-bounding-box' },
	{ key: 'stacked', label: 'Stacked', icon: 'i-ph-stack' },
	{ key: 'smooth', label: 'Smooth line', icon: 'i-ph-wave-sine' },
]

/** The chart option holding its colour, which the Look card sets as swatches. */
export const COLOUR_OPTION = 'color'

/** The headline's formats, as an author reads them. */
export const FORMAT_LABELS: Record<string, string> = {
	number: 'Number',
	currency: 'Currency',
	percent: 'Percent',
	compact: 'Compact',
}

/** A block held in an option: its type and its own options. */
export interface HeldBlock {
	type?: string
	config: Record<string, unknown>
}

export function heldBlock(value: unknown): HeldBlock {
	const held = (value as { $block?: { type?: unknown; config?: unknown } } | undefined)
		?.$block
	return {
		type: typeof held?.type === 'string' ? held.type : undefined,
		config:
			typeof held?.config === 'object' && held.config !== null
				? (held.config as Record<string, unknown>)
				: {},
	}
}

/**
 * What a chart type is called on its tile: the catalog's name without the word
 * every one of them carries — "Line Chart" is a Line among charts.
 */
export function chartTypeLabel(label: string | undefined, type: string): string {
	const name = label ?? type.replace(/^Chart/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
	return name.replace(/\s*Chart$/, '') || name
}

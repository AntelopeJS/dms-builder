import { CHART_CARD_BLOCK, CHART_CARD_PANEL_OPTIONS } from '../runtime/chart-card'
import {
	KPI_CARD_BLOCK,
	KPI_CARD_PANEL_OPTIONS,
	TOP_LIST_BLOCK,
	TOP_LIST_PANEL_OPTIONS,
} from '../runtime/figure-panel'
import { FORM_PANEL_OPTIONS } from '../runtime/form-panel'
import { FORM_BLOCK } from '../runtime/form-table'
import {
	RESOURCE_FORM_BLOCK,
	RESOURCE_FORM_PANEL_OPTIONS,
} from '../runtime/resource-form-panel'
import { SPACER_BLOCK, SPACER_PANEL_OPTIONS } from '../runtime/spacer-panel'
import { TABLE_BLOCK, TABLE_PANEL_OPTIONS } from '../runtime/table-panel'
import { TABS_BLOCK, TABS_PANEL_OPTIONS } from '../runtime/tabs-panel'
import type { OptionSchema } from '../runtime/types'

export interface RenderedOption {
	id: string
	name: string
	schema: OptionSchema
	value: unknown
	update: (value: unknown) => void
	separated?: boolean
}

/** Options offered together behind one switch, by the switch's label. */
export interface RenderedOptIn {
	id: string
	optIn: string
	options: RenderedOption[]
}

export interface RenderedGroup {
	id: string
	label: string
	options: RenderedOption[]
}

/**
 * The block that has a search bar. Every block reading a table shares its
 * fields, but a form over one has nothing to search, and a picker there would
 * rewrite the table's search for a setting that block never reads.
 */
export const SEARCH_BAR_BLOCK = TABLE_BLOCK

/**
 * The blocks with a panel of their own in the simple mode, and the options
 * each panel edits; whatever else a block declares is offered below it.
 *
 * - a form saves into a table its author picks, not into an endpoint typed;
 * - a table form says what it does with a row, and where it goes once sent,
 *   with no variable to type;
 * - a table lists one picked from the tables there are, their columns beside;
 * - a chart card draws a chart picked by how it draws, measuring what is
 *   built from a table, the rest folded away behind a line each;
 * - a spacer takes the room picked among three ways, each drawn, rather than
 *   three numbers;
 * - a tab set lists its tabs a line each, the open one's details under it,
 *   and how it looks a line per setting;
 * - a KPI card and a top list fold their figures' format, their trend and a
 *   list's ranking behind a line each, a setting showing only once it applies.
 */
/**
 * The inspector's tabs, by what they hold. A block with a panel of its own
 * names the tabs its panel fills; any other block gets the three every block
 * has, each shown once something lands in it.
 */
export type InspectorTab = 'content' | 'fields' | 'data' | 'actions' | 'after' | 'style'

export const TAB_LABELS: Record<InspectorTab, string> = {
	content: 'Content',
	fields: 'Fields',
	data: 'Data',
	actions: 'Actions',
	after: 'After submit',
	style: 'Style',
}

export interface Panel {
	component: string
	options: ReadonlySet<string>
	tabs: InspectorTab[]
}

export const PANELS: Record<string, Panel> = {
	[FORM_BLOCK]: {
		component: 'DmsBuilderFormPanel',
		options: FORM_PANEL_OPTIONS,
		tabs: ['fields', 'after', 'style'],
	},
	[RESOURCE_FORM_BLOCK]: {
		component: 'DmsBuilderResourceFormPanel',
		options: RESOURCE_FORM_PANEL_OPTIONS,
		tabs: ['fields', 'after', 'style'],
	},
	[TABLE_BLOCK]: {
		component: 'DmsBuilderTablePanel',
		options: TABLE_PANEL_OPTIONS,
		tabs: ['content', 'actions', 'style'],
	},
	[CHART_CARD_BLOCK]: {
		component: 'DmsBuilderChartCardPanel',
		options: CHART_CARD_PANEL_OPTIONS,
		tabs: ['content', 'data', 'style'],
	},
	[SPACER_BLOCK]: {
		component: 'DmsBuilderSpacerPanel',
		options: SPACER_PANEL_OPTIONS,
		tabs: ['content', 'style'],
	},
	[TABS_BLOCK]: {
		component: 'DmsBuilderTabsPanel',
		options: TABS_PANEL_OPTIONS,
		tabs: ['content', 'style'],
	},
	[KPI_CARD_BLOCK]: {
		component: 'DmsBuilderKpiCardPanel',
		options: KPI_CARD_PANEL_OPTIONS,
		tabs: ['content', 'data', 'style'],
	},
	[TOP_LIST_BLOCK]: {
		component: 'DmsBuilderTopListPanel',
		options: TOP_LIST_PANEL_OPTIONS,
		tabs: ['content', 'data', 'style'],
	},
}

export function isSwitch(schema: OptionSchema): boolean {
	return (
		schema.ui?.widget === 'switch' ||
		(!schema.ui?.widget && !schema.enum && schema.type === 'boolean')
	)
}

/** Rule a switch off from the switch above it, and only from a switch. */
export function withSeparators(options: RenderedOption[]): RenderedOption[] {
	return options.map((option, index) => ({
		...option,
		separated:
			index > 0 &&
			isSwitch(option.schema) &&
			isSwitch(options[index - 1]?.schema ?? {} as OptionSchema),
	}))
}
/**
 * A group's options, those behind a switch gathered where the first of them
 * stood, so the switch sits where the options did.
 */
export function entriesOf(
	options: RenderedOption[],
): Array<RenderedOption | RenderedOptIn> {
	const entries: Array<RenderedOption | RenderedOptIn> = []
	const behind = new Map<string, RenderedOptIn>()
	for (const option of options) {
		const label = option.schema.ui?.optIn
		// Only an option of the block's own: one flattened out of another is
		// written through that other, not on its own.
		if (!label || option.id !== option.name) {
			entries.push(option)
			continue
		}
		let entry = behind.get(label)
		if (!entry) {
			entry = { id: `optIn:${label}`, optIn: label, options: [] }
			behind.set(label, entry)
			entries.push(entry)
		}
		entry.options.push(option)
	}
	return entries
}

export function isOptIn(entry: RenderedOption | RenderedOptIn): entry is RenderedOptIn {
	return 'optIn' in entry
}

/** The icon a group of options is titled with, by what the group holds. */
export const GROUP_ICONS: Record<string, string> = {
	content: 'i-ph-text-t',
	features: 'i-ph-toggle-right',
	data: 'i-ph-table',
	appearance: 'i-ph-palette',
	layout: 'i-ph-layout',
	behavior: 'i-ph-lightning',
}

export function groupIcon(id: string): string {
	return GROUP_ICONS[id] ?? 'i-ph-sliders-horizontal'
}

/** Where an option group lands among the tabs: its look apart, its data apart. */
export const STYLE_GROUPS = new Set(['appearance', 'layout'])

/** The panels that file a section of their own under Style. */
export const PANEL_STYLE_SECTIONS = new Set([CHART_CARD_BLOCK, TABS_BLOCK])

import { afterEach, beforeEach, vi } from 'vitest'
import { cloneVNode, h, nextTick, type Component } from 'vue'
import ChartCardPanel from '../../app/components/ChartCardPanel.vue'
import Config from '../../app/components/Config.vue'
import DataSource from '../../app/components/DataSource.vue'
import FoldCard from '../../app/components/FoldCard.vue'
import Option from '../../app/components/Option.vue'
import OnThePage from '../../app/components/OnThePage.vue'
import TableChoice from '../../app/components/TableChoice.vue'
import TablePicker from '../../app/components/TablePicker.vue'
import { installFakeHost, type FakeBackend } from './builder-harness'
import {
	findAll,
	fire,
	installDocumentStub,
	mount,
	stub,
	textOf,
	type TestNode,
} from './render'
import { useBuilderMode } from '../../app/runtime/mode'
import { useBuilder, type BuilderController } from '../../app/runtime/session'
import type {
	BlockCatalog,
	BlockNode,
	OptionSchema,
	ResourceStructure,
} from '../../app/runtime/types'

/**
 * A chart card, as someone building a page sets one up in the simple mode: the
 * chart picked by how it draws, what it measures built from a table, and its
 * headline and look folded away behind a line each.
 */

export let backend: FakeBackend
export let builder: BuilderController
export let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

export const RESOURCES = 'GET /api/builder/resources'
export const RESOURCE = 'GET /api/builder/resource'
export const PREVIEW = 'POST /api/builder/query-preview'
export const { setMode } = useBuilderMode()

export const CHART_TYPES = ['ChartColumn', 'ChartLine', 'ChartScatter']

export const switchOption = (label: string): OptionSchema => ({
	type: 'boolean',
	optional: true,
	ui: { label, group: 'appearance', widget: 'switch' },
})

/** The shape of a chart block the card holds, as `chart-schemas` declares one. */
export function chartBlock(type: string, label: string, icon: string, extra: Record<string, OptionSchema>) {
	return {
		type,
		componentName: 'dms-chart',
		label,
		icon,
		group: 'visualization',
		container: false,
		shapeSource: 'test',
		config: {
			title: { type: 'string', optional: true, ui: { label: 'Title', group: 'content' } },
			fetchUrl: { type: 'string', optional: true, ui: { label: 'Data source', group: 'data', widget: 'dataSource' } },
			color: { type: 'string', optional: true, ui: { label: 'Colour', group: 'appearance', widget: 'color' } },
			showTooltip: switchOption('Show tooltip'),
			height: { type: 'string', optional: true, ui: { label: 'Height', group: 'appearance' } },
			...extra,
		} as Record<string, OptionSchema>,
	}
}

/** `ChartCardSchema`, as the catalog reports it. */
export function chartCatalog(catalog: BlockCatalog): BlockCatalog {
	const card = {
		type: 'ChartCard',
		componentName: 'dms-chart-card',
		label: 'Chart card',
		icon: 'i-ph-chart-line',
		group: 'visualization',
		container: false,
		shapeSource: 'test',
		config: {
			title: { type: 'string', ui: { label: 'Title', group: 'content' } },
			description: { type: 'string', optional: true, ui: { label: 'Description', group: 'content', widget: 'textarea' } },
			icon: { type: 'string', optional: true, ui: { label: 'Icon', group: 'appearance', widget: 'icon' } },
			chart: {
				type: 'unknown',
				'x-component': true,
				ui: {
					label: 'Chart',
					group: 'data',
					widget: 'block',
					blockTypes: CHART_TYPES,
					supplies: ['title', 'fetchUrl'],
				},
			},
			fetchUrl: {
				type: 'string',
				optional: true,
				ui: { label: 'Data source', group: 'data', widget: 'dataSource', responseShape: 'card', periodOption: 'periodScope' },
			},
			periodScope: { type: 'string', optional: true, ui: { label: 'Period scope', group: 'advanced' } },
			valueFormat: {
				type: 'string',
				optional: true,
				enum: ['number', 'currency', 'percent', 'compact'],
				ui: { label: 'Value format', group: 'appearance', widget: 'segmented' },
			},
			currencyCode: { type: 'string', optional: true, ui: { label: 'Currency', group: 'appearance' } },
			showDelta: switchOption('Show variation'),
			// What the card draws with the option unset.
			showLegend: { ...switchOption('Show legend'), default: true },
			primaryLabel: { type: 'string', optional: true, ui: { label: 'Series label', group: 'content' } },
			comparisonLabel: { type: 'string', optional: true, ui: { label: 'Comparison label', group: 'content' } },
		} as Record<string, OptionSchema>,
	}
	return {
		...catalog,
		blocks: [
			...catalog.blocks.filter((entry) => entry.type !== 'ChartCard'),
			card,
			chartBlock('ChartColumn', 'Column Chart', 'i-ph-chart-bar', {
				showGrid: switchOption('Show grid'),
				roundedCorners: switchOption('Rounded corners'),
				columnWidth: { type: 'number', optional: true, ui: { label: 'Column width', group: 'appearance', widget: 'number' } },
			}),
			chartBlock('ChartLine', 'Line Chart', 'i-ph-chart-line', {
				smooth: switchOption('Smooth'),
			}),
			chartBlock('ChartScatter', 'Scatter Chart', 'i-ph-chart-scatter', {}),
		],
	} as BlockCatalog
}

export function orders(): ResourceStructure {
	return {
		ref: 'order',
		className: 'orderDataAPI',
		tableName: 'orders',
		route: '/api/order',
		version: 'v1',
		fields: [
			{ name: 'amount', label: 'Amount', dataType: { $dataType: 'number' } },
			{ name: 'status', label: 'Status', dataType: { $dataType: 'string' } },
			{ name: 'createdAt', label: 'Created', dataType: { $dataType: 'date' } },
		],
	}
}

/**
 * `UCollapsible` as the panel leans on it: its trigger says whether it is open
 * and turns it, and what it holds is there only while it is.
 */
export const collapsible: Component = {
	name: 'UCollapsible',
	inheritAttrs: false,
	setup(_props, { slots, attrs }) {
		return () => {
			const open = attrs.open === true
			const turn = attrs['onUpdate:open'] as (open: boolean) => void
			const [trigger] = slots.default?.({ open }) ?? []
			return h('UCollapsible', attrs, [
				...(trigger
					? [cloneVNode(trigger, { 'aria-expanded': open, onClick: () => turn(!open) })]
					: []),
				...(open ? (slots.content?.() ?? []) : []),
			])
		}
	},
}

export const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderChartCardPanel: ChartCardPanel as Component,
	DmsBuilderFoldCard: FoldCard as Component,
	DmsBuilderOnThePage: OnThePage as Component,
	DmsBuilderDataSource: DataSource as Component,
	DmsBuilderTableChoice: TableChoice as Component,
	DmsBuilderTablePicker: TablePicker as Component,
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	UCollapsible: collapsible,
	UChip: stub('UChip'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

export async function settle(): Promise<void> {
	for (let round = 0; round < 4; round += 1) {
		await vi.advanceTimersByTimeAsync(0)
		await nextTick()
	}
}

export function card(name: string, config: Record<string, unknown> = {}): BlockNode {
	return { path: name, name, type: 'ChartCard', editable: true, config: { title: 'Orders', ...config } }
}

export async function panel(blocks: BlockNode[] = [card('chartCard')]): Promise<TestNode> {
	backend.catalog = chartCatalog(backend.catalog)
	backend.answers[RESOURCES] = [
		{ ref: 'order', className: 'orderDataAPI', tableName: 'orders', route: '/api/order', fieldCount: 3 },
	]
	backend.answers[RESOURCE] = { ok: true, data: orders(), changes: [] }
	backend.structure = { ...backend.structure, blocks }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	builder.select(blocks[0]!.path)
	await vi.advanceTimersByTimeAsync(200)
	const tree = mount(Config, { components: parts() })
	mounted.push(tree.unmount)
	await settle()
	return tree.root
}

/** Pick the table a card measures among those offered, the way a click does. */
export function pickTable(root: TestNode, name: string): void {
	const option = findAll(
		root,
		(node) => node.props.role === 'option' && textOf(node).startsWith(name),
	)[0]
	if (!option) {
		throw new Error(`no table ${name} to pick`)
	}
	fire(option, 'click')
}

export function config(name = 'chartCard'): Record<string, unknown> {
	return builder.session.value.draft?.blocks.find((block) => block.name === name)?.config ?? {}
}

export function draftQuery(name = 'chartCard') {
	return builder.session.value.draft?.queries?.find((query) => query.name === name)
}

export function button(root: TestNode, name: string): TestNode {
	const match = findAll(
		root,
		(node) =>
			(node.tag === 'button' || node.tag === 'UButton') &&
			(node.props['aria-label'] === name || node.props.label === name || textOf(node) === name),
	)[0]
	if (!match) {
		throw new Error(`no button ${name}`)
	}
	return match
}

/** A control by its name: its own label, or the one of the field holding it. */
export function control(root: TestNode, tag: string, name: string): TestNode {
	const match = findAll(
		root,
		(node) =>
			node.tag === tag &&
			(node.props['aria-label'] === name ||
				node.props.label === name ||
				(node.parent?.tag === 'UFormField' && node.parent.props.label === name)),
	)[0]
	if (!match) {
		throw new Error(`no ${tag} ${name}`)
	}
	return match
}

/** What the panel's fields are called. */
export function labels(root: TestNode): string[] {
	return findAll(root, (node) => node.tag === 'UFormField').map((node) =>
		String(node.props.label),
	)
}

/** A part of the panel that folds, by its title: the button, then what it says. */
export function fold(root: TestNode, title: string): TestNode {
	const match = findAll(
		root,
		(node) =>
			node.tag === 'UButton' &&
			node.props['aria-expanded'] !== undefined &&
			textOf(node).startsWith(title),
	)[0]
	if (!match) {
		throw new Error(`no fold ${title}`)
	}
	return match
}

export function tiles(root: TestNode): TestNode[] {
	const group = findAll(root, (node) => node.props['aria-label'] === 'How it draws')[0]
	return group ? findAll(group, (node) => node.tag === 'UButton') : []
}

export function write(target: TestNode, value: unknown): void {
	const handler = target.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${target.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
	setMode('simple')
})

afterEach(() => {
	for (const unmount of mounted) unmount()
	mounted = []
	builder.close()
	setMode('simple')
	vi.useRealTimers()
})

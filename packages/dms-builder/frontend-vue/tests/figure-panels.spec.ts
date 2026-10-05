import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneVNode, h, nextTick, type Component } from 'vue'
import ColourChips from '../app/components/ColourChips.vue'
import Config from '../app/components/Config.vue'
import FoldCard from '../app/components/FoldCard.vue'
import KpiCardPanel from '../app/components/KpiCardPanel.vue'
import OnThePage from '../app/components/OnThePage.vue'
import Option from '../app/components/Option.vue'
import TopListPanel from '../app/components/TopListPanel.vue'
import TrendFold from '../app/components/TrendFold.vue'
import ValueFold from '../app/components/ValueFold.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { findAll, fire, installDocumentStub, mount, stub, textOf, type TestNode } from './support/render'
import { useBuilderMode } from '../app/runtime/mode'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockCatalog, BlockNode, OptionSchema } from '../app/runtime/types'

/**
 * A KPI card and a top list, as someone who never wrote a page sets them up:
 * what they measure and what they are called, then their figures' format, their
 * trend and a list's ranking, each folded behind a line saying how it is set,
 * a setting showing only once it applies.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const { setMode } = useBuilderMode()

const optional = (type: string, ui: Record<string, unknown> = {}, extra = {}) =>
	({ type, optional: true, ui, ...extra }) as OptionSchema
const FORMATS = ['number', 'currency', 'percent', 'compact']
const source = (shape: string) =>
	optional('string', { label: 'Data source', group: 'data', widget: 'dataSource', responseShape: shape })

/** What `KpiCardSchema` and `TopListCardSchema` declare, the advanced options aside. */
function figureCatalog(catalog: BlockCatalog): BlockCatalog {
	const shared = {
		title: { type: 'string', ui: { label: 'Title', group: 'content' } } as OptionSchema,
		description: optional('string', { label: 'Description', group: 'content' }),
		valueFormat: optional('string', { label: 'Value format', group: 'appearance' }, { enum: FORMATS }),
		currencyCode: optional('string', { label: 'Currency', group: 'appearance' }),
		showDelta: optional('boolean', { label: 'Show variation', widget: 'switch' }),
		showSparkline: optional('boolean', { label: 'Show sparkline', widget: 'switch' }),
		sparklineAccent: optional('string', { label: 'Sparkline colour', widget: 'color' }),
		invert: optional('boolean', { label: 'Invert variation', group: 'behavior', widget: 'switch' }),
		periodScope: optional('string', { label: 'Period scope', group: 'advanced' }),
	}
	return {
		...catalog,
		blocks: [
			...catalog.blocks,
			{
				type: 'KpiCard',
				label: 'KPI card',
				container: false,
				shapeSource: 'test',
				config: {
					...shared,
					fetchUrl: source('value'),
					icon: optional('string', { label: 'Icon', widget: 'icon' }),
					variant: optional('string', { label: 'Variant', widget: 'segmented' }, { enum: ['default', 'stat'], description: '`stat` renders the compact DMS look.' }),
					compareLabel: optional('string', { label: 'Comparison label', group: 'content' }),
				},
			},
			{
				type: 'TopListCard',
				label: 'Top list',
				container: false,
				shapeSource: 'test',
				config: {
					...shared,
					fetchUrl: source('items'),
					showRank: optional('boolean', { label: 'Show rank', widget: 'switch' }),
					highlightTopN: optional('number', { label: 'Highlight top' }),
					rankColor: optional('string', { label: 'Rank colour', widget: 'color' }),
					badgeColor: optional('string', { label: 'Badge colour', widget: 'color' }),
					maxHeight: optional('string', { label: 'Maximum height' }),
					emptyLabel: optional('string', { label: 'Empty message', group: 'content' }),
				},
			},
		],
	} as BlockCatalog
}

/** `UCollapsible` as a fold leans on it: what it holds is there only while open. */
const collapsible: Component = {
	name: 'UCollapsible',
	inheritAttrs: false,
	setup(_props, { slots, attrs }) {
		return () => {
			const open = attrs.open === true
			const turn = attrs['onUpdate:open'] as (open: boolean) => void
			const [trigger] = slots.default?.({ open }) ?? []
			return h('UCollapsible', attrs, [
				...(trigger ? [cloneVNode(trigger, { 'aria-expanded': open, onClick: () => turn(!open) })] : []),
				...(open ? (slots.content?.() ?? []) : []),
			])
		}
	},
}

const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderKpiCardPanel: KpiCardPanel as Component,
	DmsBuilderTopListPanel: TopListPanel as Component,
	DmsBuilderValueFold: ValueFold as Component,
	DmsBuilderTrendFold: TrendFold as Component,
	DmsBuilderColourChips: ColourChips as Component,
	DmsBuilderFoldCard: FoldCard as Component,
	DmsBuilderOnThePage: OnThePage as Component,
	DmsBuilderDataSource: stub('DmsBuilderDataSource'),
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	UCollapsible: collapsible,
	UChip: stub('UChip'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

async function panel(type: 'KpiCard' | 'TopListCard', config: Record<string, unknown> = {}): Promise<TestNode> {
	backend.catalog = figureCatalog(backend.catalog)
	const block: BlockNode = { path: 'card', name: 'card', type, editable: true, config: { title: 'Revenue', ...config } }
	backend.structure = { ...backend.structure, blocks: [block] }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	builder.select('card')
	const view = mount(Config, { components: parts() })
	mounted.push(view.unmount)
	await nextTick()
	return view.root
}

const config = (): Record<string, unknown> => builder.session.value.draft?.blocks[0]?.config ?? {}

function find(root: TestNode, match: (node: TestNode) => boolean, what: string): TestNode {
	const node = findAll(root, match)[0]
	if (!node) {
		throw new Error(`no ${what}`)
	}
	return node
}

async function open(root: TestNode, title: string): Promise<TestNode> {
	fire(
		find(root, (node) => node.tag === 'UButton' && node.props['aria-expanded'] !== undefined && textOf(node).startsWith(title), `fold ${title}`),
		'click',
	)
	await nextTick()
	return root
}

const named = (root: TestNode, tag: string, label: string) =>
	find(root, (node) => node.tag === tag && (node.props['aria-label'] === label || node.props.label === label), `${tag} ${label}`)

async function write(node: TestNode, value: unknown): Promise<void> {
	;(node.props['onUpdate:modelValue'] as (value: unknown) => void)(value)
	await nextTick()
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

describe('a KPI card', () => {
	it('folds its format and its trend, and says how each is set', async () => {
		const root = await panel('KpiCard')

		const shown = textOf(root)
		expect(shown).toContain('ValueCompact')
		expect(shown).toContain('TrendVariation · no sparkline')
		for (const word of ['Appearance', 'Behavior', '`stat`', 'Invert variation']) {
			expect(shown).not.toContain(word)
		}
	})

	it('picks its icon beside its title, and its style by the card it makes', async () => {
		const root = await panel('KpiCard')
		await write(named(root, 'DmsBuilderIconPicker', 'Choose the icon'), 'i-ph-coins')
		fire(find(root, (node) => node.tag === 'button' && textOf(node) === 'Compact', 'style'), 'click')
		await nextTick()

		expect(config()).toMatchObject({ icon: 'i-ph-coins', variant: 'stat' })
		fire(find(root, (node) => node.tag === 'button' && textOf(node) === 'Card', 'style'), 'click')
		await nextTick()
		expect(config().variant, 'back to what the card does by itself').toBeUndefined()
	})

	it('asks for a currency only once the figure is one', async () => {
		const root = await open(await panel('KpiCard'), 'Value')
		expect(findAll(root, (node) => node.props['aria-label'] === 'Currency')).toHaveLength(0)

		await write(named(root, 'DmsSegmented', 'Shown as'), 'currency')
		const currency = named(root, 'USelectMenu', 'Currency')
		expect((currency.props.items as Array<{ label: string }>)[0]?.label).toBe('EUR · Euro')

		await write(currency, 'USD')
		;(currency.props.onCreate as (typed: string) => void)('chf')
		await nextTick()
		expect(config()).toMatchObject({ valueFormat: 'currency', currencyCode: 'CHF' })
	})

	it('nests what the variation needs under it, and lets go of it once off', async () => {
		const root = await open(await panel('KpiCard'), 'Trend')
		expect(named(root, 'USwitch', 'Show the variation').props['model-value'], 'on by default').toBe(true)
		await write(named(root, 'USwitch', 'A drop is good news'), true)
		await write(named(root, 'UFormField', 'Label beside it').children[0]!, 'vs last month')
		expect(config()).toMatchObject({ invert: true, compareLabel: 'vs last month' })

		await write(named(root, 'USwitch', 'Show the variation'), false)
		expect(config().showDelta).toBe(false)
		expect(findAll(root, (node) => node.props['aria-label'] === 'A drop is good news')).toHaveLength(0)
	})

	it('colours its sparkline like the trend until another colour is picked', async () => {
		const root = await open(await panel('KpiCard'), 'Trend')
		await write(named(root, 'USwitch', 'Show the sparkline'), true)
		fire(named(root, 'UButton', 'success'), 'click')
		await nextTick()
		expect(config()).toMatchObject({ showSparkline: true, sparklineAccent: 'success' })

		fire(named(root, 'UButton', 'Like the trend'), 'click')
		await nextTick()
		expect(config().sparklineAccent).toBeUndefined()
	})

	it('offers no variation its query cannot answer, and says why', async () => {
		const root = await open(await panel('KpiCard'), 'Trend')
		builder.setDraftQuery({ name: 'card', resource: 'order', template: 'series', params: { op: 'count' }, response: 'value' })
		await nextTick()

		expect(named(root, 'USwitch', 'Show the variation').props.disabled).toBe(true)
		expect(textOf(root)).toContain('Needs the comparison with the previous period, in Data.')
		expect(named(root, 'USwitch', 'Show the sparkline').props.disabled).toBe(true)
		expect(textOf(root)).toContain('A figure read from a table has none yet.')
	})
})

describe('a top list', () => {
	it('says what it shows when there is nothing, and hides its height and badge', async () => {
		const root = await panel('TopListCard')
		await write(named(root, 'UFormField', 'When empty').children[0]!, 'No sale yet')

		expect(config().emptyLabel).toBe('No sale yet')
		for (const word of ['Maximum height', 'Badge colour', 'Rank colour']) {
			expect(textOf(root)).not.toContain(word)
		}
	})

	it('highlights its first rows, the colour shown only while some are', async () => {
		const root = await open(await panel('TopListCard'), 'Ranking')
		expect(textOf(root)).toContain('Ranked · first 3 highlighted')
		expect(findAll(root, (node) => node.props['aria-label'] === 'Colour')).toHaveLength(1)

		await write(find(root, (node) => node.tag === 'UInputNumber', 'highlight'), 0)
		expect(config().highlightTopN).toBe(0)
		expect(findAll(root, (node) => node.props['aria-label'] === 'Colour')).toHaveLength(0)

		await write(named(root, 'USwitch', 'Show the rank'), false)
		expect(config().showRank).toBe(false)
		expect(textOf(root)).toContain('No rank')
	})

	it('offers no variation for rows read from a table', async () => {
		const root = await open(await panel('TopListCard'), 'Trend')
		builder.setDraftQuery({ name: 'card', resource: 'order', template: 'series', params: { op: 'count', groupBy: 'status' }, response: 'items' })
		await nextTick()

		expect(named(root, 'USwitch', 'Show the variation').props.disabled).toBe(true)
		expect(textOf(root)).toContain('Rows read from a table have no previous period to compare with.')
	})
})

describe('a KPI card in the advanced view', () => {
	it('offers every option, as any block does', async () => {
		setMode('advanced')
		const root = await panel('KpiCard')

		expect(findAll(root, (node) => node.tag === 'DmsBuilderKpiCardPanel')).toHaveLength(0)
		expect(textOf(root)).toContain('Invert variation')
	})
})

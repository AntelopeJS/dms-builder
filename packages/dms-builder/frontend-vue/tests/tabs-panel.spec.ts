import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Component } from 'vue'
import Children from '../app/components/Children.vue'
import Config from '../app/components/Config.vue'
import Node from '../app/components/Node.vue'
import Option from '../app/components/Option.vue'
import TabsPanel from '../app/components/TabsPanel.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	fakeEvent,
	findAll,
	fire,
	installDocumentStub,
	mount,
	stub,
	textOf,
	type TestNode,
} from './support/render'
import { useBuilderMode } from '../app/runtime/mode'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockCatalog, BlockNode, OptionSchema } from '../app/runtime/types'

/**
 * A tab set, as someone who never wrote a page sets one up: its tabs a line
 * each, the one open on the canvas open in the panel too, and how it looks a
 * line per setting. What a tab can carry beyond that — a shortcut, an avatar —
 * is the advanced view's.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const { setMode } = useBuilderMode()

const optional = (type: string, ui: Record<string, unknown> = {}, extra = {}) =>
	({ type, optional: true, ui, ...extra }) as OptionSchema
const choice = (values: string[], label: string) =>
	optional('string', { label }, { enum: values })

/** What `TabSchema` declares, every option of it. */
function tabCatalog(catalog: BlockCatalog): BlockCatalog {
	return {
		...catalog,
		blocks: [
			...catalog.blocks.filter((block) => block.type !== 'Tab'),
			{
				type: 'Tab',
				componentName: 'dms-tab',
				label: 'Tabs',
				container: true,
				shapeSource: 'test',
				dynamicSlots: { optionPath: 'items', idKey: 'slot', labelKey: 'label' },
				config: {
					items: {
						type: 'array',
						ui: { label: 'Tabs', group: 'content' },
						items: {
							type: 'object',
							properties: {
								label: { type: 'string', ui: { label: 'Label' } },
								slot: { type: 'string', ui: { label: 'Slot' } },
								icon: optional('string', { widget: 'icon' }),
								badge: optional('string'),
								disabled: optional('boolean', { widget: 'switch' }),
								shortcut: optional('string', { label: 'Shortcut' }),
								avatar: optional('object', { label: 'Avatar' }),
							},
						},
					} as OptionSchema,
					color: choice(['primary', 'secondary', 'neutral'], 'Colour'),
					size: choice(['xs', 'sm', 'md', 'lg', 'xl'], 'Size'),
					variant: choice(['pill', 'link'], 'Variant'),
					orientation: choice(['horizontal', 'vertical'], 'Orientation'),
					unmountOnHide: optional('boolean', { label: 'Unmount hidden tabs', widget: 'switch' }),
					persistState: optional('boolean', { label: 'Remember the open tab', widget: 'switch' }),
					stateKey: optional('string', { label: 'State key' }),
				},
			},
		],
	}
}

const TABS: BlockNode = {
	path: 'tabs',
	name: 'tabs',
	type: 'Tab',
	editable: true,
	config: {
		items: [
			{ slot: 'overview', label: 'Overview' },
			{ slot: 'orders', label: 'Orders', badge: '12', shortcut: 'o' },
			{ slot: 'customers', label: 'Customers' },
		],
	},
	children: [
		{ path: 'tabs/kpi', name: 'kpi', type: 'Text', editable: true, slot: 'overview', config: {} },
		{ path: 'tabs/note', name: 'note', type: 'Text', editable: true, slot: 'orders', config: {} },
	],
}

const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderTabsPanel: TabsPanel as Component,
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	UDropdownMenu: stub('UDropdownMenu'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

async function panel(block: BlockNode = TABS): Promise<TestNode> {
	backend.catalog = tabCatalog(backend.catalog)
	backend.structure = { ...backend.structure, blocks: [block] }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	builder.select('tabs')
	const view = mount(Config, { components: parts() })
	mounted.push(view.unmount)
	await nextTick()
	return view.root
}

const tabSet = () => builder.session.value.draft?.blocks[0]
const items = () => (tabSet()?.config?.items ?? []) as Array<Record<string, unknown>>
const labels = () => items().map((item) => item.label)

function find(root: TestNode, match: (node: TestNode) => boolean, what: string): TestNode {
	const node = findAll(root, match)[0]
	if (!node) {
		throw new Error(`no ${what}`)
	}
	return node
}

const lines = (root: TestNode) => findAll(root, (node) => node.props.role === 'listitem')
const line = (root: TestNode, label: string) =>
	find(
		root,
		(node) =>
			node.props.role === 'listitem' &&
			findAll(node, (input) => input.tag === 'UInput' && input.props['model-value'] === label)
				.length > 0,
		`line ${label}`,
	)
const labelled = (root: TestNode, tag: string, label: string) =>
	find(root, (node) => node.tag === tag && node.props['aria-label'] === label, `${tag} ${label}`)

async function write(node: TestNode, value: unknown): Promise<void> {
	;(node.props['onUpdate:modelValue'] as (value: unknown) => void)(value)
	await nextTick()
}

async function act(root: TestNode, tab: string, action: string): Promise<void> {
	const menu = find(
		line(root, tab),
		(node) => node.tag === 'UDropdownMenu',
		`actions of ${tab}`,
	)
	const entry = (menu.props.items as Array<Array<{ label: string; onSelect: () => void }>>)
		.flat()
		.find((item) => item.label === action)
	entry?.onSelect()
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

describe('the tabs of a tab set', () => {
	it('lists them a line each, with what each one holds', async () => {
		const root = await panel()

		const holds = (node: TestNode) =>
			findAll(node, (span) => span.tag === 'span' && /^(\d+ blocks?|Empty)$/.test(textOf(span))).map(
				textOf,
			)
		expect(lines(root).map(holds)).toEqual([['1 block'], ['1 block'], ['Empty']])
		expect(textOf(line(root, 'Orders')), 'its badge beside it').toContain('12')
		expect(
			lines(root).map((node) => textOf(node).includes('Badge')),
			'the details of the tab open on the canvas, the first until one is picked',
		).toEqual([true, false, false])
	})

	it('asks for neither a shortcut nor an avatar, which are the advanced view’s', async () => {
		const root = await panel()

		const shown = textOf(root)
		for (const word of ['Shortcut', 'Avatar', 'Slot', 'Unmount hidden tabs', 'State key']) {
			expect(shown).not.toContain(word)
		}
	})

	it('opens the tab clicked on the canvas too, its badge and switch under it', async () => {
		const root = await panel()
		fire(line(root, 'Customers'), 'click')
		await nextTick()

		expect(builder.session.value.openRegions.tabs).toBe('customers')
		await write(labelled(root, 'USwitch', "Customers can't be opened"), true)
		await write(find(line(root, 'Customers'), (node) => node.props.placeholder === 'A count or a word', 'badge'), 'New')

		expect(items()[2]).toEqual({ slot: 'customers', label: 'Customers', disabled: true, badge: 'New' })
	})

	it('renames a tab from its line, its region kept', async () => {
		const root = await panel()
		await write(labelled(root, 'UInput', 'Name of Orders'), 'Sales')

		expect(items()[1]).toEqual({ slot: 'orders', label: 'Sales', badge: '12', shortcut: 'o' })
	})

	it('adds one at the end and opens it', async () => {
		const root = await panel()
		fire(find(root, (node) => node.tag === 'UButton' && node.props.label === 'Add a tab', 'add'), 'click')
		await nextTick()

		expect(labels()).toEqual(['Overview', 'Orders', 'Customers', 'Tab 4'])
		expect(builder.session.value.openRegions.tabs).toBe('tab4')
	})
})

describe('the actions of a tab', () => {
	it('duplicates it beside itself, with the blocks it holds', async () => {
		const root = await panel()
		await act(root, 'Orders', 'Duplicate')

		expect(labels()).toEqual(['Overview', 'Orders', 'Orders copy', 'Customers'])
		expect(tabSet()?.children?.map((child) => [child.name, child.slot])).toEqual([
			['kpi', 'overview'],
			['note', 'orders'],
			['note2', 'orders-copy'],
		])
		expect(builder.session.value.openRegions.tabs).toBe('orders-copy')
	})

	it('deletes it with the blocks it holds, in one step undone', async () => {
		const root = await panel()
		await act(root, 'Overview', 'Delete')

		expect(labels()).toEqual(['Orders', 'Customers'])
		expect(tabSet()?.children?.map((child) => child.name)).toEqual(['note'])

		builder.undo()
		expect(labels()).toEqual(['Overview', 'Orders', 'Customers'])
		expect(tabSet()?.children?.map((child) => child.name)).toEqual(['kpi', 'note'])
	})

	it('opens the tab beside the one deleted, when it was the one open', async () => {
		const root = await panel()
		fire(line(root, 'Customers'), 'click')
		await nextTick()
		await act(root, 'Customers', 'Delete')

		expect(builder.session.value.openRegions.tabs).toBe('orders')
	})

	it('keeps the last tab, which a tab set cannot do without', async () => {
		const root = await panel({
			...TABS,
			config: { items: [{ slot: 'overview', label: 'Overview' }] },
			children: [],
		})
		const menu = find(root, (node) => node.tag === 'UDropdownMenu', 'actions')
		const remove = (menu.props.items as Array<Array<{ label: string; disabled?: boolean }>>)
			.flat()
			.find((item) => item.label === 'Delete')

		expect(remove?.disabled).toBe(true)
	})
})

describe('the order of the tabs', () => {
	const handle = (root: TestNode, label: string) =>
		labelled(root, 'button', `Drag ${label} to reorder`)

	it('follows a tab dragged by its handle onto another', async () => {
		const root = await panel()
		fire(handle(root, 'Overview'), 'dragstart')
		fire(line(root, 'Customers'), 'dragover')
		await nextTick()
		fire(line(root, 'Customers'), 'drop')
		await nextTick()

		expect(labels()).toEqual(['Orders', 'Customers', 'Overview'])
	})

	it('moves a tab with the arrow keys on its handle, and nothing else with it', async () => {
		const root = await panel()
		const event = Object.assign(fakeEvent('keydown'), { key: 'ArrowUp' })
		// Two listeners on the one key event, one per arrow.
		const listeners = [handle(root, 'Customers').props.onKeydown].flat() as Array<(event: unknown) => void>
		for (const listener of listeners) listener(event)
		await nextTick()

		expect(labels()).toEqual(['Overview', 'Customers', 'Orders'])
		expect(event.stopped, 'the block itself is not nudged').toBe(true)
	})
})

describe('the look of a tab set', () => {
	it('writes the style, direction and size picked, showing the default first', async () => {
		const root = await panel()
		const style = labelled(root, 'div', 'Style')
		const pressed = findAll(style, (node) => node.props['aria-pressed'] === true).map(textOf)
		expect(pressed.map((text) => text.trim())).toEqual(['Pill'])

		fire(find(labelled(root, 'div', 'Direction'), (node) => textOf(node).trim() === 'Vertical' && node.tag === 'button', 'vertical'), 'click')
		await nextTick()
		expect(tabSet()?.config?.orientation).toBe('vertical')
	})

	it('picks a colour among the theme’s', async () => {
		const root = await panel()
		const colour = labelled(root, 'USelectMenu', 'Colour')
		expect((colour.props.items as Array<{ value: string }>).map((item) => item.value)).toEqual([
			'primary',
			'secondary',
			'neutral',
		])

		await write(colour, 'secondary')
		expect(tabSet()?.config?.color).toBe('secondary')
	})
})

describe('a tab set in the advanced view', () => {
	it('offers every option of the tab set, as any block does', async () => {
		setMode('advanced')
		const root = await panel()

		expect(findAll(root, (node) => node.tag === 'DmsBuilderTabsPanel')).toHaveLength(0)
		expect(textOf(root)).toContain('Shortcut')
	})
})

describe('a tab opened from the panel', () => {
	it('opens on the canvas as well', async () => {
		const goToTab = vi.fn()
		Object.assign(globalThis, {
			resolveDmsComponent: () => ({
				name: 'DmsTab',
				setup(_props: unknown, { expose, slots }: { expose: (value: object) => void; slots: Record<string, () => unknown[]> }) {
					expose({ activeTab: '0', goToTab })
					return () => h('DmsTab', null, (slots.default?.() ?? []) as never)
				},
			}),
		})
		try {
			await panel()
			const view = mount(Node, {
				props: { block: tabSet(), path: 'tabs', preview: { componentName: 'DmsTab' } },
				components: {
					DmsBuilderNode: Node as Component,
					DmsBuilderChildren: Children as Component,
					DmsBuilderPlaceholder: stub('DmsBuilderPlaceholder'),
					DmsBuilderBoundary: stub('DmsBuilderBoundary'),
				},
			})
			mounted.push(view.unmount)
			await nextTick()

			builder.openRegion('tabs', 'customers')
			await nextTick()
			expect(goToTab).toHaveBeenCalledWith(2)
		} finally {
			Object.assign(globalThis, { resolveDmsComponent: () => undefined })
		}
	})
})

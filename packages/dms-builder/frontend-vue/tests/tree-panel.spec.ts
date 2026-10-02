import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Config from '../app/components/Config.vue'
import CustomCard from '../app/components/CustomCard.vue'
import OnThePage from '../app/components/OnThePage.vue'
import Option from '../app/components/Option.vue'
import TreePanel from '../app/components/TreePanel.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
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
import type { BlockCatalog, OptionSchema } from '../app/runtime/types'

/**
 * A tree, as someone building a page sets one up in the simple mode: its items
 * listed one by one, what it shows on the page, and what it does differently
 * from the defaults behind a switch each. No method, no handler, no JSON.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const { setMode } = useBuilderMode()

const optional = (type: string, ui: Record<string, unknown>, extra: Partial<OptionSchema> = {}) =>
	({ type, optional: true, ui, ...extra }) as OptionSchema

/** `TreeSchema`, as the catalog reports it. */
function treeCatalog(catalog: BlockCatalog): BlockCatalog {
	return {
		...catalog,
		blocks: [
			...catalog.blocks.filter((block) => block.type !== 'Tree'),
			{
				type: 'Tree',
				componentName: 'dms-tree',
				label: 'Tree',
				icon: 'i-ph-tree-structure',
				group: 'data',
				container: false,
				shapeSource: 'test',
				config: {
					title: optional('string', { label: 'Title', group: 'content' }),
					description: optional('string', { label: 'Description', group: 'content', widget: 'textarea' }),
					color: optional(
						'string',
						{ label: 'Colour', group: 'appearance', widget: 'select' },
						{ enum: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] },
					),
					size: optional(
						'string',
						{ label: 'Size', group: 'appearance', widget: 'segmented' },
						{ enum: ['xs', 'sm', 'md', 'lg', 'xl'] },
					),
					trailingIcon: optional('string', { label: 'Trailing icon', group: 'appearance', widget: 'icon' }),
					expandedIcon: optional('string', { label: 'Expanded icon', group: 'appearance', widget: 'icon' }),
					collapsedIcon: optional('string', { label: 'Collapsed icon', group: 'appearance', widget: 'icon' }),
					multiple: optional('boolean', { label: 'Multiple selection', group: 'behavior', widget: 'switch' }),
					defaultExpanded: optional('array', { label: 'Expanded by default', group: 'behavior' }, { items: { type: 'string' } }),
					disabled: optional('boolean', { label: 'Disabled', group: 'behavior', widget: 'switch' }),
					expanded: optional('array', { label: 'Expanded nodes', group: 'behavior' }, { items: { type: 'string' } }),
					selectionBehavior: {
						type: 'string',
						enum: ['toggle', 'replace'],
						ui: { label: 'Selection behaviour', group: 'behavior', widget: 'segmented' },
					},
					propagateSelect: optional('boolean', { label: 'Propagate to children', group: 'behavior', widget: 'switch' }),
					fetchUrl: optional('string', { label: 'Data source', group: 'data', widget: 'url' }),
					fetchUrlMethod: optional(
						'string',
						{ label: 'HTTP method', group: 'data', widget: 'select' },
						{ enum: ['GET', 'POST'] },
					),
					staticNodes: optional('array', { label: 'Static nodes', group: 'data', widget: 'json' }, { items: { type: 'object' } }),
					lazyLoad: optional('boolean', { label: 'Load children on demand', group: 'behavior', widget: 'switch' }),
					nodeToggleFunctionId: optional('string', { label: 'Toggle handler', group: 'advanced' }),
					nodeSelectFunctionId: optional('string', { label: 'Select handler', group: 'advanced' }),
				},
			},
		],
	} as BlockCatalog
}

const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderTreePanel: TreePanel as Component,
	DmsBuilderCustomCard: CustomCard as Component,
	DmsBuilderOnThePage: OnThePage as Component,
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	UDropdownMenu: stub('UDropdownMenu'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

const FRUITS = [
	{
		label: 'Fruits',
		value: 'fruits',
		children: [
			{ label: 'Apples', value: 'apples' },
			{ label: 'Pears', value: 'pears' },
		],
	},
	{ label: 'Vegetables', value: 'vegetables' },
]

async function panel(config: Record<string, unknown> = { selectionBehavior: 'toggle' }): Promise<TestNode> {
	backend.catalog = treeCatalog(backend.catalog)
	backend.structure = {
		...backend.structure,
		blocks: [{ path: 'tree', name: 'tree', type: 'Tree', editable: true, config }],
	}
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	builder.select('tree')
	await vi.advanceTimersByTimeAsync(200)
	const tree = mount(Config, { components: parts() })
	mounted.push(tree.unmount)
	await nextTick()
	return tree.root
}

function config(): Record<string, unknown> {
	return builder.session.value.draft?.blocks[0]?.config ?? {}
}

function find(root: TestNode, match: (node: TestNode) => boolean, what: string): TestNode {
	const node = findAll(root, match)[0]
	if (!node) {
		throw new Error(`no ${what}`)
	}
	return node
}

function button(root: TestNode, words: string): TestNode {
	return find(
		root,
		(node) =>
			(node.tag === 'button' && textOf(node).trim() === words) ||
			(node.tag === 'UButton' && node.props.label === words),
		`button ${words}`,
	)
}

function labelled(root: TestNode, tag: string, label: string): TestNode {
	return find(root, (node) => node.tag === tag && node.props['aria-label'] === label, `${tag} ${label}`)
}

async function write(node: TestNode, value: unknown): Promise<void> {
	const handler = node.props['onUpdate:modelValue'] ?? node.props['onUpdate:on']
	if (typeof handler !== 'function') {
		throw new Error(`nothing to write on <${node.tag}>`)
	}
	;(handler as (value: unknown) => void)(value)
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

describe('the items of a tree', () => {
	it('are listed one by one, the first a click away', async () => {
		const root = await panel()
		expect(textOf(root)).toContain('No item yet.')

		fire(button(root, 'Add an item'), 'click')
		await nextTick()

		expect(config().staticNodes).toEqual([{ label: 'New item', value: 'newItem' }])
		await write(labelled(root, 'UInput', 'Item 1'), 'Fruits')
		expect(config().staticNodes).toEqual([{ label: 'Fruits', value: 'newItem' }])
	})

	it('nest one inside another from its menu', async () => {
		const root = await panel({ selectionBehavior: 'toggle', staticNodes: FRUITS })
		const menus = findAll(root, (node) => node.tag === 'UDropdownMenu')
		expect(menus, 'one per item, nested ones too').toHaveLength(4)

		const actions = menus[3]!.props.items as Array<Array<{ label: string; onSelect: () => void }>>
		actions[0]![0]!.onSelect()
		await nextTick()

		expect((config().staticNodes as typeof FRUITS)[1]).toEqual({
			label: 'Vegetables',
			value: 'vegetables',
			children: [{ label: 'New sub-item', value: 'newSubItem' }],
		})
	})

	it('are read from an address instead, with no method to pick', async () => {
		const root = await panel()
		fire(button(root, 'From an address'), 'click')
		await nextTick()
		await write(find(root, (node) => node.tag === 'UInput' && node.props.placeholder === '/api/categories', 'address'), '/api/categories')

		expect(config().fetchUrl).toBe('/api/categories')
		expect(textOf(root)).not.toContain('HTTP method')

		fire(button(root, 'Listed here'), 'click')
		await nextTick()
		expect(config().fetchUrl, 'listed again, the address goes').toBeUndefined()
	})
})

describe('what a tree does differently from the defaults', () => {
	it('is left to the tree until its switch is turned on', async () => {
		const root = await panel()
		for (const title of ['Custom selection', 'Custom look']) {
			expect(labelled(root, 'USwitch', title).props['model-value'], title).toBe(false)
		}
		expect(textOf(root)).not.toContain('Several items at once')
		expect(textOf(root)).not.toContain('Colour')
	})

	it('selects several items once turned on, and forgets it once turned off', async () => {
		const root = await panel()
		await write(labelled(root, 'USwitch', 'Custom selection'), true)
		await write(labelled(root, 'USwitch', 'Several items at once'), true)
		fire(button(root, 'Selects it alone'), 'click')
		await nextTick()
		expect(config()).toMatchObject({ multiple: true, selectionBehavior: 'replace' })

		await write(labelled(root, 'USwitch', 'Custom selection'), false)
		expect(config().multiple).toBeUndefined()
		expect(config().selectionBehavior, 'back to what a click does by itself').toBe('toggle')
	})

	it('opens the items picked when the page loads', async () => {
		const root = await panel({ selectionBehavior: 'toggle', staticNodes: FRUITS })
		await write(labelled(root, 'USwitch', 'Custom opening'), true)
		await write(find(root, (node) => node.tag === 'UCheckbox' && node.props.label === 'Fruits', 'Fruits'), true)

		expect(config().defaultExpanded).toEqual(['fruits'])
	})

	it('takes a colour and a size of its own, gone with the switch', async () => {
		const root = await panel()
		await write(labelled(root, 'USwitch', 'Custom look'), true)
		fire(button(root, 'warning'), 'click')
		fire(button(root, 'L'), 'click')
		await nextTick()
		expect(config()).toMatchObject({ color: 'warning', size: 'lg' })

		await write(labelled(root, 'USwitch', 'Custom look'), false)
		expect(config().color).toBeUndefined()
		expect(config().size).toBeUndefined()
	})
})

describe('what is left to the advanced view', () => {
	it('shows no method, handler or JSON in the simple mode', async () => {
		const root = await panel()
		for (const label of ['HTTP method', 'Toggle handler', 'Load children on demand', 'Static nodes', 'Expanded nodes']) {
			expect(textOf(root), label).not.toContain(label)
		}
	})

	it('offers every option as it is in the advanced view', async () => {
		setMode('advanced')
		const root = await panel()
		expect(textOf(root)).toContain('HTTP method')
		expect(textOf(root)).toContain('Static nodes')
	})
})

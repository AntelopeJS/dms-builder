import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Config from '../app/components/Config.vue'
import CustomCard from '../app/components/CustomCard.vue'
import OnThePage from '../app/components/OnThePage.vue'
import Option from '../app/components/Option.vue'
import TableChoice from '../app/components/TableChoice.vue'
import TreePanel from '../app/components/TreePanel.vue'
import TreeTableSource from '../app/components/TreeTableSource.vue'
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
import type {
	BlockCatalog,
	OptionSchema,
	ResourceFieldStructure,
	ResourceStructure,
} from '../app/runtime/types'

/**
 * A tree whose items are read from the page's tables, as someone who never wrote
 * a query builds one: a table picked, then how it branches — by its columns,
 * under the row a column names, or through the tables linked to it. What the
 * panel writes is the tree the page's code will answer, and the address the
 * block reads it at.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const { setMode } = useBuilderMode()

const PAGE = '/reports/sales'

const optional = (type: string, ui: Record<string, unknown>) =>
	({ type, optional: true, ui }) as OptionSchema

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
					fetchUrl: optional('string', { label: 'Data source', group: 'data', widget: 'url' }),
					fetchUrlMethod: optional('string', { label: 'HTTP method', group: 'data' }),
					staticNodes: optional('array', { label: 'Static nodes', group: 'data', widget: 'json' }),
					lazyLoad: optional('boolean', { label: 'Load children on demand', group: 'behavior' }),
					selectionBehavior: {
						type: 'string',
						enum: ['toggle', 'replace'],
						ui: { label: 'Selection behaviour', group: 'behavior', widget: 'segmented' },
					},
				},
			},
		],
	} as BlockCatalog
}

const field = (name: string, $dataType: string, target?: string): ResourceFieldStructure => ({
	name,
	label: name.charAt(0).toUpperCase() + name.slice(1),
	dataType: {
		$dataType,
		...(target ? { config: { dataApiController: { $ref: { resource: target } } } } : {}),
	},
})

const table = (ref: string, fields: ResourceFieldStructure[]): ResourceStructure => ({
	ref,
	className: ref,
	tableName: `${ref}s`,
	route: `/api/${ref}`,
	fields: [field('_id', 'string'), ...fields],
	version: '1',
})

const TABLES = [
	table('order', [field('amount', 'number'), field('status', 'status'), field('createdAt', 'date')]),
	table('category', [field('name', 'string'), field('parent', 'relation', 'category')]),
	table('customer', [field('name', 'string')]),
	table('purchase', [
		field('customer', 'relation', 'customer'),
		field('amount', 'number'),
		field('boughtAt', 'date'),
	]),
]

const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderTreePanel: TreePanel as Component,
	DmsBuilderTreeTableSource: TreeTableSource as Component,
	DmsBuilderTableChoice: TableChoice as Component,
	DmsBuilderTablePicker: stub('DmsBuilderTablePicker'),
	DmsBuilderCustomCard: CustomCard as Component,
	DmsBuilderOnThePage: OnThePage as Component,
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	UDropdownMenu: stub('UDropdownMenu'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

async function panel(config: Record<string, unknown> = { selectionBehavior: 'toggle' }): Promise<TestNode> {
	backend.catalog = treeCatalog(backend.catalog)
	backend.structure = {
		...backend.structure,
		blocks: [{ path: 'tree', name: 'tree', type: 'Tree', editable: true, config }],
	}
	await builder.open(PAGE)
	await vi.advanceTimersByTimeAsync(200)
	// Every table already read: the panel finds their columns without asking.
	builder.session.value.resources = TABLES.map((entry) => ({
		ref: entry.ref,
		className: entry.className,
		tableName: entry.tableName,
		route: entry.route,
		fieldCount: entry.fields.length,
	}))
	builder.session.value.resourceStructures = Object.fromEntries(
		TABLES.map((entry) => [entry.ref, entry]),
	)
	builder.select('tree')
	await vi.advanceTimersByTimeAsync(200)
	const tree = mount(Config, { components: parts() })
	mounted.push(tree.unmount)
	await nextTick()
	return tree.root
}

const draftTree = () => builder.session.value.draft?.trees?.find((entry) => entry.name === 'tree')
const config = (): Record<string, unknown> => builder.session.value.draft?.blocks[0]?.config ?? {}

function find(root: TestNode, match: (node: TestNode) => boolean, what: string): TestNode {
	const node = findAll(root, match)[0]
	if (!node) {
		throw new Error(`no ${what}`)
	}
	return node
}

async function press(root: TestNode, words: string): Promise<void> {
	fire(
		find(
			root,
			(node) =>
				(node.tag === 'button' && textOf(node).trim() === words) ||
				(node.tag === 'UButton' && node.props.label === words),
			`button ${words}`,
		),
		'click',
	)
	await vi.advanceTimersByTimeAsync(0)
	await nextTick()
}

async function write(node: TestNode, value: unknown): Promise<void> {
	;(node.props['onUpdate:modelValue'] as (value: unknown) => void)(value)
	await vi.advanceTimersByTimeAsync(0)
	await nextTick()
}

const labelled = (root: TestNode, tag: string, label: string) =>
	find(root, (node) => node.tag === tag && node.props['aria-label'] === label, `${tag} ${label}`)

async function pick(root: TestNode, ref: string): Promise<void> {
	await press(root, 'From a table')
	await write(find(root, (node) => node.tag === 'DmsBuilderTablePicker', 'table picker'), ref)
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

describe('a tree read from a table', () => {
	it('lists its rows once picked, the block reading them from its route', async () => {
		const root = await panel()
		await pick(root, 'order')

		expect(draftTree()).toEqual({
			name: 'tree',
			levels: [{ resource: 'order', label: ['createdAt', 'amount'] }],
		})
		expect(config().fetchUrl).toBe(`${PAGE}/tree/tree`)
	})

	it('ranks them by a column many rows share first, a date by its month', async () => {
		const root = await panel()
		await pick(root, 'order')
		await press(root, 'Add a level')
		await press(root, 'Add a level')

		expect(draftTree()?.levels).toEqual([
			{ resource: 'order', by: 'status' },
			{ resource: 'order', by: 'createdAt', every: 'month' },
			{ resource: 'order', label: ['createdAt', 'amount'] },
		])

		await press(root, 'Just a count')
		expect(draftTree()?.levels.at(-1), 'the branches end on their count').toEqual({
			resource: 'order',
			by: 'createdAt',
			every: 'month',
		})
	})

	it('nests each row under the one its own column points at, found by itself', async () => {
		const root = await panel()
		await pick(root, 'category')

		expect(textOf(root)).toContain('Found in category: Parent points to another category.')
		expect(draftTree()?.levels).toEqual([
			{ resource: 'category', label: ['name'], parent: 'parent' },
		])
	})

	it('waits for the column naming the parent when no column points back', async () => {
		const root = await panel()
		await pick(root, 'order')
		await press(root, 'By its parent')

		expect(textOf(root)).toContain('Pick the column naming the row each sits under.')
		expect(draftTree()?.levels, 'the last tree that read stays').toEqual([
			{ resource: 'order', label: ['createdAt', 'amount'] },
		])
	})

	it('lists under each row the rows of a table pointing at it', async () => {
		const root = await panel()
		await pick(root, 'customer')
		await press(root, 'Linked tables')
		const menu = find(root, (node) => node.tag === 'UDropdownMenu', 'levels to add')
		const items = menu.props.items as Array<{ label: string; onSelect: () => void }>
		expect(items.map((item) => item.label)).toEqual(['purchase, by Customer'])

		items[0]!.onSelect()
		await nextTick()
		expect(draftTree()?.levels).toEqual([
			{ resource: 'customer', label: ['name'] },
			{ resource: 'purchase', link: 'customer', label: ['boughtAt', 'amount'] },
		])
		expect(textOf(root)).toContain('Under each: their purchase, by Customer')
	})

	it('reads a branch only as it opens, once told to', async () => {
		const root = await panel()
		await pick(root, 'category')
		await write(labelled(root, 'USwitch', 'Load a branch when it opens'), true)

		expect(draftTree()?.lazy).toBe(true)
		expect(config().lazyLoad, 'the block asks for each branch').toBe(true)
	})

	it('goes with its route when the items are listed by hand again', async () => {
		const root = await panel()
		await pick(root, 'category')
		await press(root, 'Listed here')

		expect(builder.session.value.draft?.trees).toEqual([])
		expect(config().fetchUrl).toBeUndefined()
	})

	it('reopens on the tree the page serves', async () => {
		backend.structure = {
			...backend.structure,
			trees: [
				{
					name: 'tree',
					endpoint: '/tree/tree',
					levels: [{ resource: 'category', label: ['name'], parent: 'parent' }],
					lazy: true,
				},
			],
		}
		const root = await panel({ selectionBehavior: 'toggle', fetchUrl: `${PAGE}/tree/tree`, lazyLoad: true })

		expect(
			find(root, (node) => node.tag === 'button' && node.props['aria-pressed'] === true && textOf(node) === 'From a table', 'source').tag,
		).toBe('button')
		expect(labelled(root, 'USwitch', 'Load a branch when it opens').props['model-value']).toBe(true)
		expect(textOf(root)).toContain('Found in category')
	})
})

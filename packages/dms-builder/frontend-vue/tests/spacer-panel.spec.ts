import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Config from '../app/components/Config.vue'
import Option from '../app/components/Option.vue'
import SpacerPanel from '../app/components/SpacerPanel.vue'
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
import { findNode } from '../app/runtime/draft'
import { useBuilderMode } from '../app/runtime/mode'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockCatalog, BlockNode, OptionSchema } from '../app/runtime/types'

/**
 * A spacer, as someone building a page sets one up in the simple mode: by how
 * much room it takes, picked among three ways, with only the setting the way
 * picked asks for. The three numbers underneath are the advanced view's.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const { setMode } = useBuilderMode()

/** `SpacerSchema`, as the catalog reports it. */
function spacerCatalog(catalog: BlockCatalog): BlockCatalog {
	return {
		...catalog,
		blocks: [
			...catalog.blocks,
			{
				type: 'Spacer',
				componentName: 'dms-spacer',
				label: 'Spacer',
				icon: 'i-ph-arrow-line-right',
				group: 'layout',
				container: false,
				shapeSource: 'test',
				config: {
					minSize: { type: 'string', optional: true, ui: { label: 'Minimum size', group: 'layout' } },
					maxSize: { type: 'string', optional: true, ui: { label: 'Maximum size', group: 'layout' } },
					grow: { type: 'number', default: 1, ui: { label: 'Grow', group: 'layout', widget: 'number', min: 0 } },
				} as Record<string, OptionSchema>,
			},
		],
	} as BlockCatalog
}

const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderSpacerPanel: SpacerPanel as Component,
	UInputNumber: stub('UInputNumber'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
})

async function panel(config: Record<string, unknown> = {}): Promise<TestNode> {
	backend.catalog = spacerCatalog(backend.catalog)
	const spacer: BlockNode = { path: 'spacer', name: 'spacer', type: 'Spacer', editable: true, config }
	backend.structure = { ...backend.structure, blocks: [spacer] }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	builder.select('spacer')
	await vi.advanceTimersByTimeAsync(200)
	const tree = mount(Config, { components: parts() })
	mounted.push(tree.unmount)
	await nextTick()
	return tree.root
}

function config(): Record<string, unknown> {
	return builder.session.value.draft?.blocks[0]?.config ?? {}
}

function choice(root: TestNode, room: string): TestNode {
	const match = findAll(root, (node) => node.tag === 'input' && node.props.value === room)[0]
	if (!match) {
		throw new Error(`no choice ${room}`)
	}
	return match
}

function picked(root: TestNode): string[] {
	return findAll(root, (node) => node.tag === 'input' && node.props.checked === true).map(
		(node) => String(node.props.value),
	)
}

function field(root: TestNode, id: string): TestNode | undefined {
	return findAll(root, (node) => node.props.id === `spacer:${id}`)[0]
}

async function type(node: TestNode | undefined, value: unknown): Promise<void> {
	const handler = node?.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`nothing to type into on <${node?.tag}>`)
	}
	;(handler as (value: unknown) => void)(value)
	await nextTick()
}

async function pick(root: TestNode, room: string): Promise<void> {
	fire(choice(root, room), 'change')
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

describe('the room a spacer takes', () => {
	it('offers three ways, a new spacer filling the free room', async () => {
		const root = await panel()

		expect(textOf(root)).toContain('How much room does it take?')
		for (const label of ['All the free room', 'A fixed gap', 'The free room, within limits']) {
			expect(textOf(root)).toContain(label)
		}
		expect(picked(root)).toEqual(['fill'])
		expect(field(root, 'share')?.props['model-value'], 'its share, the DMS default').toBe(1)
		expect(textOf(root), 'no number to read without its meaning').not.toContain('Minimum size')
	})

	it('writes a share of the free room, as many lines high among the page\'s blocks', async () => {
		const root = await panel()
		await type(field(root, 'share'), 3)

		// The page leaves no room free between its blocks: stacked, the share is
		// the height the spacer takes, a line of 24px for each.
		expect(config()).toEqual({ grow: 3, minSize: '72px' })
		expect(picked(root), 'its lines are no bounds').toEqual(['fill'])
		expect(textOf(root)).toContain('Stacked, its share is the lines it takes, 24px each')
	})

	it('holds a gap to one size, and to the size typed', async () => {
		const root = await panel()
		await pick(root, 'fixed')

		expect(config()).toEqual({ grow: 0, minSize: '24px', maxSize: '24px' })
		expect(picked(root)).toEqual(['fixed'])
		expect(field(root, 'share'), 'a gap takes no share').toBeUndefined()

		await type(field(root, 'gap'), '32px')
		expect(config()).toEqual({ grow: 0, minSize: '32px', maxSize: '32px' })

		// Emptied while it is retyped, the gap stays what was picked.
		await type(field(root, 'gap'), '')
		expect(picked(root)).toEqual(['fixed'])
	})

	it('bounds the free room it takes, keeping its share', async () => {
		const root = await panel({ grow: 2 })
		await pick(root, 'bounded')

		expect(config(), 'nothing to write before a bound is typed').toEqual({ grow: 2 })
		expect(picked(root), 'still the way picked').toEqual(['bounded'])

		await type(field(root, 'min'), '16px')
		await type(field(root, 'max'), '40%')
		expect(config()).toEqual({ grow: 2, minSize: '16px', maxSize: '40%' })

		await type(field(root, 'min'), '')
		expect(config(), 'a bound emptied is no bound').toEqual({ grow: 2, maxSize: '40%' })
	})

	it('reads a gap written in code as one', async () => {
		const root = await panel({ grow: 0, minSize: '8px', maxSize: '8px' })

		expect(picked(root)).toEqual(['fixed'])
		expect(field(root, 'gap')?.props['model-value']).toBe('8px')
	})

	it('goes back to the free room, the bounds dropped', async () => {
		const root = await panel({ grow: 0, minSize: '8px', maxSize: '8px' })
		await pick(root, 'fill')

		expect(config()).toEqual({ grow: 1, minSize: '24px' })
		expect(picked(root)).toEqual(['fill'])
	})

	it('leaves the three numbers to the advanced view', async () => {
		setMode('advanced')
		const root = await panel()

		expect(findAll(root, (node) => node.tag === 'input' && node.props.type === 'radio')).toEqual([])
		expect(textOf(root)).not.toContain('How much room does it take?')
		for (const label of ['Minimum size', 'Maximum size', 'Grow']) {
			expect(textOf(root)).toContain(label)
		}
	})
})

describe('a spacer in a row of the grid', () => {
	const PATH = 'grid/row/spacer'

	/** A row of the grid holding a block, then the spacer beside it. */
	async function inRow(): Promise<TestNode> {
		backend.catalog = spacerCatalog(backend.catalog)
		const cell = (name: string, type: string): BlockNode => ({
			path: `grid/row/${name}`,
			name,
			type,
			editable: true,
			config: {},
		})
		const row: BlockNode = {
			path: 'grid/row',
			name: 'row',
			type: 'GridRow',
			editable: true,
			children: [cell('text', 'Text'), cell('spacer', 'Spacer')],
		}
		backend.structure = {
			...backend.structure,
			blocks: [{ path: 'grid', name: 'grid', type: 'Grid', editable: true, children: [row] }],
		}
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		builder.select(PATH)
		await vi.advanceTimersByTimeAsync(200)
		const tree = mount(Config, { components: parts() })
		mounted.push(tree.unmount)
		await nextTick()
		return tree.root
	}

	const spacer = () => findNode(builder.session.value.draft!, PATH)
	const share = (root: TestNode) =>
		findAll(root, (node) => node.props.id === `${PATH}:share`)[0]

	it('takes the free room in columns, its share the columns it spans', async () => {
		const root = await inRow()

		expect(picked(root), 'the three ways still offered').toEqual(['fill'])
		expect(textOf(root)).toContain('In a row, its share is the columns it takes')
		expect(share(root)?.props['model-value']).toBe(1)

		await type(share(root), 2)
		expect(spacer()?.meta).toEqual({ colSpan: 2 })
		expect(spacer()?.config, 'no share a grid cell would ignore').toEqual({})
		expect(share(root)?.props['model-value']).toBe(2)

		await type(share(root), 1)
		expect(spacer()?.meta, 'one column is what a cell takes by itself').toBeUndefined()
	})
})

describe('a spacer put on the page', () => {
	async function openWith(blocks: BlockNode[]): Promise<void> {
		backend.catalog = spacerCatalog(backend.catalog)
		backend.structure = { ...backend.structure, blocks }
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
	}

	const text = (path: string): BlockNode => ({
		path,
		name: path.split('/').at(-1)!,
		type: 'Text',
		editable: true,
		config: {},
	})

	it('is a line high between stacked blocks, where nothing is left free', async () => {
		await openWith([text('title')])
		builder.addBlock('Spacer')

		expect(findNode(builder.session.value.draft!, 'spacer')?.config).toEqual({ minSize: '24px' })
	})

	it('is a column of its own in a row of the grid', async () => {
		await openWith([
			{
				path: 'grid',
				name: 'grid',
				type: 'Grid',
				editable: true,
				children: [
					{ path: 'grid/row', name: 'row', type: 'GridRow', editable: true, children: [text('grid/row/title')] },
				],
			},
		])
		builder.addBlock('Spacer', 'grid/row', null)

		expect(findNode(builder.session.value.draft!, 'grid/row/spacer')?.config).toEqual({})
	})
})


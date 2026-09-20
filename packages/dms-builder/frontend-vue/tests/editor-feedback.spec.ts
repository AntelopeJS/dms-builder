import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Bar from '../app/components/Bar.vue'
import BlockMenu from '../app/components/BlockMenu.vue'
import Children from '../app/components/Children.vue'
import Config from '../app/components/Config.vue'
import Node from '../app/components/Node.vue'
import Option from '../app/components/Option.vue'
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
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockNode } from '../app/runtime/types'

/**
 * What the editor tells the user about the page it is holding: the badge in the
 * bar, the actions it offers on a block, and what a block it cannot rewrite
 * says about itself.
 */

let backend: FakeBackend
let builder: BuilderController

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

async function openWith(blocks: BlockNode[]): Promise<void> {
	backend.structure = { ...backend.structure, blocks }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
}

function editable(name: string, type: string): BlockNode {
	return { path: name, name, type, editable: true, config: {} }
}

/** A block the engine read but cannot write back, and why. */
function opaque(name: string, reason: string): BlockNode {
	return { path: name, name, type: null, editable: false, opaqueReason: reason }
}

function badges(root: TestNode): string[] {
	return findAll(root, (node) => node.tag === 'UBadge').map((node) =>
		String(node.props.label ?? ''),
	)
}

/**
 * A refusal the editor cannot foresee: the catalog states which types a Grid
 * takes, and the client reads that rule before the drop, but what a child's
 * metadata may hold is the module's to judge.
 */
function refuseTheRow(): void {
	backend.preview = {
		ok: false,
		error: {
			code: 'invalid_config',
			issues: [
				{
					pointer: '/blocks/0/children/0/meta/colSpan',
					message: 'colSpan must be a whole number of columns',
				},
			],
		},
	}
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

describe('the badge in the bar', () => {
	it('vouches for the page once the module has built it', async () => {
		await openWith([editable('title', 'Text')])
		const { root } = mount(Bar)
		await nextTick()
		expect(badges(root)).toEqual(['All blocks configured'])
	})

	it('vouches for nothing while an edit is still waiting on the preview', async () => {
		await openWith([editable('title', 'Text')])
		const { root } = mount(Bar)
		builder.addBlock('Text')
		await nextTick()
		expect(badges(root)).toEqual(['Checking…'])
	})

	it('counts the block the module refused rather than going green on it', async () => {
		await openWith([editable('grid', 'Grid')])
		const { root } = mount(Bar)
		refuseTheRow()
		builder.addBlock('GridRow', 'grid', 0)
		await vi.advanceTimersByTimeAsync(200)
		await nextTick()

		expect(badges(root)).toEqual(['1 to fix'])
		expect(builder.problems.value).toEqual(['grid/gridRow'])
	})
})

describe('the actions offered on a block', () => {
	function entry(root: TestNode, label: string): TestNode {
		const match = findAll(
			root,
			(node) => node.tag === 'button' && textOf(node).startsWith(label),
		)
		if (!match[0]) {
			throw new Error(`no menu entry labelled ${label}`)
		}
		return match[0]
	}

	it('refuses to offer Duplicate on a block that is kept as it stands', async () => {
		await openWith([opaque('legacy', 'non-object-literal config')])
		builder.openMenu('legacy', 10, 10)
		const { root } = mount(BlockMenu)
		await nextTick()

		expect(entry(root, 'Duplicate').props.disabled).toBe(true)
		expect(entry(root, 'Configure').props.disabled).toBe(false)
	})

	it('offers it on a block the builder wrote', async () => {
		await openWith([editable('title', 'Text')])
		builder.openMenu('title', 10, 10)
		const { root } = mount(BlockMenu)
		await nextTick()

		expect(entry(root, 'Duplicate').props.disabled).toBe(false)
	})

	// The palette lists no row: a Grid writes its own. That took away a way of
	// creating one, not a block type — the rows on the page are handled as ever.
	it('offers the whole set on a row, which the palette no longer lists', async () => {
		await openWith([
			{ ...editable('grid', 'Grid'), children: [editable('band', 'GridRow')] },
		])
		builder.openMenu('grid/band', 10, 10)
		const { root } = mount(BlockMenu)
		await nextTick()

		for (const label of ['Configure', 'Duplicate', 'Move up', 'Move down']) {
			expect(entry(root, label).props.disabled, label).toBe(false)
		}
		expect(builder.selectedDescriptor.value?.type, 'and it is selected').toBe(
			'GridRow',
		)

		fire(entry(root, 'Delete'), 'click')
		expect(builder.session.value.draft?.blocks[0]?.children).toEqual([])
	})
})

describe('a block the builder cannot rewrite', () => {
	it('says why it is locked, and where to edit it', async () => {
		const reason = 'config holds an expression the builder cannot re-emit'
		await openWith([opaque('legacy', reason)])
		const block = builder.session.value.draft?.blocks[0]
		const { root } = mount(Node, { props: { block, path: 'legacy' } })
		await nextTick()

		const shown = textOf(root)
		expect(shown).toContain('legacy — written by hand, kept as is')
		expect(shown).toContain(
			'Config holds an expression the builder cannot re-emit.',
		)
		expect(shown, 'the file the block lives in').toContain('pages/sales.ts')
	})
})

describe('a setting the page needs and nobody filled in', () => {
	/** What the Nuxt build auto-imports around the config panel. */
	const panel = (): Record<string, Component> => ({
		DmsBuilderOption: Option as Component,
		DmsBuilderIconInput: stub('DmsBuilderIconInput'),
		DmsBuilderDataSource: stub('DmsBuilderDataSource'),
		USelectMenu: stub('USelectMenu'),
		USwitch: stub('USwitch'),
		UTextarea: stub('UTextarea'),
	})

	/** A tab set whose one tab has its region but no title. */
	async function tabWithNoTitle(): Promise<void> {
		await openWith([editable('tab', 'Tab')])
		builder.patchConfig('tab', { items: [{ slot: 'orders' }] })
		builder.select('tab')
		await vi.advanceTimersByTimeAsync(200)
	}

	it('marks the field it is missing from, and says so where the field is', async () => {
		await tabWithNoTitle()
		const { root } = mount(Config, { components: panel() })
		await nextTick()

		const shown = textOf(root)
		expect(
			findAll(root, (node) => node.tag === 'li').map(textOf),
			'named where the panel can be opened on it',
		).toEqual(['Tabs #1 → Label'])
		expect(shown, 'and on the field itself').toContain(
			'Required — the page cannot be built until this is filled in.',
		)
		// The mark every form uses, so a required field reads as one before it is
		// left empty rather than after.
		expect(
			findAll(root, (node) => node.props.title === 'Required'),
		).not.toHaveLength(0)
	})

	it('does not ask the author for the region id at all', async () => {
		await tabWithNoTitle()
		const { root } = mount(Config, { components: panel() })
		await nextTick()

		// `slot` is the id the children attach to, written by the editor: a field
		// for it teaches the one word the gesture exists to spare them.
		const labels = findAll(root, (node) => node.tag === 'label').map(textOf)
		expect(labels).toContain('Label *')
		expect(labels).not.toContain('Slot *')
		expect(labels).not.toContain('Slot')
	})
})

describe('a tab set the preview cannot build', () => {
	/** A tab set with two tabs, the second holding the block. */
	function tabSet(): BlockNode[] {
		return [
			{
				path: 'tab',
				name: 'tab',
				type: 'Tab',
				editable: true,
				config: {
					items: [
						{ slot: 'orders', label: 'Orders' },
						{ slot: 'sends', label: 'Sends' },
					],
				},
				children: [
					{
						path: 'tab/text',
						name: 'text',
						type: 'Text',
						editable: true,
						slot: 'sends',
						config: { content: 'Shipped' },
					},
				],
			},
		]
	}

	it('names its tabs and shows what each one holds', async () => {
		await openWith(tabSet())
		const block = builder.session.value.draft?.blocks[0]
		const { root } = mount(Node, {
			props: { block, path: 'tab' },
			components: {
				DmsBuilderNode: Node as Component,
				DmsBuilderChildren: Children as Component,
				DmsBuilderInsertion: stub('DmsBuilderInsertion'),
				DmsBuilderBoundary: stub('DmsBuilderBoundary'),
			},
		})
		await nextTick()

		// Standing in for itself, the set lays no slotted child out: without this
		// the block attached to the second tab is nowhere on the canvas, and the
		// two tabs are one dashed box that says nothing about either.
		const named = findAll(root, (node) => node.props['data-region'] !== undefined)
		expect(named.map((node) => node.props['data-region'])).toEqual([
			'orders',
			'sends',
		])
		// `v-if` is what the renderer here writes a comment placeholder as.
		expect(textOf(named[0]!), 'an empty tab is still named').toBe('Ordersv-if')
		expect(textOf(named[1]!)).toContain('Sends')
		expect(
			findAll(named[1]!, (node) => node.props['data-path'] === 'tab/text'),
			'and holds the block attached to it',
		).toHaveLength(1)
	})
})

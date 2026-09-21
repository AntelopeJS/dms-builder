import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Component } from 'vue'
import Bar from '../app/components/Bar.vue'
import BlockMenu from '../app/components/BlockMenu.vue'
import Children from '../app/components/Children.vue'
import Config from '../app/components/Config.vue'
import Node from '../app/components/Node.vue'
import Overlay from '../app/components/Overlay.vue'
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

/** What the Nuxt build auto-imports around the config panel. */
const panel = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderIconInput: stub('DmsBuilderIconInput'),
	DmsBuilderDataSource: stub('DmsBuilderDataSource'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

/** Fire a control's own `update:modelValue`, the way a user's input does. */
function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

describe('an option that takes one of several kinds', () => {
	const KINDS = ['Text', 'Number', 'Details']

	/** A tab set with one tab, whose badge is a union of three kinds. */
	async function tabWithABadge(): Promise<TestNode> {
		await openWith([editable('tab', 'Tab')])
		builder.patchConfig('tab', { items: [{ slot: 'orders', label: 'Orders' }] })
		builder.select('tab')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(Config, { components: panel() })
		await nextTick()
		return root
	}

	function kindButtons(root: TestNode): TestNode[] {
		return findAll(
			root,
			(node) =>
				node.tag === 'UButton' && KINDS.includes(String(node.props.label ?? '')),
		)
	}

	it('names the kinds it offers rather than ranking them', async () => {
		const root = await tabWithABadge()

		// `Option 1, Option 2, Option 3` says nothing about what picking one does.
		expect(kindButtons(root).map((node) => node.props.label)).toEqual(KINDS)
	})

	it('picks the kind that was clicked, and writes the value in it', async () => {
		const root = await tabWithABadge()
		const [, number] = kindButtons(root)
		fire(number!, 'click')
		await nextTick()

		const input = findAll(
			root,
			(node) => node.tag === 'UInput' && node.props.type === 'number',
		)
		expect(input, 'the kind picked is the one edited').toHaveLength(1)

		write(input[0]!, '7')
		await nextTick()
		const items = builder.session.value.draft?.blocks[0]?.config?.items
		expect(items).toEqual([{ slot: 'orders', label: 'Orders', badge: 7 }])
	})

	it('lets go of a value the kind now picked cannot carry', async () => {
		const root = await tabWithABadge()
		builder.patchConfig('tab', {
			items: [{ slot: 'orders', label: 'Orders', badge: 'New' }],
		})
		await nextTick()

		fire(kindButtons(root)[1]!, 'click')
		await nextTick()
		const items = builder.session.value.draft?.blocks[0]?.config?.items
		expect(items).toEqual([{ slot: 'orders', label: 'Orders' }])
	})
})

describe('an option whose branches are all of one kind', () => {
	/**
	 * A form's field list: an entry is a field or a group of fields, and the two
	 * are both objects. Kind cannot tell them apart, so a panel that went by kind
	 * alone read every entry as the first of the two — a group — and a form built
	 * in the editor came out as a group holding the one field that was asked for.
	 */
	async function formWithFields(fields: unknown[]): Promise<TestNode> {
		await openWith([editable('form', 'Form')])
		builder.patchConfig('form', { fields })
		builder.select('form')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(Config, { components: panel() })
		await nextTick()
		return root
	}

	/** The two branch buttons of the list's one entry, in declared order. */
	function branchButtons(root: TestNode): TestNode[] {
		return findAll(
			root,
			(node) => node.tag === 'UButton' && node.props.label === 'Details',
		)
	}

	/** The text box of the option a label names, reached through that label. */
	function box(root: TestNode, name: string): TestNode {
		const label = findAll(
			root,
			(node) => node.tag === 'label' && textOf(node).startsWith(name),
		)[0]
		const option = label?.parent?.parent
		const input = option
			? findAll(option, (node) => node.tag === 'UInput')[0]
			: undefined
		if (!input) {
			throw new Error(`no box labelled ${name}`)
		}
		return input
	}

	function fields(): unknown {
		return builder.session.value.draft?.blocks[0]?.config?.fields
	}

	it('reads an entry as the branch its own properties fit', async () => {
		// A plain field carries a type and no list of fields: nothing about it
		// says group, however the branches happen to be ordered.
		const root = await formWithFields([
			{ id: 'amount', label: 'Amount', type: 'number' },
		])

		const [group, field] = branchButtons(root)
		expect(field!.props.color, 'the field branch is the one shown').toBe(
			'primary',
		)
		expect(group!.props.color).toBe('neutral')
	})

	it('reads an entry that does hold fields as the group it is', async () => {
		const root = await formWithFields([
			{ id: 'address', label: 'Address', fields: [] },
		])

		const [group] = branchButtons(root)
		expect(group!.props.color).toBe('primary')
	})

	it('keeps the branch that was picked while the entry is filled in', async () => {
		const root = await formWithFields([{}])

		// The group: the branch a blank entry is not opened on, so this is a
		// choice and not the default holding by itself.
		fire(branchButtons(root)[0]!, 'click')
		await nextTick()
		// A key alone fits both branches; the choice is all there is to go on, and
		// moving off it would undo the choice at the first keystroke.
		write(box(root, 'Key'), 'address')
		await nextTick()

		expect(branchButtons(root)[0]!.props.color).toBe('primary')
		expect(fields()).toEqual([{ id: 'address' }])
	})

	it('seeds a fresh entry as an object, named after the list it joins', async () => {
		const root = await formWithFields([])

		const add = () =>
			findAll(
				root,
				(node) => node.tag === 'UButton' && node.props.label === 'Add',
			)[0]!
		fire(add(), 'click')
		await nextTick()
		fire(add(), 'click')
		await nextTick()

		// Seeded as `''`, the entry was of a kind no branch could carry; seeded
		// nameless, it rendered as a blank label in a column of them.
		expect(fields()).toEqual([{ label: 'Field 1' }, { label: 'Field 2' }])
		expect(branchButtons(root)).toHaveLength(4)
	})

	it('opens a blank entry on the branch that nests nothing', async () => {
		const root = await formWithFields([{}])

		// Blank, the entry fits both branches alike, and the group is the one
		// declared first. Adding one field is not asking for a group of fields,
		// so the list the group nests is what rules it out.
		const [group, field] = branchButtons(root)
		expect(field!.props.color).toBe('primary')
		expect(group!.props.color).toBe('neutral')
		expect(
			findAll(root, (node) => node.tag === 'label' && textOf(node) === 'Fields'),
			'no second field list under the entry',
		).toHaveLength(0)
	})

	it('drops what only the branch left behind knew', async () => {
		const root = await formWithFields([
			{ id: 'address', label: 'Address', fields: [] },
		])

		fire(branchButtons(root)[1]!, 'click')
		await nextTick()

		// `fields` left on the entry is what would read as a group again.
		expect(fields()).toEqual([{ id: 'address', label: 'Address' }])
		expect(branchButtons(root)[1]!.props.color).toBe('primary')
	})
})

describe('a block the preview could not build', () => {
	/**
	 * The canvas renders such a block from what the DMS is serving, so a table
	 * keeps its real columns while its options are edited. What the served node
	 * is found by is the path — and a path says nothing about whether the block
	 * saved there is the block now being built at it.
	 */
	async function formOnTheCanvas(
		config: Record<string, unknown>,
	): Promise<TestNode> {
		backend.layout = {
			components: { form: { componentName: 'DmsForm', options: { title: 'form' } } },
		}
		backend.preview = {
			ok: true,
			data: { components: {}, degraded: ['/reports/sales#form'] },
			changes: [],
		}
		await openWith([
			{ path: 'form', name: 'form', type: 'Form', editable: true, config },
		])
		builder.select('form')
		await nextTick()
		const { root } = mount(Node, {
			props: { block: builder.session.value.draft?.blocks[0], path: 'form' },
			components: {
				DmsBuilderNode: Node as Component,
				DmsBuilderChildren: Children as Component,
				DmsBuilderInsertion: stub('DmsBuilderInsertion'),
				DmsBuilderBoundary: stub('DmsBuilderBoundary'),
			},
		})
		await nextTick()
		return root
	}

	it('renders what the DMS serves, and says the render is the saved one', async () => {
		const root = await formOnTheCanvas({
			fields: [{ id: 'amount', label: 'Amount', type: { $dataType: 'number' } }],
		})

		expect(textOf(root)).toContain('· as saved')
	})

	it('drops that render once the block still needs a setting filled in', async () => {
		// A page never compiled with a required setting empty, so what is served
		// at this path was saved by some other block — the one this replaced,
		// under the name it was given back. Rendering it shows the author content
		// their draft does not hold.
		const root = await formOnTheCanvas({ fields: [{}] })

		expect(textOf(root)).not.toContain('· as saved')
	})
})

describe('a tab set on the canvas', () => {
	/** What the DMS's tab set exposes: the tab it has open, by index. */
	function tabComponent(open: string): Component {
		return {
			name: 'DmsTab',
			setup(_props, { expose, slots }) {
				expose({ activeTab: open })
				return () => h('DmsTab', null, slots.default?.() ?? [])
			},
		}
	}

	function twoTabs(): BlockNode {
		return {
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
		}
	}

	afterEach(() => {
		Object.assign(globalThis, { resolveDmsComponent: () => undefined })
	})

	it('says which tab it is showing, so a drop lands there', async () => {
		// The author switched to the second tab. Nothing about the pointer says
		// so — the tab set hides every other tab — and the editor would go on
		// dropping into the first.
		Object.assign(globalThis, { resolveDmsComponent: () => tabComponent('1') })
		await openWith([twoTabs()])
		const block = builder.session.value.draft?.blocks[0]
		const { unmount } = mount(Node, {
			props: { block, path: 'tab', preview: { componentName: 'DmsTab' } },
			components: {
				DmsBuilderNode: Node as Component,
				DmsBuilderChildren: Children as Component,
				DmsBuilderInsertion: stub('DmsBuilderInsertion'),
				DmsBuilderBoundary: stub('DmsBuilderBoundary'),
			},
		})
		await nextTick()

		expect(builder.session.value.openRegions).toEqual({ tab: 'sends' })

		builder.addBlock('Text', 'tab', null)
		expect(
			builder.session.value.draft?.blocks[0]?.children?.[0]?.slot,
			'and the block lands in the tab that is open',
		).toBe('sends')
		// It answers for as long as it is on the canvas, and no longer.
		unmount()
	})

	it('reports nothing for a block that hides none of itself', async () => {
		Object.assign(globalThis, {
			resolveDmsComponent: () => stub('DmsText') as Component,
		})
		await openWith([editable('title', 'Text')])
		const block = builder.session.value.draft?.blocks[0]
		mount(Node, {
			props: { block, path: 'title', preview: { componentName: 'DmsText' } },
			components: {
				DmsBuilderNode: Node as Component,
				DmsBuilderChildren: Children as Component,
				DmsBuilderInsertion: stub('DmsBuilderInsertion'),
				DmsBuilderBoundary: stub('DmsBuilderBoundary'),
			},
		})
		await nextTick()

		expect(builder.session.value.openRegions.title).toBe(undefined)
	})
})

describe('a block that awaits before it can render', () => {
	/** What a form does: it asks for its values before it draws a field. */
	function awaitingComponent(): Component {
		return {
			name: 'DmsForm',
			async setup(_props, { slots }) {
				await Promise.resolve()
				return () => h('DmsForm', null, slots.default?.() ?? [])
			},
		}
	}

	afterEach(() => {
		Object.assign(globalThis, { resolveDmsComponent: () => undefined })
	})

	it('renders it, rather than warning once per render and mounting nothing', async () => {
		Object.assign(globalThis, {
			resolveDmsComponent: () => awaitingComponent(),
		})
		await openWith([editable('form', 'Form')])
		const block = builder.session.value.draft?.blocks[0]
		const { root, warnings } = mount(Node, {
			props: { block, path: 'form', preview: { componentName: 'dms-form' } },
			components: {
				DmsBuilderNode: Node as Component,
				DmsBuilderChildren: Children as Component,
				DmsBuilderInsertion: stub('DmsBuilderInsertion'),
				DmsBuilderBoundary: stub('DmsBuilderBoundary'),
			},
		})
		// What the component awaits, then the render Suspense lets through.
		await vi.advanceTimersByTimeAsync(1)
		await nextTick()

		// Vue refuses to mount an async setup with no Suspense above it, and says
		// so on every render — which is what a canvas full of them comes to.
		expect(warnings.join(' ')).not.toContain('Suspense')
		expect(findAll(root, (node) => node.tag === 'DmsForm')).toHaveLength(1)
	})
})

describe('the way out of the editor', () => {
	function buttons(root: TestNode): string[] {
		return findAll(root, (node) => node.tag === 'UButton').map((node) =>
			String(node.props.label ?? node.props['aria-label'] ?? ''),
		)
	}

	it('asks before dropping a draft, and the bar offers no way past it', async () => {
		await openWith([editable('title', 'Text')])
		builder.addBlock('Text')
		const bar = mount(Bar)
		await nextTick()

		// The × in the bar is one of the two ways out; both go through `leave`.
		const close = findAll(
			bar.root,
			(node) => node.props['aria-label'] === 'Leave the builder',
		)[0]
		fire(close!, 'click')

		const { root } = mount(Overlay, {
			components: {
				DmsBuilderBar: stub('DmsBuilderBar'),
				DmsBuilderCanvas: stub('DmsBuilderCanvas'),
				DmsBuilderRail: stub('DmsBuilderRail'),
				DmsBuilderBlockMenu: stub('DmsBuilderBlockMenu'),
			},
		})
		await nextTick()

		expect(builder.session.value.active, 'nothing closed yet').toBe(true)
		expect(textOf(root)).toContain('Leaving the editor drops them')
		expect(buttons(root)).toEqual(
			expect.arrayContaining([
				'Save and leave',
				'Leave without saving',
				'Stay',
			]),
		)
	})
})

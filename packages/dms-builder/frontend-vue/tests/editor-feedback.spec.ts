import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Component } from 'vue'
import Bar from '../app/components/Bar.vue'
import BlockMenu from '../app/components/BlockMenu.vue'
import Children from '../app/components/Children.vue'
import Config from '../app/components/Config.vue'
import FormFieldDetail from '../app/components/FormFieldDetail.vue'
import FormFields from '../app/components/FormFields.vue'
import FormPanel from '../app/components/FormPanel.vue'
import FormTarget from '../app/components/FormTarget.vue'
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
import { useBuilderMode } from '../app/runtime/mode'
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
		await openWith([editable('title', 'Text')])
		const { root } = mount(Bar)
		refuseTheRow()
		// A block put beside the title: the row that takes the two is refused.
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0, { around: 'title', type: 'Grid', index: 1 })
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

	// Nobody sees the row a block sits in, so nobody can delete it: deleting
	// the block beside it is what has to take the row away.
	it('offers the whole set on a block in a row, and the row goes with it', async () => {
		await openWith([
			{
				...editable('grid', 'Grid'),
				children: [
					{
						...editable('band', 'GridRow'),
						children: [editable('card', 'Text'), editable('note', 'Text')],
					},
				],
			},
		])
		builder.openMenu('grid/band/card', 10, 10)
		const { root } = mount(BlockMenu)
		await nextTick()

		for (const label of ['Configure', 'Duplicate', 'Move up', 'Move down']) {
			expect(entry(root, label).props.disabled, label).toBe(false)
		}
		expect(builder.selectedDescriptor.value?.type, 'and it is selected').toBe(
			'Text',
		)

		fire(entry(root, 'Delete'), 'click')
		expect(
			builder.session.value.draft?.blocks.map((block) => block.name),
		).toEqual(['note'])
	})
})

describe('a block the builder cannot rewrite', () => {
	it('says it is locked in words for whoever builds the page', async () => {
		const reason = 'config holds an expression the builder cannot re-emit'
		await openWith([opaque('legacy', reason)])
		const block = builder.session.value.draft?.blocks[0]
		const { root } = mount(Node, { props: { block, path: 'legacy' } })
		await nextTick()

		const shown = textOf(root)
		expect(shown).toContain("legacy is set up in code and can't be changed here")
		expect(shown, 'no reason worded for a developer').not.toContain(reason)
		expect(shown, 'and no file path').not.toContain('pages/sales.ts')
	})

	it('shows as the page shows it, once the DMS serves it', async () => {
		backend.layout = {
			components: {
				period: { componentName: 'DmsPeriodSelector', options: {} },
			},
		}
		backend.preview = {
			ok: true,
			data: { components: {}, degraded: ['/reports/sales#period'] },
			changes: [],
		}
		await openWith([opaque('period', 'unresolved reference')])
		const served = stub('DmsPeriodSelector')
		Object.assign(globalThis, {
			resolveDmsComponent: (name: string) =>
				name === 'DmsPeriodSelector' ? served : undefined,
		})
		try {
			builder.select('period')
			const { root } = mount(Node, {
				props: { block: builder.session.value.draft?.blocks[0], path: 'period' },
				components: {
					DmsBuilderChildren: Children as Component,
					DmsBuilderPlaceholder: stub('DmsBuilderPlaceholder'),
					DmsBuilderBoundary: stub('DmsBuilderBoundary'),
				},
			})
			await nextTick()

			expect(
				findAll(root, (node) => node.tag === 'DmsPeriodSelector'),
				'the real block, rendered',
			).toHaveLength(1)
			const shown = textOf(root)
			expect(shown, 'the chip says why nothing opens').toContain('set up in code')
			expect(shown).not.toContain("can't be changed here")
		} finally {
			Object.assign(globalThis, { resolveDmsComponent: () => undefined })
		}
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
				DmsBuilderPlaceholder: stub('DmsBuilderPlaceholder'),
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
		// A tab holding nothing is still named, and now carries the way in that
		// says so: without a surface of its own, the only box under the pointer
		// was the tab set's, whose ends aim beside it rather than into the tab.
		expect(textOf(named[0]!), 'an empty tab is still named').toBe(
			'Orders Empty container — add a block',
		)
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
	DmsBuilderFormPanel: FormPanel as Component,
	DmsBuilderFormTarget: FormTarget as Component,
	DmsBuilderFormFields: FormFields as Component,
	DmsBuilderFormFieldDetail: FormFieldDetail as Component,
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

describe('a list that takes two kinds of entry', () => {
	/**
	 * A form's field list: an entry is a field or a group of fields, and the two
	 * are both objects. Each is added by a button of its own and stays what it
	 * was added as — a switch between the two on every entry asked someone who
	 * had just added a field whether it was a field.
	 *
	 * In the advanced view: the simple one fills a form from a table instead.
	 */
	const { setMode } = useBuilderMode()
	beforeEach(() => setMode('advanced'))
	afterEach(() => setMode('simple'))

	async function formWithFields(fields: unknown[]): Promise<TestNode> {
		await openWith([editable('form', 'Form')])
		builder.patchConfig('form', { fields })
		builder.select('form')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(Config, { components: panel() })
		await nextTick()
		return root
	}

	function button(root: TestNode, label: string): TestNode | undefined {
		return findAll(
			root,
			(node) => node.tag === 'UButton' && node.props.label === label,
		)[0]
	}

	/** What each entry says it is, at its head. */
	function heads(root: TestNode): string[] {
		return findAll(
			root,
			(node) => node.tag === 'span' && /^#\d/.test(textOf(node).trim()),
		).map((node) => textOf(node).replace(/\s+/g, ' ').trim())
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

	it('offers no switch between the two on an entry, and says which it is', async () => {
		const root = await formWithFields([
			{ id: 'amount', label: 'Amount', type: 'number' },
		])

		expect(button(root, 'Field'), 'no tab to turn it into a group').toBe(undefined)
		expect(button(root, 'Group')).toBe(undefined)
		expect(heads(root)).toEqual(['#1 · Field'])
		expect(
			findAll(root, (node) => node.tag === 'label' && textOf(node) === 'Fields'),
			'no second field list under a field',
		).toHaveLength(0)
	})

	it('reads an entry that does hold fields as the group it is', async () => {
		const root = await formWithFields([
			{ id: 'address', label: 'Address', fields: [] },
		])
		expect(heads(root)).toEqual(['#1 · Group'])
	})

	it('adds each kind from a button of its own, named and counted after it', async () => {
		const root = await formWithFields([])
		expect(button(root, 'Add'), 'no button that leaves the kind open').toBe(
			undefined,
		)

		fire(button(root, 'Add field')!, 'click')
		await nextTick()
		fire(button(root, 'Add field')!, 'click')
		await nextTick()
		fire(button(root, 'Add group')!, 'click')
		await nextTick()

		// Seeded untyped, a field was one the form could not be built with;
		// seeded without its list, a group read as a field the moment it was drawn.
		const text = { $dataType: 'string', config: {} }
		expect(fields()).toEqual([
			{ label: 'Field 1', type: text },
			{ label: 'Field 2', type: text },
			{ label: 'Group 1', fields: [] },
		])
		expect(heads(root)).toEqual(['#1 · Field', '#2 · Field', '#3 · Group'])
	})

	it('keeps an entry what it was added as while it is filled in', async () => {
		const root = await formWithFields([])
		fire(button(root, 'Add group')!, 'click')
		await nextTick()

		// The group's own label, the last one the panel shows.
		const titles = findAll(
			root,
			(node) => node.tag === 'label' && textOf(node).startsWith('Label'),
		)
		const option = titles[titles.length - 1]?.parent?.parent
		write(findAll(option!, (node) => node.tag === 'UInput')[0]!, 'Address')
		await nextTick()

		expect(heads(root)).toEqual(['#1 · Group'])
		expect(fields()).toEqual([{ label: 'Address', fields: [] }])
	})
})

/**
 * A field is sent under a key, and a key is a name only code reads. The simple
 * mode leaves it out and writes it from the label; the advanced view shows it
 * and leaves it to whoever types it.
 */
describe('the key of a form field', () => {
	const { setMode } = useBuilderMode()
	const text = { $dataType: 'string', config: {} }

	afterEach(() => setMode('simple'))

	async function formWithFields(fields: unknown[]): Promise<TestNode> {
		await openWith([editable('form', 'Form')])
		builder.patchConfig('form', { fields })
		builder.select('form')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(Config, { components: panel() })
		await nextTick()
		return root
	}

	function labels(root: TestNode): string[] {
		return findAll(root, (node) => node.tag === 'label').map((node) =>
			textOf(node).replace('*', '').trim(),
		)
	}

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

	function fields(): Array<Record<string, unknown>> {
		return (builder.session.value.draft?.blocks[0]?.config?.fields ?? []) as Array<
			Record<string, unknown>
		>
	}

	/** Open the form's first field, where the simple mode edits its label. */
	async function openFirst(root: TestNode): Promise<void> {
		const line = findAll(
			root,
			(node) => node.tag === 'button' && node.props['aria-expanded'] === false,
		)[0]
		fire(line!, 'click')
		await nextTick()
	}

	it('is left out of the simple mode, and written from the label', async () => {
		const root = await formWithFields([{ label: 'Field 1', type: text }])
		await openFirst(root)
		expect(labels(root)).not.toContain('Key')
		expect(labels(root)).toContain('Label')

		write(box(root, 'Label'), 'Délai de livraison')
		await nextTick()
		expect(fields()[0]?.id).toBe('delaiDeLivraison')

		// Following the label for as long as it is the key the label gave.
		write(box(root, 'Label'), 'Delivery date')
		await nextTick()
		expect(fields()[0]?.id).toBe('deliveryDate')
	})

	it('is kept apart from the keys of the other fields of the form', async () => {
		await formWithFields([
			{ id: 'amount', label: 'Amount', type: text },
			{ label: 'Amount', type: text },
		])
		expect(fields().map((field) => field.id)).toEqual(['amount', 'amount2'])
	})

	it('is shared with the fields a group holds, which are sent beside the rest', async () => {
		await formWithFields([
			{ id: 'city', label: 'City', type: text },
			{ id: 'address', label: 'Address', fields: [{ label: 'City', type: text }] },
		])
		const group = fields()[1] as { fields: Array<Record<string, unknown>> }
		expect(group.fields[0]?.id).toBe('city2')
	})

	it('is left alone once it says something the label did not give it', async () => {
		// Written by hand, in the code or in the advanced view: a backend reads
		// the form under that name.
		const root = await formWithFields([{ id: 'test', label: 'aaa', type: text }])
		await openFirst(root)

		write(box(root, 'Label'), 'Amount')
		await nextTick()
		expect(fields()[0]?.id).toBe('test')
	})

	it('is shown in the advanced view, and left to whoever types it', async () => {
		setMode('advanced')
		const root = await formWithFields([{ label: 'Field 1', type: text }])
		expect(labels(root)).toContain('Key')

		write(box(root, 'Label'), 'Amount')
		await nextTick()
		expect(fields()[0]?.id).toBe(undefined)

		write(box(root, 'Key'), 'total')
		await nextTick()
		expect(fields()[0]?.id).toBe('total')
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
				DmsBuilderPlaceholder: stub('DmsBuilderPlaceholder'),
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
				DmsBuilderPlaceholder: stub('DmsBuilderPlaceholder'),
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
				DmsBuilderPlaceholder: stub('DmsBuilderPlaceholder'),
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
				DmsBuilderPlaceholder: stub('DmsBuilderPlaceholder'),
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

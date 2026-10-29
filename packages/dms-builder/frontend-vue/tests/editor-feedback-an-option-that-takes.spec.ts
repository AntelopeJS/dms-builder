import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Component } from 'vue'
import Children from '../app/components/Children.vue'
import Config from '../app/components/Config.vue'
import Node from '../app/components/Node.vue'
import Option from '../app/components/Option.vue'
import {
	findAll,
	fire,
	mount,
	stub,
	textOf,
	type TestNode,
} from './support/render'
import { useBuilderMode } from '../app/runtime/mode'
import type { BlockNode } from '../app/runtime/types'
import {
	backend,
	builder,
	openWith,
	editable,
	panel,
	write,
} from './support/editor-feedback-harness'

describe('an option that takes one of several kinds', () => {
	const KINDS = ['Text', 'Number', 'Details']
	// A tab's badge, as the advanced view offers it: the simple mode's panel
	// takes it as a count or a word.
	const { setMode } = useBuilderMode()
	beforeEach(() => setMode('advanced'))
	afterEach(() => setMode('simple'))

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

	/** What a box is labelled, by a form field or by a `label` of its own. */
	function labelOf(node: TestNode): string | undefined {
		const text =
			node.tag === 'UFormField'
				? String(node.props.label ?? '')
				: node.tag === 'label'
					? textOf(node)
					: undefined
		return text?.replace('*', '').trim()
	}

	function labels(root: TestNode): string[] {
		return findAll(root, (node) => labelOf(node) !== undefined).map(
			(node) => labelOf(node) ?? '',
		)
	}

	function box(root: TestNode, name: string): TestNode {
		const label = findAll(root, (node) => !!labelOf(node)?.startsWith(name))[0]
		const option = label?.tag === 'UFormField' ? label : label?.parent?.parent
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

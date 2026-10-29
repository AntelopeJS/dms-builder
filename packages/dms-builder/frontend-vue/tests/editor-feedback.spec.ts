import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Bar from '../app/components/Bar.vue'
import BlockMenu from '../app/components/BlockMenu.vue'
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
import { guardContent, unguardContent } from '../app/runtime/wrappers'
import type { BlockNode } from '../app/runtime/types'
import {
	backend,
	builder,
	openWith,
	editable,
	opaque,
	refuseTheRow,
	panel,
	write,
} from './support/editor-feedback-harness'

describe('the status in the bar', () => {
	function status(root: TestNode): { kind: string; label: string } {
		const button = findAll(
			root,
			(node) => node.tag === 'button' && node.props['data-status'] !== undefined,
		)[0]
		if (!button) {
			throw new Error('no status in the bar')
		}
		return { kind: String(button.props['data-status']), label: textOf(button) }
	}

	it('says the page is saved while the draft holds nothing new', async () => {
		await openWith([editable('title', 'Text')])
		const { root } = mount(Bar)
		await nextTick()
		expect(status(root)).toEqual({ kind: 'clean', label: 'All changes saved' })
	})

	it('counts the changes waiting for Save, and opens their list', async () => {
		await openWith([editable('title', 'Text')])
		const { root } = mount(Bar)
		builder.addBlock('Text')
		await nextTick()
		expect(status(root)).toEqual({ kind: 'dirty', label: '1 unsaved change' })

		const button = findAll(root, (node) => node.props['data-status'] === 'dirty')[0]!
		fire(button, 'click')
		expect(builder.session.value.inspector).toBe('changes')
	})

	it('puts the block the module refused before the count', async () => {
		await openWith([editable('title', 'Text')])
		const { root } = mount(Bar)
		refuseTheRow()
		// A block put beside the title: the row that takes the two is refused.
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0, { around: 'title', type: 'Grid', index: 1 })
		await vi.advanceTimersByTimeAsync(200)
		await nextTick()

		expect(status(root)).toEqual({ kind: 'fix', label: '1 to fix · 1 unsaved' })
		expect(builder.problems.value).toEqual(['grid/gridRow'])
	})

	it('says a failed save failed, and that nothing was written', async () => {
		await openWith([editable('title', 'Text')])
		const { root } = mount(Bar)
		builder.addBlock('Text')
		backend.save = {
			ok: false,
			error: { code: 'unsupported', detail: 'the disk is full' },
		}
		await builder.save()
		await nextTick()
		expect(status(root)).toEqual({
			kind: 'error',
			label: 'Save failed · nothing written',
		})
	})
})

describe('the mode switch in the bar', () => {
	const { mode, setMode } = useBuilderMode()

	afterEach(() => setMode('simple'))

	it('switches the builder to the advanced view and shows it chosen', async () => {
		setMode('simple')
		await openWith([editable('title', 'Text')])
		const { root } = mount(Bar)
		const switcher = findAll(
			root,
			(node) =>
				node.tag === 'DmsSegmented' && node.props['aria-label'] === 'Builder mode',
		)[0]!
		expect(switcher.props['model-value']).toBe('simple')

		write(switcher, 'advanced')
		await nextTick()

		expect(mode.value).toBe('advanced')
		expect(switcher.props['model-value']).toBe('advanced')
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
		expect(entry(root, 'Edit settings').props.disabled).toBe(false)
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

		for (const label of ['Edit settings', 'Duplicate', 'Move up', 'Move down']) {
			expect(entry(root, label).props.disabled, label).toBe(false)
		}
		expect(builder.selectedDescriptor.value?.type, 'and it is selected').toBe(
			'Text',
		)

		fire(entry(root, 'Remove'), 'click')
		expect(
			builder.session.value.draft?.blocks.map((block) => block.name),
		).toEqual(['note'])
	})
})

describe('a block the builder cannot rewrite', () => {
	it('refuses ancestor duplication and guard changes that would lose a locked child source path', async () => {
		const card: BlockNode = { ...editable('card', 'Text'), config: { title: 'Known' }, lockedOptions: { content: 'Source expression' } }
		await openWith([{ ...editable('section', 'Section'), children: [card] }])
		const before = JSON.stringify(builder.session.value.draft)
		builder.duplicate('section')
		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.mutate((draft) => { guardContent(draft, 'section') })).toBe(false)
		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		await openWith([{ ...editable('section', 'Section'), children: [{ ...editable('guard', 'Guard'), children: [card] }] }])
		const guarded = JSON.stringify(builder.session.value.draft)
		expect(builder.mutate((draft) => { unguardContent(draft, 'section') })).toBe(false)
		expect(JSON.stringify(builder.session.value.draft)).toBe(guarded)
	})

	it('retains known identity and children while explaining the lock in simple mode', async () => {
		useBuilderMode().setMode('simple')
		await openWith([{ name: 'layout', path: 'layout', type: 'VStack', editable: false, opaqueReason: 'Shared configuration: edit it in code', children: [editable('card', 'Text')] }])
		const draft = builder.session.value.draft!.blocks[0]!
		expect(draft.type).toBe('VStack')
		expect(draft.children?.[0]).toMatchObject({ type: 'Text', preserve: true })
		builder.select('layout')
		const view = mount(Config)
		await nextTick()
		expect(textOf(view.root)).toContain('Shared configuration: edit it in code')
		builder.patchConfig('layout/card', { text: 'Cannot change' })
		expect(builder.session.value.draft!.blocks[0]!.children?.[0]?.config).toBeUndefined()
		view.unmount()
	})

	it('offers understood options, names locked ones, and refuses their mutation', async () => {
		useBuilderMode().setMode('simple')
		backend.catalog.blocks.push({ type: 'ExampleCard', label: 'Example card', container: false, shapeSource: 'test', config: { title: { type: 'string', ui: { label: 'Title' } }, result: { type: 'number', ui: { label: 'Result' } } } })
		await openWith([{ name: 'card', path: 'card', type: 'ExampleCard', editable: true, config: { title: 'Before' }, lockedOptions: { result: 'Defined in code; preserved unchanged' } }])
		builder.select('card')
		const view = mount(Config, { components: { DmsBuilderOption: Option } })
		await nextTick()
		expect(textOf(view.root)).toContain('Some options are managed in code')
		expect(textOf(view.root)).toContain('result: Defined in code')
		expect(findAll(view.root, (node) => node.props.id === 'card:result')).toHaveLength(0)
		builder.patchConfig('card', { title: 'After' })
		builder.patchConfig('card', { result: 123 })
		expect(builder.session.value.draft!.blocks[0]!.config).toEqual({ title: 'After' })
		view.unmount()
	})

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
	// A tab set's own options, as the advanced view lists them: the simple mode
	// edits a tab set with a panel of its own.
	const { setMode } = useBuilderMode()
	beforeEach(() => setMode('advanced'))
	afterEach(() => setMode('simple'))

	/** What the Nuxt build auto-imports around the config panel. */
	const panel = (): Record<string, Component> => ({
		DmsBuilderOption: Option as Component,
		DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
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
		).toEqual(['Tabs 1 · Label'])
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
			'Orders Add a block here',
		)
		expect(textOf(named[1]!)).toContain('Sends')
		expect(
			findAll(named[1]!, (node) => node.props['data-path'] === 'tab/text'),
			'and holds the block attached to it',
		).toHaveLength(1)
	})
})

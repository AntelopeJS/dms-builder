import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Banners from '../app/components/Banners.vue'
import Bar from '../app/components/Bar.vue'
import Layers from '../app/components/Layers.vue'
import Overlay from '../app/components/Overlay.vue'
import {
	asElement,
	findAll,
	fire,
	mount,
	stub,
	type TestElement,
	type TestNode,
} from './support/render'
import {
	builder,
	openWith,
	editable,
	write,
} from './support/editor-feedback-harness'

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

		// Done in the bar is one of the ways out; they all go through `leave`.
		const close = findAll(bar.root, (node) => node.props.label === 'Done')[0]
		fire(close!, 'click')

		const { root } = mount(Banners)
		await nextTick()

		expect(builder.session.value.active, 'nothing closed yet').toBe(true)
		const dialog = findAll(root, (node) => node.tag === 'UModal')[0]!
		expect(dialog.props.open).toBe(true)
		expect(dialog.props.title).toBe('Save before leaving?')
		expect(buttons(root)).toEqual(
			expect.arrayContaining([
				'Save and leave',
				'Leave, keep the draft',
				'Leave without saving',
				'Stay',
			]),
		)
	})
})

describe('the data sources', () => {
	it('are reached from the bar', async () => {
		await openWith([editable('title', 'Text')])
		const bar = mount(Bar)
		await nextTick()

		const workspaces = findAll(
			bar.root,
			(node) => node.tag === 'DmsSegmented' && node.props['aria-label'] === 'Workspace',
		)[0]
		write(workspaces!, 'data')

		expect(builder.session.value.workspace).toBe('data')
	})
})

describe('the keys', () => {
	type KeyListener = (event: KeyboardEvent) => void

	/** Mount the overlay and answer the keydown listener it puts on the page. */
	function overlayKeys(): KeyListener {
		const listeners: KeyListener[] = []
		const host = document as unknown as {
			addEventListener: (type: string, listener: KeyListener) => void
		}
		const previous = host.addEventListener
		host.addEventListener = (type, listener) => {
			if (type === 'keydown') {
				listeners.push(listener)
			}
		}
		mount(Overlay, {
			components: {
				DmsBuilderBar: stub('DmsBuilderBar'),
				DmsBuilderCanvas: stub('DmsBuilderCanvas'),
				DmsBuilderLeftRail: stub('DmsBuilderLeftRail'),
				DmsBuilderBlockMenu: stub('DmsBuilderBlockMenu'),
			},
		})
		host.addEventListener = previous
		return (event) => listeners.at(-1)?.(event)
	}

	/** An element of the page as `closest` sees it: inside the canvas or not. */
	function control(inCanvas: boolean): EventTarget {
		return {
			closest: (selector: string) =>
				selector === '[data-path]' && !inCanvas ? null : {},
		} as unknown as EventTarget
	}

	function key(
		name: string,
		target: EventTarget | TestElement | null = null,
		modifiers: { altKey?: boolean; ctrlKey?: boolean } = {},
	): KeyboardEvent {
		return {
			key: name,
			target,
			metaKey: false,
			ctrlKey: modifiers.ctrlKey ?? false,
			altKey: modifiers.altKey ?? false,
			shiftKey: false,
			defaultPrevented: false,
			preventDefault: () => {},
		} as unknown as KeyboardEvent
	}

	it('Escape deselects, and never leaves the editor', async () => {
		await openWith([editable('title', 'Text')])
		builder.addBlock('Text')
		const press = overlayKeys()

		press(key('Escape'))
		expect(builder.session.value.selection).toBe(null)

		press(key('Escape'))
		expect(builder.session.value.active).toBe(true)
		expect(builder.session.value.pendingClose, 'nor asks to').toBe(false)
	})

	it('Escape closes the block menu before the selection', async () => {
		await openWith([editable('title', 'Text')])
		builder.openMenu('title', 0, 0)
		const press = overlayKeys()

		press(key('Escape'))

		expect(builder.session.value.menu).toBe(null)
		expect(builder.session.value.selection).toBe('title')
	})

	it('Escape leaves an open panel alone when nothing is selected', async () => {
		await openWith([editable('title', 'Text')])
		builder.setView('page')
		const press = overlayKeys()

		press(key('Escape'))

		expect(builder.session.value.inspector).toBe('page')
	})

	it('leaves the block alone when the key is for a control of the panel', async () => {
		await openWith([editable('title', 'Text'), editable('intro', 'Text')])
		builder.select('title')
		const press = overlayKeys()

		// A switch the panel just toggled still has the focus.
		press(key('Backspace', control(false)))
		press(key('ArrowDown', control(false)))
		expect(builder.session.value.draft?.blocks.map((block) => block.name)).toEqual([
			'title',
			'intro',
		])

		// A button inside the block itself: the key is the block's.
		press(key('Backspace', control(true)))
		expect(builder.session.value.draft?.blocks.map((block) => block.name)).toEqual([
			'intro',
		])
	})

	it('acts on the selected block while a row of the layers has the focus', async () => {
		await openWith([
			editable('title', 'Text'),
			editable('intro', 'Text'),
			editable('outro', 'Text'),
		])
		const press = overlayKeys()
		const { root } = mount(Layers)
		const names = (): string[] | undefined =>
			builder.session.value.draft?.blocks.map((block) => block.name)
		// The row the click selected keeps the focus, as it does in a browser.
		const row = findAll(
			root,
			(node) => node.tag === 'button' && typeof node.props.onMouseenter === 'function',
		)[1]
		if (!row) {
			throw new Error('no row for the second block')
		}
		fire(row, 'click')
		const focused = asElement(row)
		expect(builder.session.value.selection).toBe('intro')

		press(key('ArrowDown', focused))
		expect(builder.session.value.selection).toBe('outro')

		press(key('ArrowUp', focused, { altKey: true }))
		expect(names()).toEqual(['title', 'outro', 'intro'])

		press(key('d', focused, { ctrlKey: true }))
		expect(names()).toHaveLength(4)

		press(key('Delete', focused))
		expect(names()).toEqual(['title', 'outro', 'intro'])

		press(key('Enter', focused))
		expect(builder.session.value.inspector).toBe('config')
	})
})

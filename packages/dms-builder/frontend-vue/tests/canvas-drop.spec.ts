import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Canvas from '../app/components/Canvas.vue'
import {
	fire,
	mount,
	pointerOver,
	textOf,
	type TestNode,
} from './support/render'
import {
	builder,
	globals,
	openWith,
	block,
	nodeAt,
	gaps,
	gapAxes,
	into,
	frameOf,
	aim,
	letGo,
	elements,
	names,
} from './support/canvas-drop-harness'

describe('the surfaces a drop is allowed on', () => {
	/**
	 * A drop target is declared by cancelling `dragenter` as well as `dragover`.
	 * Cancelling `dragover` alone is enough for the `drop` event to fire, so the
	 * gesture works — but the cursor is drawn from the target determination the
	 * browser makes on `dragenter`, and an uncancelled one leaves the no-drop
	 * cursor on screen for the whole drag, over a surface that accepts it.
	 */
	it('cancels dragenter as well as dragover, on the page and on a block', async () => {
		await openWith([block('title', 'Text')], { title: { componentName: 'DmsText' } })
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		const page = root.children[0]!
		expect(fire(page, 'dragenter').prevented, 'the page').toBe(true)
		expect(fire(nodeAt(root, 'title'), 'dragenter').prevented, 'a block').toBe(true)
	})

	/** What a surface answered the browser with, on either drag event. */
	function cursor(target: TestNode, event: 'dragenter' | 'dragover'): unknown {
		const fired = fire(
			target,
			event,
			pointerOver({ top: 0, height: 100, left: 0, width: 100 }, { x: 50, y: 5 }),
		)
		return (fired.dataTransfer as unknown as { dropEffect?: string }).dropEffect
	}

	it('answers with the effect the gesture carries, on entry and over', async () => {
		await openWith([block('title', 'Text')], { title: { componentName: 'DmsText' } })
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()
		const page = root.children[0]!

		// The palette copies a block in; a block already on the page moves. Said
		// otherwise than the source declared, the browser reconciles two gestures
		// and draws its no-drop cursor over a surface that accepts the drop.
		builder.beginDrag({ type: 'Text' })
		expect(cursor(nodeAt(root, 'title'), 'dragover')).toBe('copy')
		expect(cursor(nodeAt(root, 'title'), 'dragenter')).toBe('copy')
		expect(cursor(page, 'dragover')).toBe('copy')

		builder.beginDrag({ path: 'title' })
		expect(cursor(nodeAt(root, 'title'), 'dragover')).toBe('move')
		expect(cursor(nodeAt(root, 'title'), 'dragenter')).toBe('move')
		expect(cursor(page, 'dragover')).toBe('move')
	})

	it('turns the cursor down where the aim is refused', async () => {
		await openWith(
			[block('stack', 'HStack', [block('a', 'Text')])],
			{ stack: { componentName: 'DmsHStack' } },
		)
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		// A row cannot be a column inside a stack; the middle band is where the
		// drop would land inside it.
		builder.beginDrag({ type: 'GridRow' })
		fire(
			nodeAt(root, 'stack'),
			'dragover',
			pointerOver({ top: 0, height: 100, left: 0, width: 100 }, { x: 50, y: 50 }),
		)
		expect(cursor(nodeAt(root, 'stack'), 'dragenter')).toBe('none')
	})
})

describe('the canvas at rest', () => {
	it('shows the page and nothing else: no target, no room, no frame', async () => {
		await openWith([block('title', 'Text'), block('intro', 'Text')], {
			title: { componentName: 'DmsText' },
			intro: { componentName: 'DmsText' },
		})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		expect(gaps(root)).toEqual([])
		expect(into(root)).toBe(null)
		expect(textOf(root)).toContain('Drop a block, or press')
	})
})

describe('what the canvas lays a block out as', () => {
	it('passes the height of the cell on to the block in it', async () => {
		await openWith(
			[block('grid', 'Grid', [block('row', 'GridRow', [block('card', 'Text')])])],
			{ grid: { componentName: 'DmsGrid' } },
		)
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		// A row makes its cells as tall as the tallest one, and what it stretches
		// is this wrapper, not the block: left to itself the block keeps its own
		// height and sits in a box it does not fill — which the page it stands
		// for never does.
		const classes = String(nodeAt(root, 'grid/row/card').props.class ?? '')
		expect(classes.split(' ')).toContain('grid')
	})

	it('spans the whole row for a block the grid lays across it', async () => {
		await openWith(
			[block('grid', 'Grid', [block('row', 'GridRow', [block('card', 'Text')])])],
			{ grid: { componentName: 'DmsGrid' } },
		)
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		expect(nodeAt(root, 'grid/row').props.style).toEqual({
			gridColumn: '1 / -1',
		})
	})
})

describe('the moment the drag starts', () => {
	it('leaves the page exactly as it was', async () => {
		await openWith([block('title', 'Text'), block('intro', 'Text')], {
			title: { componentName: 'DmsText' },
			intro: { componentName: 'DmsText' },
		})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()
		const before = elements(root)
		const said = textOf(root)

		builder.beginDrag({ type: 'Text' })
		await nextTick()

		// Nothing is inserted and nothing is pushed aside until the drag is
		// aimed somewhere: the page the user starts from is the page that was
		// there a moment ago.
		expect(elements(root)).toBe(before)
		expect(textOf(root)).toBe(said)
		expect(gaps(root)).toEqual([])
		expect(into(root)).toBe(null)
		// The way in stays where it is, rather than being swapped for a landing.
		expect(textOf(root)).toContain('Drop a block, or press')
	})
})

describe('aiming at a block', () => {
	beforeEach(async () => {
		await openWith([block('title', 'Text'), block('intro', 'Text')], {
			title: { componentName: 'DmsText' },
			intro: { componentName: 'DmsText' },
		})
	})

	it('opens room above it from its top half, and names the page', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'intro', 50, 20)
		await nextTick()

		expect(gaps(root)).toEqual(['before intro'])
		expect(into(root)?.path).toBe('page')
		expect(into(root)?.says).toContain('Page')
	})

	it('draws it below from the bottom half, and drops there', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'title', 50, 80)
		await nextTick()
		expect(gaps(root)).toEqual(['before intro'])

		letGo(root, 'title')
		await nextTick()
		expect(names()).toEqual(['title', 'text', 'intro'])
		expect(gaps(root), 'and the room closes with the drag').toEqual([])
	})

	it('follows the pointer without ever opening two places at once', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'title', 50, 20)
		await nextTick()
		expect(gaps(root)).toEqual(['before title'])

		aim(root, 'intro', 50, 90)
		await nextTick()
		expect(gaps(root)).toEqual(['end of page'])
	})

	it('builds a row beside it from its flank, and opens a column there', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'title', 95, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['below title'])
		expect(gapAxes(root), 'a column beside it, not a band').toEqual(['vertical'])
		expect(into(root)?.path).toBe('page')

		letGo(root, 'title')
		await nextTick()
		expect(names()).toEqual(['grid', 'intro'])
		expect(names('grid/gridRow')).toEqual(['title', 'text'])
	})

	it('answers for the whole surface of a block, which used to refuse the drop', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		// The cursor said "no drop" over 95% of the canvas because the blocks
		// themselves took neither handler.
		const node = nodeAt(root, 'title')
		expect(typeof node.props.onDragover).toBe('function')
		expect(typeof node.props.onDrop).toBe('function')
		const event = pointerOver({ top: 0, height: 100 }, { y: 10 })
		fire(node, 'dragover', event)
		expect(event.prevented, 'the browser is told the drop is allowed').toBe(true)
	})
})

describe('aiming into a container', () => {
	beforeEach(async () => {
		await openWith([block('row', 'Section', [block('left', 'Text')])], {
			row: {
				componentName: 'DmsSection',
				children: [{ id: 'left', component: { componentName: 'DmsText' } }],
			},
		})
	})

	it('frames the container, names it, and opens the room inside it', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'row', 50)
		await nextTick()

		expect(into(root)?.path).toBe('row')
		// Named as the page shows it — an untitled section is a Section — and
		// never by the name the code gives it.
		expect(into(root)?.says).toContain('Section')
		expect(into(root)?.says).not.toContain('row')
		expect(frameOf(root, 'row')).toContain('outline-primary')
		expect(gaps(root)).toEqual(['end of row'])

		letGo(root, 'row')
		expect(names('row')).toEqual(['left', 'text'])
	})

	it('aims beside the container from its end bands instead', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'row', 50, 5)
		await nextTick()
		expect(into(root)?.path, 'the page receives, not the section').toBe('page')
		expect(gaps(root)).toEqual(['before row'])

		letGo(root, 'row')
		expect(names()).toEqual(['text', 'row'])
		expect(names('row')).toEqual(['left'])
	})

	it('lands beside the child the pointer is over, inside the container', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'row/left', 50, 20)
		await nextTick()
		expect(into(root)?.path).toBe('row')
		expect(gaps(root)).toEqual(['before row/left'])

		letGo(root, 'row/left')
		expect(names('row')).toEqual(['text', 'left'])
	})

	it('puts two blocks in it, one gesture after the other', async () => {
		const { root } = mount(Canvas, { components: globals() })
		for (const _ of [0, 1]) {
			builder.beginDrag({ type: 'Text' })
			await nextTick()
			aim(root, 'row', 50, 50)
			await nextTick()
			letGo(root, 'row')
			await nextTick()
		}
		expect(names('row')).toEqual(['left', 'text', 'text2'])
	})

	it('lands at the joint the room opened on in a row, not at its end', async () => {
		await openWith([block('row', 'HStack', [block('left', 'Text')])], {
			row: {
				componentName: 'DmsHStack',
				children: [{ id: 'left', component: { componentName: 'DmsText' } }],
			},
		})
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'row', 95, 50)
		await nextTick()
		letGo(root, 'row')
		await nextTick()

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'row', 50, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['before row/text'])

		letGo(root, 'row')
		await nextTick()
		expect(names('row')).toEqual(['left', 'text2', 'text'])
	})
})

describe('a grid written by hand, holding nothing yet', () => {
	beforeEach(async () => {
		await openWith([block('grid', 'Grid')], {
			grid: { componentName: 'DmsGrid', children: [] },
		})
	})

	it('promises the landing, and names the page rather than the grid', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid', 50)
		await nextTick()

		expect(gaps(root)).toEqual(['end of grid'])
		expect(into(root)?.path).toBe('page')
		expect(into(root)?.refused).toBe(false)
		expect(into(root)?.says).not.toContain('only takes')
	})

	it('keeps no layout around the one block it ends up holding', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid', 50)
		await nextTick()

		letGo(root, 'grid')
		// A grid of one row of one block is that block: nobody can see a row, so
		// nobody could ever remove the one left behind.
		expect(names()).toEqual(['text'])
		expect(builder.session.value.toast).toBe('Text added')
		expect(builder.session.value.selection).toBe('text')
		expect(builder.session.value.error).toBe(null)
	})
})

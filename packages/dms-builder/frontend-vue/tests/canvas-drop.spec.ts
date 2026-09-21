import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Boundary from '../app/components/Boundary.vue'
import Canvas from '../app/components/Canvas.vue'
import Children from '../app/components/Children.vue'
import Library from '../app/components/Library.vue'
import Node from '../app/components/Node.vue'
import Placeholder from '../app/components/Placeholder.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	byClass,
	fakeEvent,
	fire,
	findAll,
	mount,
	pointerOver,
	stub,
	textOf,
	walk,
	type TestNode,
} from './support/render'
import { findNode } from '../app/runtime/draft'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockNode, ComponentPreview } from '../app/runtime/types'

/**
 * The canvas, driven the way a pointer drives it.
 *
 * The gesture is aimed at the blocks that are on the page: a `dragover` inside
 * one of them, at a height these tests choose, and the canvas answers by
 * opening room for the block where it would land, inside a border around the
 * container that would receive. Every assertion below is about what the
 * mounted components render and what firing their own handlers puts in the
 * draft.
 */

let backend: FakeBackend
let builder: BuilderController

/** The Nuxt build resolves a preview's `componentName` to a real component. */
const resolvable = new Set(['DmsText', 'DmsHStack', 'DmsGrid'])
Object.assign(globalThis, {
	resolveDmsComponent: (name: string) =>
		resolvable.has(name) ? stub(name) : undefined,
})

const globals = (): Record<string, Component> => ({
	DmsBuilderNode: Node as Component,
	DmsBuilderChildren: Children as Component,
	DmsBuilderPlaceholder: Placeholder as Component,
	DmsBuilderBoundary: Boundary as Component,
})

async function openWith(
	blocks: BlockNode[],
	preview: Record<string, ComponentPreview> = {},
): Promise<void> {
	backend.structure = { ...backend.structure, blocks }
	backend.preview = { ok: true, data: { components: preview, degraded: [] }, changes: [] }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
}

function block(
	name: string,
	type: string,
	children: BlockNode[] = [],
): BlockNode {
	return {
		path: name,
		name,
		type,
		editable: true,
		config: {},
		...(children.length ? { children } : {}),
	}
}

/** The element the canvas rendered for a block, by its draft path. */
function nodeAt(root: TestNode, path: string): TestNode {
	const match = findAll(root, (node) => node.props['data-path'] === path)
	if (!match[0]) {
		throw new Error(`no block rendered at ${path}`)
	}
	return match[0]
}

/**
 * Every opening on the canvas, said the way the page reads it.
 *
 * An opening is a child of the container that would receive, so what it means
 * is read off where it sits among that container's own children: before the
 * one that follows it, at the end of the container when none does — and above
 * or below a block when the opening is the room made inside it for the column
 * a drop would build.
 */
function gaps(root: TestNode): string[] {
	return findAll(root, (node) => node.props['data-drop-gap'] !== undefined).map(
		(gap) => {
			const siblings = (gap.parent?.children ?? []).filter(
				(node) => node.kind === 'element',
			)
			const inside = gap.parent?.props['data-path']
			if (inside !== undefined) {
				return `${siblings[0] === gap ? 'above' : 'below'} ${String(inside)}`
			}
			const next = siblings
				.slice(siblings.indexOf(gap) + 1)
				.map((node) => node.props['data-path'])
				.find((path) => path !== undefined)
			return next === undefined
				? `end of ${holder(gap)}`
				: `before ${String(next)}`
		},
	)
}

/** The container an opening sits in, by its draft path; the page carries none. */
function holder(gap: TestNode): string {
	let node = gap.parent
	while (node) {
		if (node.props['data-path'] !== undefined) {
			return String(node.props['data-path'])
		}
		node = node.parent
	}
	return 'page'
}

/** The way each opening runs: a band across the flow, or a column down it. */
function gapAxes(root: TestNode): string[] {
	return findAll(root, (node) => node.props['data-drop-gap'] !== undefined).map(
		(gap) => String(gap.props['data-drop-gap']),
	)
}

/** The one opening on the canvas, to read its size and its handlers off. */
function gap(root: TestNode): TestNode {
	const match = findAll(
		root,
		(node) => node.props['data-drop-gap'] !== undefined,
	)[0]
	if (!match) {
		throw new Error('the canvas opened no room')
	}
	return match
}

/** Pick a block up, the browser reporting the box it is being taken out of. */
function lift(root: TestNode, path: string, height: number): void {
	fire(
		nodeAt(root, path),
		'dragstart',
		fakeEvent('dragstart', {
			currentTarget: { getBoundingClientRect: () => ({ height }) },
		}),
	)
}

/** The container that would really receive, whatever the canvas names. */
function receiver(): string | null | undefined {
	return builder.session.value.dropTarget?.parent
}

/** What the canvas names as the container that would receive. */
function into(root: TestNode): { path: string; says: string; refused: boolean } | null {
	const badge = findAll(
		root,
		(node) => node.props['data-drop-into'] !== undefined,
	)[0]
	if (!badge) {
		return null
	}
	return {
		path: String(badge.props['data-drop-into']),
		says: textOf(badge),
		refused: String(badge.props.class ?? '').includes('bg-error'),
	}
}

function frameOf(root: TestNode, path: string): string {
	return String(nodeAt(root, path).props.class ?? '')
}

/**
 * Aim the drag at a block, the pointer that far across and that far down its
 * box. A row reads both, so the two are given separately where it matters.
 */
function aim(root: TestNode, path: string, x: number, y = x): void {
	fire(
		nodeAt(root, path),
		'dragover',
		pointerOver({ top: 0, height: 100, left: 0, width: 100 }, { x, y }),
	)
}

function letGo(root: TestNode, path: string): void {
	fire(nodeAt(root, path), 'drop')
}

function elements(root: TestNode): number {
	return walk(root).filter((node) => node.kind === 'element').length
}

function names(path?: string): string[] {
	const draft = builder.session.value.draft
	if (!draft) {
		return []
	}
	const list = path ? findNode(draft, path)?.children : draft.blocks
	return (list ?? []).map((entry) => entry.name)
}

beforeEach(async () => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

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
		expect(textOf(root)).toContain('Add a block')
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
		expect(textOf(root)).toContain('Add a block')
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

		aim(root, 'intro', 20)
		await nextTick()

		expect(gaps(root)).toEqual(['before intro'])
		expect(into(root)?.path).toBe('page')
		expect(into(root)?.says).toContain('Page')
	})

	it('draws it below from the bottom half, and drops there', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'title', 80)
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

		aim(root, 'title', 20)
		await nextTick()
		expect(gaps(root)).toEqual(['before title'])

		aim(root, 'intro', 90)
		await nextTick()
		expect(gaps(root)).toEqual(['end of page'])
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
		await openWith([block('row', 'HStack', [block('left', 'Text')])], {
			row: {
				componentName: 'DmsHStack',
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
		expect(into(root)?.says).toContain('row')
		expect(into(root)?.says).toContain('Horizontal stack')
		expect(frameOf(root, 'row')).toContain('outline-primary')
		expect(gaps(root)).toEqual(['end of row'])

		letGo(root, 'row')
		expect(names('row')).toEqual(['left', 'text'])
	})

	it('aims beside the container from its end bands instead', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'row', 5)
		await nextTick()
		expect(into(root)?.path, 'the page receives, not the stack').toBe('page')
		expect(gaps(root)).toEqual(['before row'])

		letGo(root, 'row')
		expect(names()).toEqual(['text', 'row'])
		expect(names('row')).toEqual(['left'])
	})

	it('lands beside the child the pointer is over, inside the stack', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'row/left', 20)
		await nextTick()
		expect(into(root)?.path).toBe('row')
		expect(gaps(root)).toEqual(['before row/left'])

		letGo(root, 'row/left')
		expect(names('row')).toEqual(['text', 'left'])
	})

	it('puts two blocks in a stack, one gesture after the other', async () => {
		const { root } = mount(Canvas, { components: globals() })
		// Near its right edge each time, which is the last column of the stack.
		for (const _ of [0, 1]) {
			builder.beginDrag({ type: 'Text' })
			await nextTick()
			aim(root, 'row', 95, 50)
			await nextTick()
			letGo(root, 'row')
			await nextTick()
		}
		expect(names('row')).toEqual(['left', 'text', 'text2'])
	})

	it('lands at the joint the room opened on, not at the end of the stack', async () => {
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

describe('a Grid, which holds nothing but rows', () => {
	beforeEach(async () => {
		await openWith([block('grid', 'Grid')], {
			grid: { componentName: 'DmsGrid', children: [] },
		})
	})

	it('promises the landing rather than refusing it', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid', 50)
		await nextTick()

		expect(gaps(root)).toEqual(['end of grid'])
		expect(into(root)?.path).toBe('grid')
		expect(into(root)?.refused).toBe(false)
		expect(into(root)?.says).not.toContain('only accepts')
		expect(frameOf(root, 'grid')).toContain('outline-primary')
	})

	it('builds the row around the block, and hands the block back selected', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid', 50)
		await nextTick()

		letGo(root, 'grid')
		expect(names('grid/gridRow')).toEqual(['text'])
		// What the user dropped is what is reported and what is selected: the
		// scaffolding it needed is not the subject of the gesture.
		expect(builder.session.value.toast).toBe('Text added')
		expect(builder.session.value.selection).toBe('grid/gridRow/text')
		expect(builder.session.value.error).toBe(null)
	})

	it('takes the row itself at the same spot, without building a second one', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'GridRow' })
		await nextTick()

		aim(root, 'grid', 50)
		await nextTick()
		expect(into(root)?.refused).toBe(false)
		expect(gaps(root)).toEqual(['end of grid'])

		letGo(root, 'grid')
		expect(names('grid')).toEqual(['gridRow'])
		expect(names('grid/gridRow')).toEqual([])
	})
})

describe('the two axes of a row', () => {
	beforeEach(async () => {
		await openWith(
			[
				block('grid', 'Grid', [
					block('band', 'GridRow', [block('card', 'Text'), block('note', 'Text')]),
				]),
			],
			{
				grid: {
					componentName: 'DmsGrid',
					children: [
						{
							id: 'band',
							component: {
								componentName: 'DmsGridRow',
								children: [
									{ id: 'card', component: { componentName: 'DmsText' } },
									{ id: 'note', component: { componentName: 'DmsText' } },
								],
							},
						},
					],
				},
			},
		)
	})

	it('puts the block in its first column when its left edge is aimed at', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid/band', 5, 50)
		await nextTick()
		expect(receiver(), 'the row is what receives').toBe('grid/band')
		// The canvas names the grid: the row is the grid's own writing, and a
		// name for it would be a word the user never had to learn.
		expect(into(root)?.path).toBe('grid')
		expect(gaps(root)).toEqual(['before grid/band/card'])

		letGo(root, 'grid/band')
		expect(names('grid/band')).toEqual(['text', 'card', 'note'])
		expect(names('grid')).toEqual(['band'])
	})

	it('puts it in a last column when its right edge is aimed at', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid/band', 95, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['end of grid/band'])

		letGo(root, 'grid/band')
		expect(names('grid/band')).toEqual(['card', 'note', 'text'])
	})

	it('still takes a row above it from its top band', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'GridRow' })
		await nextTick()

		aim(root, 'grid/band', 50, 5)
		await nextTick()
		expect(into(root)?.path).toBe('grid')
		expect(gaps(root)).toEqual(['before grid/band'])

		letGo(root, 'grid/band')
		expect(names('grid')).toEqual(['gridRow', 'band'])
	})

	it('drops the block left of the card whose left half is aimed at', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid/band/note', 20, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['before grid/band/note'])

		letGo(root, 'grid/band/note')
		expect(names('grid/band')).toEqual(['card', 'text', 'note'])
	})

	// The palette offers no row, so the gesture left is a row already on the page
	// being dragged onto the flank of another.
	it('refuses a row moved against its flank, and says so instead of guessing', async () => {
		builder.addBlock('GridRow', 'grid', null)
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ path: 'grid/gridRow' })
		await nextTick()

		aim(root, 'grid/band', 5, 50)
		await nextTick()
		expect(gaps(root), 'nothing promises a landing').toEqual([])
		expect(receiver()).toBe('grid/band')
		expect(into(root)?.path).toBe('grid')
		expect(into(root)?.refused).toBe(true)
		expect(into(root)?.says).toContain('A row always spans the full width')
		expect(frameOf(root, 'grid')).toContain('outline-error')

		letGo(root, 'grid/band')
		expect(names('grid/band')).toEqual(['card', 'note'])
		expect(names('grid'), 'the row it was dragged from stays put').toEqual([
			'band',
			'gridRow',
		])
		expect(builder.session.value.toast).toBe(
			'A row always spans the full width; drop inside it for a column',
		)
	})
})

describe('the column someone reaches for beside a block in a row', () => {
	beforeEach(async () => {
		await openWith(
			[block('grid', 'Grid', [block('band', 'GridRow', [block('card', 'Text')])])],
			{
				grid: {
					componentName: 'DmsGrid',
					children: [
						{
							id: 'band',
							component: {
								componentName: 'DmsGridRow',
								children: [{ id: 'card', component: { componentName: 'DmsText' } }],
							},
						},
					],
				},
			},
		)
	})

	it('takes a Vertical stack at the card’s right edge, as the row’s second child', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'VStack' })
		await nextTick()

		aim(root, 'grid/band/card', 80, 50)
		await nextTick()
		expect(receiver(), 'the row receives, not the grid').toBe('grid/band')
		expect(into(root)?.path, 'and the grid is what is named').toBe('grid')
		expect(into(root)?.refused, 'and nothing is refused').toBe(false)
		expect(gaps(root)).toEqual(['end of grid/band'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band')).toEqual(['card', 'vStack'])
		expect(names('grid'), 'no row of its own was built').toEqual(['band'])
	})

	it('stacks several blocks in it, which is the whole point of a column', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'VStack' })
		await nextTick()
		aim(root, 'grid/band/card', 80, 50)
		await nextTick()
		letGo(root, 'grid/band/card')
		await nextTick()

		for (const _ of [0, 1]) {
			builder.beginDrag({ type: 'Text' })
			await nextTick()
			aim(root, 'grid/band/vStack', 50, 50)
			await nextTick()
			letGo(root, 'grid/band/vStack')
			await nextTick()
		}
		expect(names('grid/band/vStack')).toEqual(['text', 'text2'])
		expect(names('grid/band')).toEqual(['card', 'vStack'])
	})
})

/**
 * The four sides of one cell of a grid, aimed at with the pointer.
 *
 * Nothing below places a container: each gesture is a block dropped on a quarter
 * or a band of a block that is already there, and the editor writes whatever
 * structure that reading needs.
 */
describe('the four directions on a cell', () => {
	beforeEach(async () => {
		await openWith(
			[
				block('grid', 'Grid', [
					block('band', 'GridRow', [block('card', 'Text'), block('note', 'Text')]),
				]),
			],
			{ grid: { componentName: 'DmsGrid', children: [] } },
		)
	})

	async function dropOn(x: number, y: number): Promise<TestNode> {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid/band/card', x, y)
		await nextTick()
		return root
	}

	it('puts the block in the column before the cell, from its left quarter', async () => {
		const root = await dropOn(5, 50)
		expect(gaps(root)).toEqual(['before grid/band/card'])
		expect(gapAxes(root), 'a column down its flank').toEqual(['vertical'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band')).toEqual(['text', 'card', 'note'])
	})

	it('puts it in the column after the cell, from its right quarter', async () => {
		const root = await dropOn(95, 50)
		expect(gaps(root)).toEqual(['before grid/band/note'])
		expect(gapAxes(root)).toEqual(['vertical'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band')).toEqual(['card', 'text', 'note'])
	})

	it('puts it above the cell, from the band across its top', async () => {
		const root = await dropOn(50, 5)
		expect(gaps(root)).toEqual(['above grid/band/card'])
		expect(gapAxes(root), 'a band across it, not a column').toEqual([
			'horizontal',
		])

		letGo(root, 'grid/band/card')
		// The row keeps its two columns; the first of them now holds both blocks.
		expect(names('grid/band')).toEqual(['vStack', 'note'])
		expect(names('grid/band/vStack')).toEqual(['text', 'card'])
	})

	it('puts it below the cell, from the band across its bottom', async () => {
		const root = await dropOn(50, 95)
		expect(gaps(root)).toEqual(['below grid/band/card'])
		expect(gapAxes(root)).toEqual(['horizontal'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band/vStack')).toEqual(['card', 'text'])
	})

	it('builds no second column for a cell that already is one', async () => {
		const root = await dropOn(50, 95)
		letGo(root, 'grid/band/card')
		await nextTick()

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid/band/vStack/card', 50, 95)
		await nextTick()
		expect(gaps(root)).toEqual(['before grid/band/vStack/text'])

		letGo(root, 'grid/band/vStack/card')
		expect(names('grid/band/vStack')).toEqual(['card', 'text2', 'text'])
		expect(names('grid/band'), 'still two columns').toEqual(['vStack', 'note'])
	})

	it('opens one place and only one, whichever side is aimed at', async () => {
		const root = await dropOn(50, 5)
		expect(gaps(root)).toHaveLength(1)
		aim(root, 'grid/band/card', 5, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['before grid/band/card'])
		expect(gapAxes(root)).toEqual(['vertical'])
	})
})

describe('two blocks side by side, from an empty page', () => {
	/** The canvas surface itself, which answers for the page. */
	function surface(root: TestNode): TestNode {
		const match = byClass(root, 'overflow-auto')[0]
		if (!match) {
			throw new Error('the canvas rendered no surface')
		}
		return match
	}

	it('takes one gesture per block, and asks for no row of its own', async () => {
		await openWith([])
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		builder.beginDrag({ type: 'Grid' })
		await nextTick()
		fire(surface(root), 'dragover', pointerOver({}))
		fire(surface(root), 'drop')
		await nextTick()
		expect(names()).toEqual(['grid'])

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid', 50)
		await nextTick()
		letGo(root, 'grid')
		await nextTick()
		expect(builder.session.value.toast).toBe('Text added')

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid/gridRow/text', 90, 50)
		await nextTick()
		expect(gaps(root)).toEqual(['end of grid/gridRow'])
		letGo(root, 'grid/gridRow/text')
		await nextTick()

		// Three gestures, one per thing the user actually wanted, and the second
		// block sits beside the first rather than under it.
		expect(names('grid/gridRow')).toEqual(['text', 'text2'])
		expect(builder.session.value.toast).toBe('Text added')
		expect(builder.session.value.selection).toBe('grid/gridRow/text2')
	})
})

/**
 * The whole of it, from an empty page: a grid, then four blocks in a square.
 *
 * Every step below is one drag aimed at a pixel of the canvas, and what the
 * editor answers is read back off the rendered tree. Nothing is passed to the
 * controller by hand.
 */
describe('a two-by-two layout, built with the pointer', () => {
	function surface(root: TestNode): TestNode {
		const match = byClass(root, 'overflow-auto')[0]
		if (!match) {
			throw new Error('the canvas rendered no surface')
		}
		return match
	}

	/**
	 * What the editor is allowed to say while the user is composing a grid.
	 *
	 * The two words are the vocabulary the gesture exists to spare them: a user
	 * who reads either one on screen has been told the layout is made of parts
	 * they now have to think about.
	 */
	function saysNothingStructural(root: TestNode): void {
		// Comment nodes carry the source's own commentary, which is not on screen.
		const rendered = walk(root)
			.filter((node) => node.kind !== 'comment')
			.map((node) => node.text)
			.join(' ')
		const said = `${rendered} | ${builder.session.value.toast ?? ''}`
		expect(said, said).not.toMatch(/row|stack/i)
	}

	it('takes five drags, names no structure, and asks for no container', async () => {
		await openWith([], {})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()
		saysNothingStructural(root)

		// 1 — the grid, dropped on the empty page.
		builder.beginDrag({ type: 'Grid' })
		await nextTick()
		fire(surface(root), 'dragover', pointerOver({}))
		saysNothingStructural(root)
		fire(surface(root), 'drop')
		await nextTick()
		expect(names()).toEqual(['grid'])

		// 2 — the first block, aimed at the middle of the grid.
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid', 50, 50)
		await nextTick()
		expect(into(root)?.path).toBe('grid')
		saysNothingStructural(root)
		letGo(root, 'grid')
		await nextTick()
		expect(names('grid/gridRow')).toEqual(['text'])

		// 3 — aimed at the band below it. That block is all its row holds, so the
		// place below it is a row of its own, and the grid writes it.
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'grid/gridRow/text', 50, 95)
		await nextTick()
		expect(into(root)?.path, 'the grid is what is named').toBe('grid')
		expect(gapAxes(root), 'a band across the block, not a column').toEqual([
			'horizontal',
		])
		saysNothingStructural(root)
		letGo(root, 'grid/gridRow/text')
		await nextTick()
		expect(names('grid')).toHaveLength(2)

		// 4 and 5 — aimed at the right-hand quarter of each block.
		for (const cell of ['grid/gridRow/text', 'grid/gridRow2/text']) {
			builder.beginDrag({ type: 'Text' })
			await nextTick()
			aim(root, cell, 95, 50)
			await nextTick()
			expect(gapAxes(root), 'a column at the flank of the cell').toEqual([
				'vertical',
			])
			saysNothingStructural(root)
			letGo(root, cell)
			await nextTick()
		}

		expect(names('grid/gridRow')).toEqual(['text', 'text2'])
		expect(names('grid/gridRow2')).toEqual(['text', 'text2'])
		expect(builder.session.value.toast).toBe('Text added')
		saysNothingStructural(root)
	})
})

describe('a container the preview has not answered for yet', () => {
	it('still offers a way in, and takes a block through it', async () => {
		// The state right after a stack is added: the draft has it, the debounced
		// preview has not come back for it.
		await openWith([block('row', 'HStack')], {})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()
		expect(textOf(root)).toContain('Empty container — add a block')

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		// The way in is still there mid-drag; it used to be hidden exactly then.
		expect(textOf(root)).toContain('Empty container — add a block')

		aim(root, 'row', 50)
		await nextTick()
		expect(into(root)?.path).toBe('row')
		expect(gaps(root)).toEqual(['end of row'])

		letGo(root, 'row')
		await nextTick()
		expect(names('row')).toEqual(['text'])
		// And what it holds is rendered, rather than hidden behind a placeholder.
		expect(findAll(root, (node) => node.props['data-path'] === 'row/text'))
			.toHaveLength(1)
	})
})

/**
 * What the room actually is, once it is open.
 *
 * Everything above is about where it opens; these are about the page making
 * it — the block below it moving down by what the drop will take, the row
 * giving up a column, and the opening holding the aim rather than trading
 * places with the block it was read off.
 */
describe('the room the page makes for the block', () => {
	beforeEach(async () => {
		await openWith([block('title', 'Text'), block('intro', 'Text')], {
			title: { componentName: 'DmsText' },
			intro: { componentName: 'DmsText' },
		})
	})

	it('is as tall as the block being carried', async () => {
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		lift(root, 'intro', 120)
		await nextTick()
		aim(root, 'title', 10)
		await nextTick()

		// What the page shows mid-drag is the page the drop leaves behind: the
		// block below the opening has moved down by exactly what will fill it.
		expect(gap(root).props.style).toEqual({ height: '120px' })
	})

	it('falls back to a size of its own for a block off the palette', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'title', 10)
		await nextTick()

		// Nothing has rendered it yet, so there is no height to be as tall as —
		// and a height it still is, rather than a floor, because the room grows
		// to it from nothing and `auto` is not a height to grow to.
		expect(gap(root).props.style).toEqual({ height: '48px' })
	})

	it('grows into place instead of appearing where the last one was', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'title', 10)
		await nextTick()
		expect(String(gap(root).props.class)).toContain('dms-builder-room-down')

		// A column is as wide as the row gives it, which is not a width to grow
		// from: that one scales into place instead.
		await openWith([block('row', 'HStack', [block('left', 'Text')])], {
			row: {
				componentName: 'DmsHStack',
				children: [{ id: 'left', component: { componentName: 'DmsText' } }],
			},
		})
		const sideways = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(sideways.root, 'row/left', 20)
		await nextTick()
		expect(String(gap(sideways.root).props.class)).toContain(
			'dms-builder-room-across',
		)
	})

	it('names what is going to fill it', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'title', 10)
		await nextTick()

		expect(textOf(gap(root))).toBe('Text')
	})

	it('stands the carried block back from the page it is leaving', async () => {
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		lift(root, 'intro', 120)
		await nextTick()

		expect(frameOf(root, 'intro')).toContain('opacity-40')
		expect(frameOf(root, 'title')).not.toContain('opacity-40')
	})

	/**
	 * The opening is under the pointer the moment it appears — the block it was
	 * read off has just moved aside to make it. Letting the event fall through
	 * would have the page answer instead, the opening would close, the block
	 * would come back under the pointer, and the two would trade places for as
	 * long as the user held still.
	 */
	it('holds the aim while the pointer is over it', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'title', 10)
		await nextTick()

		const event = fire(gap(root), 'dragover', pointerOver({}))
		await nextTick()

		expect(event.stopped, 'the page is not asked').toBe(true)
		expect(event.prevented, 'and the drop stays allowed').toBe(true)
		expect(gaps(root)).toEqual(['before title'])
	})

	it('takes the drop itself, the pointer never having to leave it', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'title', 10)
		await nextTick()

		fire(gap(root), 'drop')
		await nextTick()
		expect(names()).toEqual(['text', 'title', 'intro'])
	})
})

/**
 * The space the page draws between its own blocks, crossed mid-drag.
 *
 * It is a gap, not a place on offer, and it is wide enough to be crossed
 * every time the pointer travels from one block to the next.
 */
describe('the seams between the blocks on a page', () => {
	beforeEach(async () => {
		await openWith([block('title', 'Text'), block('intro', 'Text')], {
			title: { componentName: 'DmsText' },
			intro: { componentName: 'DmsText' },
		})
	})

	/** The column the page lays its blocks out in, seams and all. */
	function column(root: TestNode): TestNode {
		const match = byClass(root, 'gap-6')[0]
		if (!match) {
			throw new Error('the canvas laid out no column')
		}
		return match
	}

	/** The way in at the end of the page. */
	function wayIn(root: TestNode): TestNode {
		const match = findAll(
			root,
			(node) => node.props['data-way-in'] === 'page',
		)[0]
		if (!match) {
			throw new Error('the page offers no way in')
		}
		return match
	}

	it('leaves the aim where it is rather than answering for itself', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'title', 10)
		await nextTick()
		expect(gaps(root)).toEqual(['before title'])

		// Answered by the surface below, every seam took the aim off the block
		// the user was reaching for and threw it to the end of the page, then
		// back the moment the next block was reached: the blink, not a move.
		const event = fire(column(root), 'dragover', pointerOver({}))
		await nextTick()
		expect(event.stopped, 'the page is not asked').toBe(true)
		expect(gaps(root)).toEqual(['before title'])
	})

	it('still answers with the effect the gesture carries', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		const event = fire(column(root), 'dragover', pointerOver({}))
		expect(
			(event.dataTransfer as unknown as { dropEffect?: string }).dropEffect,
		).toBe('copy')
	})

	it('gives the end of the page to the way in that says so', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'title', 10)
		await nextTick()

		fire(wayIn(root), 'dragover', pointerOver({}))
		await nextTick()
		expect(gaps(root)).toEqual(['end of page'])

		fire(wayIn(root), 'drop')
		await nextTick()
		expect(names()).toEqual(['title', 'intro', 'text'])
	})
})

describe('the column a row gives up for the block', () => {
	/** What the row was told to divide its width by. */
	function columns(root: TestNode): unknown {
		return findAll(root, (node) => node.tag === 'DmsHStack')[0]?.props[
			'child-count'
		]
	}

	it('counts the opening among what it has to lay out', async () => {
		await openWith([block('row', 'HStack', [block('left', 'Text')])], {
			row: {
				componentName: 'DmsHStack',
				children: [{ id: 'left', component: { componentName: 'DmsText' } }],
			},
		})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()
		expect(columns(root), 'the one block it holds').toBe(1)

		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'row', 50)
		await nextTick()

		// Left at one, the row divides its width among the blocks it already
		// holds and the opening lands on top of them: no width is given up, and
		// the page shows a drop that will not look like that.
		expect(columns(root)).toBe(2)
	})
})

/**
 * A tab set, whose regions are the only place a child of it renders.
 *
 * A region holding nothing renders no block for a pointer to be read against,
 * so the only box under it was the tab set's own — and an empty tab sits at
 * the bottom of that box, which is where the band that aims below it is. The
 * way in the region offers is the surface that means the region.
 */
describe('an empty tab, which is a region and not a block', () => {
	function tabs(): BlockNode {
		return {
			path: 'tabs',
			name: 'tabs',
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
					path: 'tabs/text',
					name: 'text',
					type: 'Text',
					editable: true,
					slot: 'sends',
					config: {},
				},
			],
		}
	}

	beforeEach(async () => {
		await openWith([tabs()], {
			tabs: {
				componentName: 'DmsTab',
				children: [{ id: 'text', component: { componentName: 'DmsText' } }],
			},
		})
	})

	/** The way in a region offers when it holds nothing. */
	function wayIn(root: TestNode, region: string): TestNode {
		const list = findAll(
			root,
			(node) => node.props['data-way-in'] === region,
		)[0]
		if (!list) {
			throw new Error(`no way into ${region}`)
		}
		return list
	}

	it('offers a way in of its own, which the tab that holds something does not', async () => {
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		expect(() => wayIn(root, 'orders')).not.toThrow()
		expect(() => wayIn(root, 'sends')).toThrow(/no way into/)
	})

	it('takes the aim for itself rather than leaving it to the tab set', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		// Aimed at the bottom of the tab set, which is where the empty tab is,
		// the box alone says below the whole set.
		aim(root, 'tabs', 50, 95)
		await nextTick()
		expect(receiver(), 'the page, not the tab set').toBe(null)

		fire(wayIn(root, 'orders'), 'dragover', pointerOver({}))
		await nextTick()
		expect(receiver()).toBe('tabs')
	})

	it('lands the block in that tab, not in the one already filled', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		fire(wayIn(root, 'orders'), 'dragover', pointerOver({}))
		await nextTick()
		// The way in and the room are the same surface saying the other of the
		// two things it can say, so the room is what the drop lands on.
		expect(() => wayIn(root, 'orders')).toThrow(/no way into/)
		expect(gaps(root)).toEqual(['end of tabs'])

		fire(gap(root), 'drop')
		await nextTick()

		const held = findNode(builder.session.value.draft!, 'tabs')?.children ?? []
		expect(held.map((child) => `${child.name}:${String(child.slot)}`)).toEqual([
			'text:sends',
			'text2:orders',
		])
	})
})

describe('the palette', () => {
	function paletteButton(root: TestNode, label: string): TestNode {
		const match = findAll(
			root,
			(node) => node.tag === 'button' && textOf(node).startsWith(label),
		)
		if (!match[0]) {
			throw new Error(`no palette button labelled ${label}`)
		}
		return match[0]
	}

	/**
	 * A container naming two allowed children, which the catalog carries none of
	 * today. The greying needs a container that turns a component down and has no
	 * child of its own to build around it: one allowed child and the palette
	 * would not be offering that child at all.
	 */
	function withPanel(): void {
		backend.catalog = {
			...backend.catalog,
			blocks: [
				...backend.catalog.blocks,
				{
					type: 'Panel',
					componentName: 'DmsPanel',
					label: 'Panel',
					group: 'layout',
					container: true,
					allowedChildren: ['Text', 'VStack'],
					config: {},
					shapeSource: 'test',
				},
			],
		}
	}

	it('says what each component is, under its name', async () => {
		await openWith([block('title', 'Text')])
		const { root } = mount(Library)
		await nextTick()

		expect(textOf(paletteButton(root, 'Text'))).toContain(
			'A paragraph, a heading, or a line of prose.',
		)
	})

	it('appends to the page on click, as its own note says', async () => {
		await openWith([block('title', 'Text')])
		const { root } = mount(Library)
		await nextTick()
		expect(textOf(root)).toContain('click to append it to the page')

		fire(paletteButton(root, 'Text'), 'click')
		expect(names()).toEqual(['title', 'text'])
	})

	it('appends into the selected container, and says which one', async () => {
		await openWith([block('row', 'HStack')])
		builder.select('row')
		const { root } = mount(Library)
		await nextTick()
		expect(textOf(root)).toContain('click to append it inside row')

		fire(paletteButton(root, 'Text'), 'click')
		expect(names('row')).toEqual(['text'])
	})

	it('climbs to the container when a block inside one is selected', async () => {
		await openWith([block('row', 'HStack', [block('left', 'Text')])])
		// The user clicked the block inside the stack, then the palette.
		builder.select('row/left')
		const { root } = mount(Library)
		await nextTick()

		fire(paletteButton(root, 'Text'), 'click')
		expect(names('row'), 'the sibling arrives beside it').toEqual([
			'left',
			'text',
		])
		expect(names()).toEqual(['row'])
	})

	it('takes a block into the selected Grid rather than greying it out', async () => {
		await openWith([block('grid', 'Grid')])
		builder.select('grid')
		const { root } = mount(Library)
		await nextTick()

		const text = paletteButton(root, 'Text')
		expect(text.props['aria-disabled']).toBe(false)
		expect(String(text.props.class)).not.toContain('opacity-50')

		fire(text, 'click')
		expect(names('grid/gridRow')).toEqual(['text'])
	})

	/**
	 * A row is the one child a Grid accepts, and the Grid writes it: it is
	 * structure, not a component, and a user reading the palette took it for a
	 * grid cell three times over before it came out of here.
	 */
	it('offers no row, the grid writing the one it needs', async () => {
		await openWith([block('grid', 'Grid')])
		const { root } = mount(Library)
		await nextTick()

		expect(textOf(root)).not.toContain('Grid row')
		expect(() => paletteButton(root, 'Grid row')).toThrow(/no palette button/)
	})

	it('offers everything else the catalog carries, the Grid included', async () => {
		await openWith([block('grid', 'Grid')])
		const { root } = mount(Library)
		await nextTick()

		for (const label of [
			'Grid',
			'Horizontal stack',
			'Vertical stack',
			'Tabs',
			'Text',
			'Table',
		]) {
			expect(paletteButton(root, label).props.draggable, label).toBe('true')
		}
	})

	it('greys out what the selected container cannot lay out, and says why', async () => {
		withPanel()
		await openWith([block('panel', 'Panel')])
		builder.select('panel')
		const { root } = mount(Library)
		await nextTick()

		const grid = paletteButton(root, 'Grid')
		expect(grid.props['aria-disabled']).toBe(true)
		expect(grid.props.title).toBe('Panel only accepts Text, VStack')
		expect(String(grid.props.class)).toContain('opacity-50')
		expect(paletteButton(root, 'Text').props['aria-disabled']).toBe(false)

		// Clicking it adds nothing, and the refusal is what comes back.
		fire(grid, 'click')
		expect(names('panel')).toEqual([])
		expect(builder.session.value.toast).toBe('Panel only accepts Text, VStack')
	})

	it('stays draggable while greyed out: elsewhere the block is welcome', async () => {
		withPanel()
		await openWith([block('panel', 'Panel'), block('title', 'Text')], {
			title: { componentName: 'DmsText' },
		})
		builder.select('panel')
		const palette = mount(Library)
		const canvas = mount(Canvas, { components: globals() })
		await nextTick()

		fire(paletteButton(palette.root, 'Grid'), 'dragstart')
		await nextTick()
		expect(builder.session.value.dragging).toEqual({ type: 'Grid' })

		aim(canvas.root, 'title', 90)
		await nextTick()
		letGo(canvas.root, 'title')
		expect(names()).toEqual(['panel', 'title', 'grid'])
	})

	it('offers no target until the pointer is over the page', async () => {
		await openWith([block('title', 'Text')], {
			title: { componentName: 'DmsText' },
		})
		const palette = mount(Library)
		const canvas = mount(Canvas, { components: globals() })
		await nextTick()

		fire(paletteButton(palette.root, 'Text'), 'dragstart')
		await nextTick()
		expect(gaps(canvas.root), 'nothing to aim at yet').toEqual([])
		expect(into(canvas.root)).toBe(null)
	})
})

describe('a block already on the page', () => {
	it('drags itself and lands where the room opened', async () => {
		await openWith([block('title', 'Text'), block('intro', 'Text')], {
			title: { componentName: 'DmsText' },
			intro: { componentName: 'DmsText' },
		})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		fire(nodeAt(root, 'intro'), 'dragstart')
		expect(builder.session.value.dragging).toEqual({ path: 'intro' })

		await nextTick()
		aim(root, 'title', 10)
		await nextTick()
		expect(gaps(root)).toEqual(['before title'])

		letGo(root, 'title')
		expect(names()).toEqual(['intro', 'title'])
	})

	it('refuses to be dropped inside itself', async () => {
		await openWith([block('row', 'HStack', [block('left', 'Text')])], {
			row: {
				componentName: 'DmsHStack',
				children: [{ id: 'left', component: { componentName: 'DmsText' } }],
			},
		})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		fire(nodeAt(root, 'row'), 'dragstart')
		await nextTick()
		aim(root, 'row', 50)
		await nextTick()

		expect(gaps(root)).toEqual([])
		expect(into(root)?.refused).toBe(true)
		expect(into(root)?.says).toContain('A block cannot go inside itself')

		letGo(root, 'row')
		expect(names()).toEqual(['row'])
		expect(names('row')).toEqual(['left'])
	})
})

describe('what the canvas shows when there is nothing to show', () => {
	it('renders one unexplained placeholder per block the preview cannot build', async () => {
		await openWith([
			block('a', 'Text'),
			block('b', 'Text'),
			block('c', 'TableView'),
		])
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		const placeholders = findAll(root, (node) => {
			const classes = String(node.props.class ?? '')
			return classes.includes('border-dashed') && classes.includes('p-6')
		})
		expect(placeholders).toHaveLength(3)
		expect(textOf(placeholders[0]!)).toBe(
			'TextRenders once saved — this block needs the running page',
		)
		// Only the block that is missing a required option says what to do; the
		// other two are dashed boxes with nothing the user can act on. It is named
		// the way the panel names it, not by the key the catalog carries it under.
		expect(textOf(placeholders[2]!)).toBe('TableWaiting on Database table')
	})
})

describe('the canvas after undo', () => {
	it('lets go of the block that is gone instead of configuring nothing', async () => {
		await openWith([block('title', 'Text')], { title: { componentName: 'DmsText' } })
		builder.addBlock('Text')
		expect(builder.session.value.selection).toBe('text')

		builder.undo()
		await nextTick()
		expect(builder.session.value.selection).toBe(null)
		expect(builder.selected.value).toBe(undefined)
		expect(builder.session.value.view).toBe('library')
	})
})

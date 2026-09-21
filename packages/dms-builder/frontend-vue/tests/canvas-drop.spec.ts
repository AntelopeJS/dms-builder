import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Boundary from '../app/components/Boundary.vue'
import Canvas from '../app/components/Canvas.vue'
import Children from '../app/components/Children.vue'
import Insertion from '../app/components/Insertion.vue'
import Library from '../app/components/Library.vue'
import Node from '../app/components/Node.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	byClass,
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
 * one of them, at a height these tests choose, and the canvas answers with one
 * insertion line and a border around the container that would receive. Every
 * assertion below is about what the mounted components render and what firing
 * their own handlers puts in the draft.
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
	DmsBuilderInsertion: Insertion as Component,
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

/** The block an insertion line is drawn against. */
function anchorOf(line: TestNode): string {
	let owner = line.parent
	while (owner && owner.props['data-path'] === undefined) {
		owner = owner.parent
	}
	return String(owner?.props['data-path'] ?? 'page')
}

/** Every insertion line on the canvas, as `<block>:<edge>`. */
function lines(root: TestNode): string[] {
	return findAll(
		root,
		(node) => node.props['data-drop-line'] !== undefined,
	).map((line) => `${anchorOf(line)}:${String(line.props['data-drop-line'])}`)
}

/** The way each of those lines runs: across a block, or down its flank. */
function lineAxes(root: TestNode): string[] {
	return findAll(
		root,
		(node) => node.props['data-drop-axis'] !== undefined,
	).map((line) => String(line.props['data-drop-axis']))
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
	it('shows the page and nothing else: no target, no line, no frame', async () => {
		await openWith([block('title', 'Text'), block('intro', 'Text')], {
			title: { componentName: 'DmsText' },
			intro: { componentName: 'DmsText' },
		})
		const { root } = mount(Canvas, { components: globals() })
		await nextTick()

		expect(lines(root)).toEqual([])
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

		// Nothing is inserted and nothing is pushed aside: the page the user is
		// aiming at is the page that was there a moment ago.
		expect(elements(root)).toBe(before)
		expect(textOf(root)).toBe(said)
		expect(lines(root)).toEqual([])
		expect(into(root)).toBe(null)
		// The way in stays where it is, rather than being swapped for a drop bar.
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

	it('draws one line above it from its top half, and names the page', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'intro', 20)
		await nextTick()

		expect(lines(root)).toEqual(['intro:before'])
		expect(into(root)?.path).toBe('page')
		expect(into(root)?.says).toContain('Page')
	})

	it('draws it below from the bottom half, and drops there', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'title', 80)
		await nextTick()
		expect(lines(root)).toEqual(['title:after'])

		letGo(root, 'title')
		await nextTick()
		expect(names()).toEqual(['title', 'text', 'intro'])
		expect(lines(root), 'and the line is gone with the drag').toEqual([])
	})

	it('follows the pointer without ever drawing two lines at once', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'title', 20)
		await nextTick()
		expect(lines(root)).toEqual(['title:before'])

		aim(root, 'intro', 90)
		await nextTick()
		expect(lines(root)).toEqual(['intro:after'])
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

	it('frames the container, names it, and draws the line inside it', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'row', 50)
		await nextTick()

		expect(into(root)?.path).toBe('row')
		expect(into(root)?.says).toContain('row')
		expect(into(root)?.says).toContain('Horizontal stack')
		expect(frameOf(root, 'row')).toContain('outline-primary')
		expect(lines(root)).toEqual(['row/left:after'])

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
		expect(lines(root)).toEqual(['row:before'])

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
		expect(lines(root)).toEqual(['row/left:before'])

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

	it('lands at the joint the line was drawn on, not at the end of the stack', async () => {
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
		expect(lines(root)).toEqual(['row/left:after'])

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

		expect(lines(root)).toEqual(['grid:inside'])
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
		expect(lines(root)).toEqual(['grid:inside'])

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
		expect(lines(root)).toEqual(['grid/band/card:before'])

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
		expect(lines(root)).toEqual(['grid/band/note:after'])

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
		expect(lines(root)).toEqual(['grid/band:before'])

		letGo(root, 'grid/band')
		expect(names('grid')).toEqual(['gridRow', 'band'])
	})

	it('drops the block left of the card whose left half is aimed at', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()

		aim(root, 'grid/band/note', 20, 50)
		await nextTick()
		expect(lines(root)).toEqual(['grid/band/note:before'])

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
		expect(lines(root), 'nothing promises a landing').toEqual([])
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
		expect(lines(root)).toEqual(['grid/band/card:after'])

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
		expect(lines(root)).toEqual(['grid/band/card:before'])
		expect(lineAxes(root), 'a bar down its flank').toEqual(['vertical'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band')).toEqual(['text', 'card', 'note'])
	})

	it('puts it in the column after the cell, from its right quarter', async () => {
		const root = await dropOn(95, 50)
		expect(lines(root)).toEqual(['grid/band/card:after'])
		expect(lineAxes(root)).toEqual(['vertical'])

		letGo(root, 'grid/band/card')
		expect(names('grid/band')).toEqual(['card', 'text', 'note'])
	})

	it('puts it above the cell, from the band across its top', async () => {
		const root = await dropOn(50, 5)
		expect(lines(root)).toEqual(['grid/band/card:before'])
		expect(lineAxes(root), 'a rule across it, not a bar').toEqual(['horizontal'])

		letGo(root, 'grid/band/card')
		// The row keeps its two columns; the first of them now holds both blocks.
		expect(names('grid/band')).toEqual(['vStack', 'note'])
		expect(names('grid/band/vStack')).toEqual(['text', 'card'])
	})

	it('puts it below the cell, from the band across its bottom', async () => {
		const root = await dropOn(50, 95)
		expect(lines(root)).toEqual(['grid/band/card:after'])
		expect(lineAxes(root)).toEqual(['horizontal'])

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
		expect(lines(root)).toEqual(['grid/band/vStack/card:after'])

		letGo(root, 'grid/band/vStack/card')
		expect(names('grid/band/vStack')).toEqual(['card', 'text2', 'text'])
		expect(names('grid/band'), 'still two columns').toEqual(['vStack', 'note'])
	})

	it('draws one line and only one, whichever side is aimed at', async () => {
		const root = await dropOn(50, 5)
		expect(lines(root)).toHaveLength(1)
		aim(root, 'grid/band/card', 5, 50)
		await nextTick()
		expect(lines(root)).toEqual(['grid/band/card:before'])
		expect(lineAxes(root)).toEqual(['vertical'])
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
		expect(lines(root)).toEqual(['grid/gridRow/text:after'])
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
		expect(lineAxes(root), 'a rule across the block, not a bar').toEqual([
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
			expect(lineAxes(root), 'a bar down the flank of the cell').toEqual([
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
		expect(lines(root)).toEqual(['row:inside'])

		letGo(root, 'row')
		await nextTick()
		expect(names('row')).toEqual(['text'])
		// And what it holds is rendered, rather than hidden behind a placeholder.
		expect(findAll(root, (node) => node.props['data-path'] === 'row/text'))
			.toHaveLength(1)
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
		expect(lines(canvas.root), 'nothing to aim at yet').toEqual([])
		expect(into(canvas.root)).toBe(null)
	})
})

describe('a block already on the page', () => {
	it('drags itself and lands where the line was', async () => {
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
		expect(lines(root)).toEqual(['title:before'])

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

		expect(lines(root)).toEqual([])
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

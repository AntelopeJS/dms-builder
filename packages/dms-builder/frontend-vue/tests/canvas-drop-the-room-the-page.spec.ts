import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Canvas from '../app/components/Canvas.vue'
import {
	byClass,
	fire,
	findAll,
	mount,
	pointerOver,
	textOf,
	type TestNode,
} from './support/render'
import { findNode } from '../app/runtime/draft'
import type { BlockNode } from '../app/runtime/types'
import {
	builder,
	globals,
	openWith,
	block,
	gaps,
	gap,
	lift,
	receiver,
	frameOf,
	aim,
	names,
} from './support/canvas-drop-harness'

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
		aim(root, 'title', 50, 10)
		await nextTick()

		// What the page shows mid-drag is the page the drop leaves behind: the
		// block below the opening has moved down by exactly what will fill it.
		expect(gap(root).props.style).toEqual({ height: '120px' })
	})

	it('falls back to a size of its own for a block off the palette', async () => {
		const { root } = mount(Canvas, { components: globals() })
		builder.beginDrag({ type: 'Text' })
		await nextTick()
		aim(root, 'title', 50, 10)
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
		aim(root, 'title', 50, 10)
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
		aim(root, 'title', 50, 10)
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
		aim(root, 'title', 50, 10)
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
		aim(root, 'title', 50, 10)
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
		aim(root, 'title', 50, 10)
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
		aim(root, 'title', 50, 10)
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

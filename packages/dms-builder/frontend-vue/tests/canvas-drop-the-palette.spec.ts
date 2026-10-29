import { describe, expect, it } from 'vitest'
import { nextTick, type Component } from 'vue'
import Canvas from '../app/components/Canvas.vue'
import Library from '../app/components/Library.vue'
import LeftRail from '../app/components/LeftRail.vue'
import { fire, findAll, mount, textOf, type TestNode } from './support/render'
import { usePaletteView } from '../app/runtime/palette-view'
import {
	backend,
	builder,
	globals,
	openWith,
	block,
	nodeAt,
	gaps,
	into,
	aim,
	letGo,
	names,
} from './support/canvas-drop-harness'

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
					allowedChildren: ['Text', 'Section'],
					config: {},
					shapeSource: 'test',
				},
			],
		}
	}

	/** The rail around the palette, whose footing says where a click adds. */
	function mountRail(): TestNode {
		return mount(LeftRail, {
			components: { DmsBuilderLibrary: Library as Component },
		}).root
	}

	it('lays the components out as tiles, what each is for behind its question mark', async () => {
		await openWith([block('title', 'Text')])
		const { root } = mount(Library)
		await nextTick()

		const description = 'A paragraph, a heading, or a line of prose.'
		expect(textOf(paletteButton(root, 'Text'))).toBe('Text')
		const about = findAll(
			root,
			(node) => node.props['aria-label'] === `About Text: ${description}`,
		)[0]!
		expect(textOf(about)).toBe('?')
		const tooltip = findAll(root, (node) => node.tag === 'UTooltip').find((node) =>
			findAll(node, (child) => child === about).length > 0,
		)
		expect(tooltip?.props.text).toBe(description)
		// Its own button: asking what a block is does not add it.
		expect(about.props.onClick).toBeUndefined()
	})

	it('lays them out as lines on request, saying what each is for under its name', async () => {
		await openWith([block('title', 'Text')])
		const { root } = mount(Library)
		await nextTick()
		const toList = findAll(root, (node) => node.props['aria-label'] === 'Show as a list')[0]!
		fire(toList, 'click')
		await nextTick()

		try {
			const text = paletteButton(root, 'Text')
			const lines = findAll(text, (node) => node.tag === 'b' || node.tag === 'span')
				.map(textOf)
				.filter(Boolean)
			expect(lines).toContain('Text')
			expect(lines).toContain('A paragraph, a heading, or a line of prose.')
			expect(usePaletteView().layout.value).toBe('list')
		} finally {
			usePaletteView().setLayout('grid')
		}
	})

	it('appends to the page on click, as the heading over it says', async () => {
		await openWith([block('title', 'Text')])
		const root = mountRail()
		await nextTick()
		expect(textOf(root)).toContain('click to add to the page')

		fire(paletteButton(root, 'Text'), 'click')
		expect(names()).toEqual(['title', 'text'])
	})

	it('appends into the selected container, and says which one', async () => {
		await openWith([block('row', 'Section')])
		builder.select('row', 'library')
		const root = mountRail()
		await nextTick()
		expect(textOf(root)).toContain('click to add inside row')

		fire(paletteButton(root, 'Text'), 'click')
		expect(names('row')).toEqual(['text'])
	})

	it('climbs to the container when a block inside one is selected', async () => {
		await openWith([block('row', 'Section', [block('left', 'Text')])])
		// The user clicked the block inside the section, then the palette.
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

	it('takes a block into a grid written by hand rather than greying it out', async () => {
		await openWith([block('grid', 'Grid', [block('band', 'GridRow', [block('card', 'Text'), block('note', 'Text')])])])
		builder.select('grid')
		const { root } = mount(Library)
		await nextTick()

		const text = paletteButton(root, 'Text')
		expect(text.props['aria-disabled']).toBe(false)
		expect(String(text.props.class)).not.toContain('opacity-55')

		fire(text, 'click')
		// On a row of its own, under the row the grid already held.
		expect(names()).toEqual(['grid', 'text'])
		expect(names('grid')).toEqual(['band'])
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

	it('offers every component, and none of the layout the editor writes', async () => {
		await openWith([block('grid', 'Grid')])
		const { root } = mount(Library)
		await nextTick()

		for (const label of ['Section', 'Tabs', 'Text', 'Table']) {
			expect(paletteButton(root, label).props.draggable, label).toBe('true')
		}
		for (const label of ['Grid', 'Horizontal stack', 'Vertical stack']) {
			expect(() => paletteButton(root, label), label).toThrow(/no palette button/)
		}
	})

	it('greys out what the selected container cannot lay out, and says why', async () => {
		withPanel()
		await openWith([block('panel', 'Panel')])
		builder.select('panel')
		const { root } = mount(Library)
		await nextTick()

		const tabs = paletteButton(root, 'Tabs')
		expect(tabs.props['aria-disabled']).toBe(true)
		expect(tabs.props.title).toBe('Panel only takes Text, Section')
		expect(String(tabs.props.class)).toContain('opacity-55')
		expect(paletteButton(root, 'Text').props['aria-disabled']).toBe(false)

		// Clicking it adds nothing, and the refusal is what comes back.
		fire(tabs, 'click')
		expect(names('panel')).toEqual([])
		expect(builder.session.value.toast).toBe('Panel only takes Text, Section')
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

		fire(paletteButton(palette.root, 'Tabs'), 'dragstart')
		await nextTick()
		expect(builder.session.value.dragging).toEqual({ type: 'Tab' })

		aim(canvas.root, 'title', 50, 90)
		await nextTick()
		letGo(canvas.root, 'title')
		expect(names()).toEqual(['panel', 'title', 'tab'])
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
		aim(root, 'title', 50, 10)
		await nextTick()
		expect(gaps(root)).toEqual(['before title'])

		letGo(root, 'title')
		expect(names()).toEqual(['intro', 'title'])
	})

	it('refuses to be dropped inside itself', async () => {
		await openWith([block('row', 'Section', [block('left', 'Text')])], {
			row: {
				componentName: 'DmsSection',
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
		expect(
			findAll(placeholders[2]!, (node) => node.props.label === 'Fill it in'),
			'and leads to what it waits on',
		).toHaveLength(1)
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
	})
})

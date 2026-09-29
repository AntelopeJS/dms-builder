import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Boundary from '../app/components/Boundary.vue'
import Canvas from '../app/components/Canvas.vue'
import Children from '../app/components/Children.vue'
import Node from '../app/components/Node.vue'
import Placeholder from '../app/components/Placeholder.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { findAll, mount, stub, type TestNode } from './support/render'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockNode, ComponentPreview } from '../app/runtime/types'

/**
 * What a block holds through its own settings, on the canvas: the chart a card
 * draws with lives in the card's `chart` setting, not among its children, and
 * the DMS serves it as the card's child of that name. The page renders it inside
 * the card; so must the canvas, or a card shows its figure over nothing.
 */

let backend: FakeBackend
let builder: BuilderController

const resolvable = new Set(['DmsChartCard', 'DmsChart', 'DmsSection', 'DmsText'])
Object.assign(globalThis, {
	resolveDmsComponent: (name: string) => (resolvable.has(name) ? stub(name) : undefined),
})

const globals = (): Record<string, Component> => ({
	DmsBuilderNode: Node as Component,
	DmsBuilderChildren: Children as Component,
	DmsBuilderPlaceholder: Placeholder as Component,
	DmsBuilderBoundary: Boundary as Component,
	DmsRecursiveComponent: stub('DmsRecursiveComponent'),
})

async function canvas(
	blocks: BlockNode[],
	preview: Record<string, ComponentPreview>,
): Promise<TestNode> {
	backend.structure = { ...backend.structure, blocks }
	backend.preview = { ok: true, data: { components: preview, degraded: [] }, changes: [] }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	const { root } = mount(Canvas, { components: globals() })
	await nextTick()
	return root
}

/** What the canvas renders the way the page does, inside the block at `path`. */
function heldIn(root: TestNode, path: string): TestNode[] {
	const block = findAll(root, (node) => node.props['data-path'] === path)[0]
	if (!block) {
		throw new Error(`no block rendered at ${path}`)
	}
	return findAll(block, (node) => node.tag === 'DmsRecursiveComponent')
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

describe('what a block holds through its settings', () => {
	it("draws a card's chart inside the card, as the page serves it", async () => {
		const root = await canvas(
			[
				{
					path: 'sales',
					name: 'sales',
					type: 'ChartCard',
					editable: true,
					config: { title: 'Sales', chart: { $block: { type: 'ChartLine', config: {} } } },
				},
			],
			{
				sales: {
					componentName: 'DmsChartCard',
					options: { title: 'Sales' },
					children: [
						{ id: 'chart', component: { componentName: 'DmsChart', options: { type: 'line' } } },
					],
				},
			},
		)

		const [chart] = heldIn(root, 'sales')
		expect(chart?.props.component).toMatchObject({
			id: 'chart',
			componentName: 'DmsChart',
			options: { type: 'line' },
			children: [],
		})
		expect(chart?.props['component-id']).toBe('sales-child-chart')
	})

	it('leaves out a child the draft no longer holds, until the preview catches up', async () => {
		const root = await canvas(
			[{ path: 'intro', name: 'intro', type: 'Section', editable: true, config: {} }],
			{
				intro: {
					componentName: 'DmsSection',
					children: [{ id: 'removed', component: { componentName: 'DmsText' } }],
				},
			},
		)

		expect(heldIn(root, 'intro')).toEqual([])
	})
})

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
import type { BlockNode, ComponentPreview, OptionSchema } from '../app/runtime/types'

/**
 * The page being built follows the draft as it is edited, also where the
 * preview hands the canvas no fresh render: a table the preview cannot build
 * shows the title just typed, and a card measuring a source built here shows
 * what the source measures now, not what the saved route answers.
 */

let backend: FakeBackend
let builder: BuilderController

const resolvable = new Set(['DmsTableView', 'DmsChartCard'])
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
	degraded: string[] = [],
): Promise<TestNode> {
	backend.structure = { ...backend.structure, blocks }
	backend.preview = { ok: true, data: { components: preview, degraded }, changes: [] }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	const { root } = mount(Canvas, { components: globals() })
	await nextTick()
	return root
}

function rendered(root: TestNode, tag: string): TestNode {
	const match = findAll(root, (node) => node.tag === tag)[0]
	if (!match) {
		throw new Error(`no ${tag} on the canvas`)
	}
	return match
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

describe('a table the preview cannot build', () => {
	it('shows the title typed since the page was saved, over the saved render', async () => {
		backend.layout = {
			components: {
				orders: { componentName: 'DmsTableView', options: { location: '/api/order', columns: [] } },
			},
		}
		const root = await canvas(
			[{ path: 'orders', name: 'orders', type: 'TableView', editable: true, controller: 'order', config: {} }],
			{},
			['/reports/sales#orders'],
		)
		expect(rendered(root, 'DmsTableView').props.caption).toBeUndefined()

		builder.patchConfig('orders', { caption: 'All orders' })
		await nextTick()

		const table = rendered(root, 'DmsTableView')
		expect(table.props.caption).toBe('All orders')
		expect(table.props.location, 'the rest as the page serves it').toBe('/api/order')
	})
})

describe('what people can do with a table the preview cannot build', () => {
	it('follows an action turned off, among those the DMS serves around the saved one', async () => {
		// The page turned delete off; the DMS serves every other action beside it.
		backend.layout = {
			components: {
				orders: {
					componentName: 'DmsTableView',
					options: {
						location: '/api/order',
						rowActions: { add: true, edit: true, duplicate: true, delete: false },
					},
				},
			},
		}
		const root = await canvas(
			[
				{
					path: 'orders',
					name: 'orders',
					type: 'TableView',
					editable: true,
					controller: 'order',
					config: { rowActions: { delete: false } },
				},
			],
			{},
			['/reports/sales#orders'],
		)

		builder.patchConfig('orders', { rowActions: { delete: false, add: false } })
		await nextTick()

		expect(rendered(root, 'DmsTableView').props.rowActions).toEqual({
			add: false,
			edit: true,
			duplicate: true,
			delete: false,
		})
	})
})

describe('a spacer on the canvas', () => {
	it('is sized by its wrapper, the way a stack sizes the spacer on the page', async () => {
		backend.catalog.blocks.push({
			type: 'Spacer',
			componentName: 'dms-spacer',
			label: 'Spacer',
			group: 'layout',
			container: false,
			shapeSource: 'test',
			config: {
				minSize: { type: 'string', optional: true },
				maxSize: { type: 'string', optional: true },
				grow: { type: 'number', default: 1 },
			},
		})
		const root = await canvas(
			[{ path: 'gap', name: 'gap', type: 'Spacer', editable: true, config: {} }],
			{ gap: { componentName: 'DmsSpacer', options: { grow: 0, minSize: '24px', maxSize: '24px' } } },
		)

		const wrapper = findAll(root, (node) => node.props['data-path'] === 'gap')[0]!
		expect(wrapper.props.style).toMatchObject({
			flexGrow: 0,
			minWidth: '24px',
			maxWidth: '24px',
			minHeight: '24px',
			maxHeight: '24px',
		})
		expect(String(wrapper.props.class), 'drawn, so its size shows').toContain(
			'repeating-linear-gradient',
		)
	})
})

describe('a card measuring a source built here', () => {
	const fetchUrl: OptionSchema = { type: 'string', optional: true, ui: { widget: 'dataSource' } }

	async function cardOnTheCanvas(): Promise<TestNode> {
		const card = backend.catalog.blocks.find((block) => block.type === 'ChartCard')!
		card.config = { ...card.config, fetchUrl }
		backend.structure = {
			...backend.structure,
			queries: [
				{
					name: 'sales',
					endpoint: '/reports/sales/stats/sales',
					resource: 'order',
					template: 'series',
					params: { op: 'count', groupBy: 'status' },
					response: 'card',
				},
			],
		}
		return canvas(
			[
				{
					path: 'sales',
					name: 'sales',
					type: 'ChartCard',
					editable: true,
					config: { title: 'Sales', fetchUrl: '/reports/sales/stats/sales' },
				},
			],
			{
				sales: {
					componentName: 'DmsChartCard',
					options: { title: 'Sales', fetchUrl: '/reports/sales/stats/sales' },
				},
			},
		)
	}

	function measured(root: TestNode): Record<string, unknown> {
		const url = new URL(String(rendered(root, 'DmsChartCard').props.fetchUrl), 'http://canvas')
		expect(url.pathname).toBe('/api/builder/query-preview')
		return JSON.parse(url.searchParams.get('query') ?? '{}') as Record<string, unknown>
	}

	it('reads the source through its preview rather than the saved route', async () => {
		const root = await cardOnTheCanvas()

		expect(measured(root)).toMatchObject({
			resource: 'order',
			params: { op: 'count', groupBy: 'status' },
			response: 'card',
		})
	})

	it('reads it anew as what it measures changes', async () => {
		const root = await cardOnTheCanvas()
		builder.setDraftQuery({
			name: 'sales',
			resource: 'order',
			template: 'series',
			params: { op: 'sum', field: 'amount', groupBy: 'status' },
			response: 'card',
		})
		await nextTick()

		expect(measured(root)).toMatchObject({ params: { op: 'sum', field: 'amount' } })
	})
})

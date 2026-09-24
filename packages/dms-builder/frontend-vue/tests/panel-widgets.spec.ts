import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DataSource from '../app/components/DataSource.vue'
import Option from '../app/components/Option.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	findAll,
	fire,
	installDocumentStub,
	mount,
	textOf,
	type TestNode,
} from './support/render'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { OptionSchema, ResourceStructure } from '../app/runtime/types'

/**
 * Two settings the panel used to leave to typing: a colour, which has names a
 * theme already defines, and how many of a ranking's groups a chart keeps.
 */

let backend: FakeBackend
let builder: BuilderController

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

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

/** Fire a control's own `update:modelValue`, the way a user's input does. */
function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

async function settle(): Promise<void> {
	for (let round = 0; round < 5; round += 1) {
		await vi.advanceTimersByTimeAsync(0)
	}
	await nextTick()
}

describe('a colour option', () => {
	const schema: OptionSchema = {
		type: 'string',
		optional: true,
		ui: { label: 'Rank colour', widget: 'color' },
	}

	it("offers the theme's colours by name, and still takes any other", async () => {
		const written: unknown[] = []
		const { root } = mount(Option, {
			props: {
				name: 'rankColor',
				schema,
				modelValue: undefined,
				'onUpdate:modelValue': (value: unknown) => written.push(value),
			},
		})
		await nextTick()

		const swatches = findAll(root, (node) => node.tag === 'UButton')
		expect(swatches.map((node) => node.props.label)).toEqual([
			'primary',
			'secondary',
			'success',
			'info',
			'warning',
			'error',
			'neutral',
		])
		fire(swatches[2]!, 'click')
		write(findAll(root, (node) => node.tag === 'UInput')[0]!, '#1f7aec')

		expect(written).toEqual(['success', '#1f7aec'])
	})
})

describe('a ranking read from a table', () => {
	function orders(): ResourceStructure {
		return {
			ref: 'order',
			className: 'Order',
			tableName: 'orders',
			route: '/api/order',
			version: 'r1',
			fields: [
				{ name: 'country', dataType: { $dataType: 'string' } },
				{ name: 'amount', dataType: { $dataType: 'number' } },
			] as ResourceStructure['fields'],
		}
	}

	function draftQuery(): Record<string, unknown> | undefined {
		return builder.session.value.draft?.queries?.find(
			(query) => query.name === 'topCountries',
		)?.params as Record<string, unknown> | undefined
	}

	it('ranks the groups by what was measured and keeps the first few', async () => {
		backend.answers['GET /api/builder/resources'] = [
			{ ref: 'order', className: 'Order', tableName: 'orders', route: '/api/order', fieldCount: 2 },
		]
		backend.answers['GET /api/builder/resource'] = {
			ok: true,
			data: orders(),
			changes: [],
		}
		backend.answers['POST /api/builder/query-preview'] = {
			ok: true,
			data: { body: { series: [{ x: 'BE', y: 12 }] } },
			changes: [],
		}
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(DataSource, {
			props: {
				modelValue: undefined,
				responseShape: 'items',
				blockName: 'topCountries',
			},
		})
		await nextTick()

		const pickers = () => findAll(root, (node) => node.tag === 'USelectMenu')
		write(pickers()[0]!, 'order')
		await settle()
		write(
			pickers().find((node) => node.props.placeholder === 'Grouped by…')!,
			'country',
		)
		await settle()

		const [sortedBy, direction] = pickers().filter((node) =>
			['Sorted by group', 'Ascending'].includes(
				String(
					(node.props.items as { label: string }[] | undefined)?.[0]?.label,
				),
			),
		)
		write(sortedBy!, 'measure')
		write(direction!, 'desc')
		write(
			findAll(
				root,
				(node) => node.tag === 'UInput' && node.props.placeholder === 'all',
			)[0]!,
			'5',
		)
		await settle()

		expect(draftQuery()).toMatchObject({
			groupBy: 'country',
			orderBy: 'measure',
			direction: 'desc',
			limit: 5,
		})
	})

})

describe('an option handed a table', () => {
	// What the catalog reports for a relation's `dataApiController`.
	const schema: OptionSchema = { type: 'unknown', 'x-controller': true }

	async function mountPicker(modelValue: unknown, written: unknown[]) {
		backend.answers['GET /api/builder/resources'] = [
			{ ref: 'order', className: 'Order', tableName: 'orders', route: '/api/order', fieldCount: 2 },
			{ ref: 'customer', className: 'Customer', tableName: 'customers', route: '/api/customer', fieldCount: 3 },
		]
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		const { root } = mount(Option, {
			props: {
				name: 'dataApiController',
				schema,
				modelValue,
				'onUpdate:modelValue': (value: unknown) => written.push(value),
			},
		})
		await nextTick()
		return root
	}

	it('offers the tables to pick from, and writes a reference to the one picked', async () => {
		const written: unknown[] = []
		const root = await mountPicker(undefined, written)

		const [picker] = findAll(root, (node) => node.tag === 'USelectMenu')
		expect(
			(picker!.props.items as Array<{ value: string }>).map((item) => item.value),
		).toEqual(['order', 'customer'])
		expect(
			findAll(root, (node) => node.tag === 'UTextarea'),
			'no JSON to type a class into',
		).toHaveLength(0)
		expect(
			findAll(root, (node) => node.tag === 'label').map((node) => textOf(node)),
		).toEqual(['Table *'])

		write(picker!, 'customer')
		expect(written).toEqual([{ $ref: { resource: 'customer' } }])
	})

	it('shows the table already written as the one picked', async () => {
		const root = await mountPicker({ $ref: { resource: 'order' } }, [])

		const [picker] = findAll(root, (node) => node.tag === 'USelectMenu')
		expect(picker!.props['model-value']).toBe('order')
	})
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import QueryPanel from '../app/components/QueryPanel.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	findAll,
	fire,
	installDocumentStub,
	mount,
	stub,
	textOf,
	type TestNode,
} from './support/render'
import { useBuilder, type BuilderController } from '../app/runtime/session'

/**
 * The data sources, a workspace of their own: listed with what they measure
 * and who reads them, added and removed with the rest of the draft, never
 * removed from under a block that reads one.
 */

let backend: FakeBackend
let builder: BuilderController
let unmount: (() => void) | undefined

installDocumentStub()

async function workspace(): Promise<TestNode> {
	backend.structure = {
		...backend.structure,
		blocks: [
			{
				path: 'revenue',
				name: 'revenue',
				type: 'Text',
				editable: true,
				config: { content: '/reports/sales/stats/revenue' },
			},
		],
		queries: [
			{
				name: 'revenue',
				endpoint: '/stats/revenue',
				resource: 'orders',
				template: 'count',
				params: {},
			},
			{ name: 'legacy', endpoint: '/stats/legacy', opaque: true },
		],
	}
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	builder.setWorkspace('data')
	const mounted = mount(QueryPanel, {
		components: {
			USelectMenu: stub('USelectMenu'),
			DmsEyebrow: stub('DmsEyebrow'),
		},
	})
	unmount = mounted.unmount
	await nextTick()
	return mounted.root
}

function button(root: TestNode, name: string): TestNode {
	const match = findAll(
		root,
		(node) =>
			(node.tag === 'UButton' && (node.props.label === name || node.props['aria-label'] === name)) ||
			(node.tag === 'button' && textOf(node).startsWith(name)),
	)[0]
	if (!match) {
		throw new Error(`no button ${name}`)
	}
	return match
}

function write(node: TestNode, value: unknown): void {
	;(node.props['onUpdate:modelValue'] as (value: unknown) => void)(value)
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	backend.answers['GET /api/builder/query-templates'] = [
		{ id: 'count', resourceType: 'any', title: 'Count of rows', output: 'value', params: {} },
	]
	builder = useBuilder()
	builder.close()
})

afterEach(() => {
	unmount?.()
	builder.close()
	vi.useRealTimers()
})

describe('the data sources', () => {
	it('lists each with who reads it, and the ones written in code as such', async () => {
		const root = await workspace()
		const text = textOf(root)

		expect(text).toContain('revenue')
		expect(text).toContain('1 block')
		expect(text).toContain('legacy')
		expect(text).toContain('in code')
	})

	it('will not remove one a block still reads', async () => {
		const root = await workspace()

		expect(button(root, 'Remove the source').props.disabled).toBe(true)
		expect(textOf(root)).toContain('point it elsewhere first')
	})

	it('adds a new one to the draft, saved with the page', async () => {
		const root = await workspace()

		fire(button(root, 'New data source'), 'click')
		await nextTick()
		write(findAll(root, (node) => node.tag === 'UInput')[0]!, 'orderCount')
		write(
			findAll(root, (node) => node.tag === 'USelectMenu' && node.props.placeholder === 'Pick a table…')[0]!,
			'orders',
		)
		await nextTick()
		fire(button(root, 'Add the source'), 'click')
		await nextTick()

		expect(backend.calledPaths()).not.toContain('POST /api/builder/queries')
		expect(builder.session.value.draft?.queries?.map((query) => query.name)).toEqual([
			'revenue',
			'orderCount',
		])
		expect(builder.unsaved.value.map((change) => change.title)).toEqual([
			'Added data source orderCount',
		])
	})
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Config from '../app/components/Config.vue'
import GuardSettings from '../app/components/GuardSettings.vue'
import Option from '../app/components/Option.vue'
import { findNode } from '../app/runtime/draft'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockNode, PageDraft } from '../app/runtime/types'
import { installFakeHost, withWrappers, type FakeBackend } from './support/builder-harness'
import { findAll, fire, installDocumentStub, mount, stub, textOf, type TestNode } from './support/render'

/**
 * The settings of what the editor wraps a block in, where the block is set up:
 * a control's row in its section, and a container's message for when there is
 * nothing to show.
 */

let backend: FakeBackend
let builder: BuilderController
const mounted: Array<() => void> = []

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const parts = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderGuardSettings: GuardSettings as Component,
	DmsBuilderDataSource: stub('DmsBuilderDataSource'),
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

function node(path: string, type: string, children?: BlockNode[]): BlockNode {
	return { path, name: path.split('/').at(-1) as string, type, editable: true, config: {}, children }
}

async function settle(): Promise<void> {
	for (let round = 0; round < 3; round += 1) {
		await vi.advanceTimersByTimeAsync(0)
		await nextTick()
	}
}

async function panel(selection: string): Promise<TestNode> {
	builder.select(selection)
	await settle()
	const tree = mount(Config, { components: parts() })
	mounted.push(tree.unmount)
	await settle()
	return tree.root
}

function draft(): PageDraft {
	return builder.session.value.draft as PageDraft
}

beforeEach(async () => {
	vi.useFakeTimers()
	backend = installFakeHost()
	backend.catalog = withWrappers()
	backend.structure = {
		...backend.structure,
		blocks: [
			node('settings', 'Section', [
				{ ...node('settings/seatsRow', 'FieldRow', [node('settings/seatsRow/seats', 'Meter')]) },
			]),
			node('card', 'Card', [node('card/note', 'Text')]),
			node('empty', 'Card', []),
		],
	}
	backend.structure.blocks[0]!.children![0]!.config = { label: 'Seats' }
	builder = useBuilder()
	builder.close()
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
})

afterEach(() => {
	for (const unmount of mounted.splice(0)) unmount()
	builder.close()
	vi.useRealTimers()
})

describe('a control’s row', () => {
	it('is set up with the control, its label written on the row', async () => {
		const root = await panel('settings/seatsRow/seats')
		const section = findAll(root, (entry) => entry.props['aria-label'] === 'Its row')[0]
		expect(section).toBeDefined()
		expect(textOf(section!)).toContain('Its row in the section')

		const label = findAll(section!, (entry) => entry.tag === 'UInput')[0]!
		expect(label.props['model-value']).toBe('Seats')
		fire(label, 'update:modelValue', 'Seats left' as never)
		expect(findNode(draft(), 'settings/seatsRow')?.config?.label).toBe('Seats left')
	})

	it('is not said for a block standing on its own', async () => {
		const root = await panel('card/note')
		expect(findAll(root, (entry) => entry.props['aria-label'] === 'Its row')).toHaveLength(0)
	})
})

describe('a container’s message for when there is nothing to show', () => {
	function settings(root: TestNode): TestNode {
		return findAll(root, (entry) => 'data-guard-settings' in entry.props)[0] as TestNode
	}

	function toggle(root: TestNode): TestNode {
		return findAll(settings(root), (entry) => entry.tag === 'USwitch')[0] as TestNode
	}

	it('is offered on a card, and wraps its content once turned on', async () => {
		const root = await panel('card')
		expect(toggle(root).props['model-value']).toBe(false)
		fire(toggle(root), 'update:modelValue', true as never)
		await settle()
		expect(findNode(draft(), 'card')?.children?.map((child) => child.type)).toEqual(['Guard'])
		expect(findNode(draft(), 'card/guard/note')).toBeDefined()
	})

	it('checks a count picked like any source, and says its message', async () => {
		builder.mutate((next) => {
			const card = findNode(next, 'card')
			if (card) card.children = [{ name: 'guard', type: 'Guard', config: { when: 'empty' }, children: card.children ?? [] }]
		})
		const root = await panel('card')
		const source = findAll(settings(root), (entry) => entry.tag === 'DmsBuilderDataSource')[0]!
		expect(source.props['response-shape']).toBe('value')
		fire(source, 'patch', { fetchUrl: '/reports/sales/stats/guard' } as never)
		const title = findAll(settings(root), (entry) => entry.props['aria-label'] === 'Message title')[0]!
		fire(title, 'update:modelValue', 'No sales yet' as never)

		expect(findNode(draft(), 'card/guard')?.config).toEqual({
			when: 'empty',
			fetchUrl: '/reports/sales/stats/guard',
			field: 'value',
			fallback: { title: 'No sales yet' },
		})
	})

	it('waits for something to guard', async () => {
		const root = await panel('empty')
		expect(toggle(root).props.disabled).toBe(true)
		expect(textOf(settings(root))).toContain('Add a block here first')
	})

	it('is not offered on a block that holds nothing of its own', async () => {
		const root = await panel('settings/seatsRow/seats')
		expect(findAll(root, (entry) => 'data-guard-settings' in entry.props)).toHaveLength(0)
	})
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ChangesPanel from '../app/components/ChangesPanel.vue'
import { installFakeHost } from './support/builder-harness'
import { findAll, fire, installDocumentStub, mount, stub, type TestNode } from './support/render'
import { useBuilder, type BuilderController } from '../app/runtime/session'

/**
 * The control beside each unsaved edit in the change list, which reverts that
 * edit alone.
 */

let builder: BuilderController
let unmount: (() => void) | undefined

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

function show(): TestNode {
	const view = mount(ChangesPanel, { components: { USelectMenu: stub('USelectMenu') } })
	unmount = view.unmount
	return view.root
}

function revertControls(root: TestNode): TestNode[] {
	return findAll(root, (node) => String(node.props['aria-label'] ?? '').startsWith('Revert: '))
}

beforeEach(async () => {
	vi.useFakeTimers()
	installFakeHost()
	builder = useBuilder()
	builder.close()
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
})

afterEach(() => {
	unmount?.()
	unmount = undefined
	builder.close()
	vi.useRealTimers()
})

describe('the control that reverts one edit', () => {
	it('shows on hover the label it is announced by', async () => {
		builder.addBlock('Text')
		const root = show()
		await nextTick()

		const controls = revertControls(root)
		expect(controls).toHaveLength(1)
		expect(controls[0]!.props.title).toBe(controls[0]!.props['aria-label'])
	})

	it('reverts that edit', async () => {
		builder.addBlock('Text')
		const root = show()
		await nextTick()

		fire(revertControls(root)[0]!, 'click')
		await nextTick()
		expect(builder.dirty.value).toBe(false)
	})
})

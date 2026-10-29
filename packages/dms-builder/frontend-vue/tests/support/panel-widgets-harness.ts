import { afterEach, beforeEach, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import TableChoice from '../../app/components/TableChoice.vue'
import TablePicker from '../../app/components/TablePicker.vue'
import { installFakeHost, type FakeBackend } from './builder-harness'
import {
	findAll,
	fire,
	installDocumentStub,
	textOf,
	type TestNode,
} from './render'
import { useBuilder, type BuilderController } from '../../app/runtime/session'

/**
 * Two settings the panel used to leave to typing: a colour, which has names a
 * theme already defines, and how many of a ranking's groups a chart keeps.
 */

export let backend: FakeBackend
export let builder: BuilderController

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
export function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

export async function settle(): Promise<void> {
	for (let round = 0; round < 5; round += 1) {
		await vi.advanceTimersByTimeAsync(0)
	}
	await nextTick()
}

/** The table choice a data source opens with, as the Nuxt build registers it. */
export function tableParts(): Record<string, Component> {
	return {
		DmsBuilderTableChoice: TableChoice as Component,
		DmsBuilderTablePicker: TablePicker as Component,
	}
}

/** Pick a table among those a data source offers, the way a click does. */
export function pickTable(root: TestNode, name: string): void {
	const option = findAll(
		root,
		(node) => node.props.role === 'option' && textOf(node).startsWith(name),
	)[0]
	if (!option) {
		throw new Error(`no table ${name} to pick`)
	}
	fire(option, 'click')
}

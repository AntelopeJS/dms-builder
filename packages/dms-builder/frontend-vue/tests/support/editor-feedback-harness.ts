import { beforeEach, afterEach, vi } from 'vitest'
import { type Component } from 'vue'
import FormPanel from '../../app/components/FormPanel.vue'
import FormTarget from '../../app/components/FormTarget.vue'
import Option from '../../app/components/Option.vue'
import OnThePage from '../../app/components/OnThePage.vue'
import SubmitSettings from '../../app/components/SubmitSettings.vue'
import TableChoice from '../../app/components/TableChoice.vue'
import TableLink from '../../app/components/TableLink.vue'
import TablePicker from '../../app/components/TablePicker.vue'
import { installFakeHost, type FakeBackend } from './builder-harness'
import { findAll, installDocumentStub, stub, type TestNode } from './render'
import { useBuilder, type BuilderController } from '../../app/runtime/session'
import type { BlockNode } from '../../app/runtime/types'

/**
 * What the editor tells the user about the page it is holding: the badge in the
 * bar, the actions it offers on a block, and what a block it cannot rewrite
 * says about itself.
 */

export let backend: FakeBackend
export let builder: BuilderController

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

export async function openWith(blocks: BlockNode[]): Promise<void> {
	backend.structure = { ...backend.structure, blocks }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
}

export function editable(name: string, type: string): BlockNode {
	return { path: name, name, type, editable: true, config: {} }
}

/** A block the engine read but cannot write back, and why. */
export function opaque(name: string, reason: string): BlockNode {
	return { path: name, name, type: null, editable: false, opaqueReason: reason }
}

export function badges(root: TestNode): string[] {
	return findAll(root, (node) => node.tag === 'UBadge').map((node) =>
		String(node.props.label ?? ''),
	)
}

/**
 * A refusal the editor cannot foresee: the catalog states which types a Grid
 * takes, and the client reads that rule before the drop, but what a child's
 * metadata may hold is the module's to judge.
 */
export function refuseTheRow(): void {
	backend.preview = {
		ok: false,
		error: {
			code: 'invalid_config',
			issues: [
				{
					pointer: '/blocks/0/children/0/meta/colSpan',
					message: 'colSpan must be a whole number of columns',
				},
			],
		},
	}
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

/** What the Nuxt build auto-imports around the config panel. */
export const panel = (): Record<string, Component> => ({
	DmsBuilderOption: Option as Component,
	DmsBuilderFormPanel: FormPanel as Component,
	DmsBuilderOnThePage: OnThePage as Component,
	DmsBuilderSubmitSettings: SubmitSettings as Component,
	DmsBuilderFormTarget: FormTarget as Component,
	DmsBuilderTableChoice: TableChoice as Component,
	DmsBuilderTableLink: TableLink as Component,
	DmsBuilderTablePicker: TablePicker as Component,
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	DmsBuilderDataSource: stub('DmsBuilderDataSource'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
})

/** Fire a control's own `update:modelValue`, the way a user's input does. */
export function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

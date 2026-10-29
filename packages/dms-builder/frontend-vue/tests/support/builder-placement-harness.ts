import { beforeEach, afterEach, vi } from 'vitest'
import { installFakeHost, type FakeBackend } from './builder-harness'
import { findNode } from '../../app/runtime/draft'
import { useBuilder, type BuilderController } from '../../app/runtime/session'
import type { BlockDraft } from '../../app/runtime/types'

/**
 * What placing a block actually does to the draft.
 *
 * The canvas has three ways in — the palette's click, the palette's drag, and
 * dragging a block already on the page — and all three land on the same two
 * controller calls, `addBlock` and `move`, through `dropAt`. These drive them
 * against a recorded backend, so what the draft holds afterwards is observable
 * without the running page.
 */

export let backend: FakeBackend
export let builder: BuilderController

/** The debounced preview the canvas renders from. */
export async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(200)
}

/** The target the palette's click passes: what Library.vue binds to. */
export function paletteTarget(): string | null {
	return builder.paletteTarget.value
}

export function paletteClick(type: string): void {
	builder.addBlock(type, paletteTarget(), null)
}

/** The child names at a draft path, or the root names when no path is given. */
export function names(path?: string): string[] {
	const draft = builder.session.value.draft
	if (!draft) {
		return []
	}
	const list = path ? findNode(draft, path)?.children : draft.blocks
	return (list ?? []).map((block) => block.name)
}

/** A row of text blocks, as the editor writes one: a grid holding that one row. */
export function row(...cells: string[]): BlockDraft {
	return {
		name: 'grid',
		type: 'Grid',
		config: {},
		children: [
			{
				name: 'gridRow',
				type: 'GridRow',
				config: {},
				children: cells.map((name) => ({ name, type: 'Text', config: {} })),
			},
		],
	}
}

/** The page as it is, and these blocks after it. */
export function withBlocks(...blocks: BlockDraft[]): void {
	builder.setDraft({
		blocks: [...(builder.session.value.draft?.blocks ?? []), ...blocks],
	})
}

/** The placement `dropping.ts` answers with for the flank of a block on its own. */
export function beside(path: string, index = 1) {
	return { around: path, type: 'Grid', index }
}

beforeEach(async () => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
	await builder.open('/reports/sales')
	await settle()
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

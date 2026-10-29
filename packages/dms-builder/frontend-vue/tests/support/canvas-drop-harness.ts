import { beforeEach, afterEach, it, vi } from 'vitest'
import { type Component } from 'vue'
import Boundary from '../../app/components/Boundary.vue'
import Children from '../../app/components/Children.vue'
import Node from '../../app/components/Node.vue'
import Placeholder from '../../app/components/Placeholder.vue'
import { installFakeHost, type FakeBackend } from './builder-harness'
import {
	fakeEvent,
	fire,
	findAll,
	pointerOver,
	stub,
	textOf,
	walk,
	type TestNode,
} from './render'
import { findNode } from '../../app/runtime/draft'
import { useBuilder, type BuilderController } from '../../app/runtime/session'
import type { BlockNode, ComponentPreview } from '../../app/runtime/types'

/**
 * The canvas, driven the way a pointer drives it.
 *
 * The gesture is aimed at the blocks that are on the page: a `dragover` inside
 * one of them, at a height these tests choose, and the canvas answers by
 * opening room for the block where it would land, inside a border around the
 * container that would receive. Every assertion below is about what the
 * mounted components render and what firing their own handlers puts in the
 * draft.
 */

export let backend: FakeBackend
export let builder: BuilderController

/** The Nuxt build resolves a preview's `componentName` to a real component. */
export const resolvable = new Set(['DmsText', 'DmsHStack', 'DmsGrid', 'DmsSection'])
Object.assign(globalThis, {
	resolveDmsComponent: (name: string) =>
		resolvable.has(name) ? stub(name) : undefined,
})

export const globals = (): Record<string, Component> => ({
	DmsBuilderNode: Node as Component,
	DmsBuilderChildren: Children as Component,
	DmsBuilderPlaceholder: Placeholder as Component,
	DmsBuilderBoundary: Boundary as Component,
})

export async function openWith(
	blocks: BlockNode[],
	preview: Record<string, ComponentPreview> = {},
): Promise<void> {
	backend.structure = { ...backend.structure, blocks }
	backend.preview = { ok: true, data: { components: preview, degraded: [] }, changes: [] }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
}

export function block(
	name: string,
	type: string,
	children: BlockNode[] = [],
): BlockNode {
	return {
		path: name,
		name,
		type,
		editable: true,
		config: {},
		...(children.length ? { children } : {}),
	}
}

/** The element the canvas rendered for a block, by its draft path. */
export function nodeAt(root: TestNode, path: string): TestNode {
	const match = findAll(root, (node) => node.props['data-path'] === path)
	if (!match[0]) {
		throw new Error(`no block rendered at ${path}`)
	}
	return match[0]
}

/**
 * Every opening on the canvas, said the way the page reads it.
 *
 * An opening is a child of the container that would receive, so what it means
 * is read off where it sits among that container's own children: before the
 * one that follows it, at the end of the container when none does — and above
 * or below a block when the opening is the room made inside it for the column
 * a drop would build.
 */
export function gaps(root: TestNode): string[] {
	return findAll(root, (node) => node.props['data-drop-gap'] !== undefined).map(
		(gap) => {
			const siblings = (gap.parent?.children ?? []).filter(
				(node) => node.kind === 'element',
			)
			const inside = gap.parent?.props['data-path']
			if (inside !== undefined) {
				return `${siblings[0] === gap ? 'above' : 'below'} ${String(inside)}`
			}
			const next = siblings
				.slice(siblings.indexOf(gap) + 1)
				.map((node) => node.props['data-path'])
				.find((path) => path !== undefined)
			return next === undefined
				? `end of ${holder(gap)}`
				: `before ${String(next)}`
		},
	)
}

/** The container an opening sits in, by its draft path; the page carries none. */
export function holder(gap: TestNode): string {
	let node = gap.parent
	while (node) {
		if (node.props['data-path'] !== undefined) {
			return String(node.props['data-path'])
		}
		node = node.parent
	}
	return 'page'
}

/** The way each opening runs: a band across the flow, or a column down it. */
export function gapAxes(root: TestNode): string[] {
	return findAll(root, (node) => node.props['data-drop-gap'] !== undefined).map(
		(gap) => String(gap.props['data-drop-gap']),
	)
}

/** The one opening on the canvas, to read its size and its handlers off. */
export function gap(root: TestNode): TestNode {
	const match = findAll(
		root,
		(node) => node.props['data-drop-gap'] !== undefined,
	)[0]
	if (!match) {
		throw new Error('the canvas opened no room')
	}
	return match
}

/** Pick a block up, the browser reporting the box it is being taken out of. */
export function lift(root: TestNode, path: string, height: number): void {
	fire(
		nodeAt(root, path),
		'dragstart',
		fakeEvent('dragstart', {
			currentTarget: { getBoundingClientRect: () => ({ height }) },
		}),
	)
}

/** The container that would really receive, whatever the canvas names. */
export function receiver(): string | null | undefined {
	return builder.session.value.dropTarget?.parent
}

/** What the canvas names as the container that would receive. */
export function into(root: TestNode): { path: string; says: string; refused: boolean } | null {
	const badge = findAll(
		root,
		(node) => node.props['data-drop-into'] !== undefined,
	)[0]
	if (!badge) {
		return null
	}
	return {
		path: String(badge.props['data-drop-into']),
		says: textOf(badge),
		refused: String(badge.props.class ?? '').includes('bg-error'),
	}
}

export function frameOf(root: TestNode, path: string): string {
	return String(nodeAt(root, path).props.class ?? '')
}

/**
 * Aim the drag at a block, the pointer that far across and that far down its
 * box. A row reads both, so the two are given separately where it matters.
 */
export function aim(root: TestNode, path: string, x: number, y = x): void {
	fire(
		nodeAt(root, path),
		'dragover',
		pointerOver({ top: 0, height: 100, left: 0, width: 100 }, { x, y }),
	)
}

export function letGo(root: TestNode, path: string): void {
	fire(nodeAt(root, path), 'drop')
}

export function elements(root: TestNode): number {
	return walk(root).filter((node) => node.kind === 'element').length
}

export function names(path?: string): string[] {
	const draft = builder.session.value.draft
	if (!draft) {
		return []
	}
	const list = path ? findNode(draft, path)?.children : draft.blocks
	return (list ?? []).map((entry) => entry.name)
}

beforeEach(async () => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

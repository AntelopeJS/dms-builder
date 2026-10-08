/**
 * How the editor names a block to the person building the page: by what the
 * page shows of it, and by where it sits — never by the name the generated
 * source gives it, which nobody looking at the page has ever read.
 */
import { descriptorOf, isStructural } from './catalog'
import { findNode, parentPath } from './draft'
import type { BlockCatalog, BlockDraft, PageDraft } from './types'

/** The options a block's own heading is written in, most telling first. */
const TITLE_KEYS = ['title', 'label', 'caption', 'heading'] as const

/** How much of a text block's prose stands for its name. */
const SNIPPET_LENGTH = 40

function text(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * What a block is called on the page: its own title when it has one, the start
 * of its text when it is prose, else what kind of block it is.
 */
export function blockTitle(
	block: BlockDraft,
	catalog: BlockCatalog | null,
): string {
	const config = block.config ?? {}
	for (const key of TITLE_KEYS) {
		const title = text(config[key])
		if (title) {
			return title
		}
	}
	const prose = text(config.content)
	if (prose) {
		return prose.length > SNIPPET_LENGTH
			? `${prose.slice(0, SNIPPET_LENGTH).trimEnd()}…`
			: prose
	}
	return blockKind(block, catalog)
}

/** What kind of block it is, as the palette lists it. */
export function blockKind(
	block: BlockDraft,
	catalog: BlockCatalog | null,
): string {
	if (block.preserve) {
		return 'Set up in code'
	}
	return descriptorOf(catalog, block.type)?.label ?? block.type ?? 'Block'
}

/**
 * The nearest block above this one that the author placed, skipping the rows,
 * columns and stacks the editor wrote to lay blocks out. Null is the page.
 */
export function placedParent(
	draft: PageDraft,
	path: string,
	catalog: BlockCatalog | null,
): string | null {
	let parent = parentPath(path)
	while (parent !== null) {
		const node = findNode(draft, parent)
		if (!node || !isStructural(catalog, node.type)) {
			return parent
		}
		parent = parentPath(parent)
	}
	return null
}

/**
 * Every block an author placed, top to bottom, as draft paths: the order the
 * arrow keys step through, the rows and columns the editor wrote left out.
 */
export function placedPaths(
	draft: PageDraft,
	catalog: BlockCatalog | null,
): string[] {
	const paths: string[] = []
	const walk = (blocks: BlockDraft[], parent: string | null): void => {
		for (const block of blocks) {
			const path = parent ? `${parent}/${block.name}` : block.name
			if (!isStructural(catalog, block.type)) {
				paths.push(path)
			}
			walk(block.children ?? [], path)
		}
	}
	walk(draft.blocks, null)
	return paths
}

/**
 * Where a block sits, in words: across the page, in a column of a row, or
 * inside the block holding it — what the inspector's heading says under its
 * title.
 */
export function blockPosition(
	draft: PageDraft,
	path: string,
	catalog: BlockCatalog | null,
): string {
	const parent = parentPath(path)
	const holder = parent === null ? undefined : findNode(draft, parent)
	if (holder && isStructural(catalog, holder.type)) {
		const columns = holder.children ?? []
		const at = columns.findIndex((child) => child.name === path.split('/').at(-1))
		if (columns.length > 1 && at !== -1) {
			return `column ${at + 1} of ${columns.length}`
		}
	}
	const placed = placedParent(draft, path, catalog)
	if (placed === null) {
		return 'full width'
	}
	const container = findNode(draft, placed)
	return container ? `in ${blockTitle(container, catalog)}` : 'full width'
}

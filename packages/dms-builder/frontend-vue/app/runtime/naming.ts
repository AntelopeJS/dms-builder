/**
 * How the editor names a block to the person building the page: by what the
 * page shows of it, and by where it sits — never by the name the generated
 * source gives it, which nobody looking at the page has ever read.
 */
import { descriptorOf, isStructural } from './catalog'
import { COLUMN_CONTAINER, ROW_WRAPPER } from './constants'
import { findNode, parentPath } from './draft'
import type { DropTarget } from './dropping'
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

/**
 * Where a drop would land, in words: "Beside “Top customers” · new column",
 * "Below “Revenue”", "Into “Details”" — said before the block is let go, so the
 * landing is never a surprise.
 */
export function dropSentence(
	draft: PageDraft | null,
	target: DropTarget | null,
	catalog: BlockCatalog | null,
): string | undefined {
	if (!draft || !target) {
		return undefined
	}
	if (target.refusal) {
		return target.refusal
	}
	// A row is named by the block it starts with: nobody sees the row.
	const named = (path: string): string => {
		let block = findNode(draft, path)
		while (block && isStructural(catalog, block.type) && block.children?.length) {
			block = block.children[0]
		}
		return block ? `“${blockTitle(block, catalog)}”` : 'the block'
	}
	const wrap = target.wrap
	if (wrap?.type === ROW_WRAPPER) {
		return `${wrap.index ? 'Beside' : 'Before'} ${named(wrap.around)} · new column`
	}
	if (wrap?.type === COLUMN_CONTAINER) {
		return `${wrap.index ? 'Below' : 'Above'} ${named(wrap.around)}`
	}
	if (target.parent === null) {
		const blocks = draft.blocks
		return target.index >= blocks.length
			? 'At the end of the page'
			: target.index === 0
				? 'At the top of the page'
				: `Under ${named(blocks[target.index - 1]?.name ?? '')}`
	}
	const holder = findNode(draft, target.parent)
	if (holder && isStructural(catalog, holder.type)) {
		const placed = placedParent(draft, `${target.parent}/x`, catalog)
		const column = (target.index ?? 0) + 1
		return target.axis === 'horizontal'
			? `In a new column ${column} of the row`
			: placed
				? `Into ${named(placed)}`
				: 'On the page'
	}
	return `Into ${named(target.parent)}`
}

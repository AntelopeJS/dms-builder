/**
 * The layout the editor writes for the author, kept to what it still needs.
 *
 * The page is a grid nobody sees: an author puts one block beside another, and
 * the editor writes the rows and columns that placement takes. Taking a block
 * back out has to undo that the same way. A row left holding one block is that
 * block again, a column left holding one block is that block, and structure
 * holding nothing at all is removed. Otherwise the page fills with scaffolding
 * no panel shows and no gesture can reach.
 *
 * Only structure the editor would have written itself is taken apart: a stack
 * set up by hand to centre what it holds would move its content if it were
 * unwrapped. And never around a block kept as written, which the module finds
 * again by its path.
 */
import { toRaw } from 'vue'
import { descriptorOf, isLayout, newBlockDraft } from './catalog'
import { ROW_CONTAINERS } from './constants'
import { uniqueName, walkDraft } from './draft'
import type { BlockCatalog, BlockDraft, PageDraft } from './types'

/** How a list of blocks is laid out, which decides what may be flattened into it. */
type Flow = 'stack' | 'row' | 'rows'

/** The stack the editor builds for a column. */
const COLUMN_TYPE = 'VStack'
/** The container the editor builds for a row, around the row it holds. */
const GRID_TYPE = 'Grid'

export function tidyLayout(draft: PageDraft, catalog: BlockCatalog | null): void {
	if (!catalog) {
		return
	}
	draft.blocks = tidyList(draft.blocks, 'stack', catalog)
}

/**
 * The path a block sits at now, found by the block itself.
 *
 * Compared raw: the draft the session holds hands back reactive proxies, and a
 * proxy is never the object it wraps.
 */
export function pathOfNode(
	draft: PageDraft,
	target: BlockDraft,
): string | undefined {
	const wanted = toRaw(target)
	let found: string | undefined
	walkDraft(draft.blocks, (block, path) => {
		if (toRaw(block) === wanted) {
			found = path
		}
	})
	return found
}

function tidyList(
	blocks: BlockDraft[],
	flow: Flow,
	catalog: BlockCatalog,
): BlockDraft[] {
	const results = blocks.map((block) => tidyBlock(block, flow, catalog))
	// A block lifted out of a row joins the blocks around it, and a name is one
	// per list. The blocks that were already here keep theirs: the one that
	// moved is the one that gives way.
	const stayed = results.flatMap((kept, at) =>
		kept.length === 1 && kept[0] === blocks[at] ? kept : [],
	)
	const tidied: BlockDraft[] = []
	for (const [at, kept] of results.entries()) {
		for (const block of kept) {
			if (block !== blocks[at]) {
				const others = [...stayed, ...tidied].filter((other) => other !== block)
				block.name = uniqueName(others, block.name)
			}
			tidied.push(block)
		}
	}
	return tidied
}

function tidyBlock(
	block: BlockDraft,
	flow: Flow,
	catalog: BlockCatalog,
): BlockDraft[] {
	if (block.preserve) {
		return [block]
	}
	if (block.children) {
		block.children = tidyList(block.children, flowOf(block.type), catalog)
	}
	if (!isLayout(catalog, block.type)) {
		return [block]
	}
	const children = block.children ?? []
	if (children.length === 0) {
		return []
	}
	if (!isPlain(block, catalog) || holdsKept(block)) {
		return [block]
	}
	const lifted = liftedOut(block, flow)
	return lifted ? lifted.map((child) => placedAs(child, block)) : [block]
}

/** What stands in for a layout block once it is taken apart, if it can be. */
function liftedOut(block: BlockDraft, flow: Flow): BlockDraft[] | undefined {
	const children = block.children ?? []
	if (block.type === COLUMN_TYPE) {
		// A column of several blocks is a column, unless nothing lays it out
		// beside anything: then it is a run of blocks like any other.
		return children.length === 1 || flow === 'stack' ? children : undefined
	}
	if (block.type === GRID_TYPE) {
		if (children.length === 1) {
			const cells = children[0]?.children ?? []
			return cells.length === 1 ? cells : undefined
		}
		// Among columns, a grid of several rows is a layout of its own.
		if (flow !== 'stack') {
			return undefined
		}
		// Rows of one grid share its columns: a row of one block under a row of
		// two would take half the width. Laid out one under the other, each row
		// is its own, as the editor writes it — and a row of one block is that
		// block.
		return children.map((row) => {
			const cells = row.children ?? []
			return cells.length === 1 && cells[0]
				? cells[0]
				: { ...block, config: { ...block.config }, children: [row] }
		})
	}
	return undefined
}

/**
 * A block taking the place of the layout block it was lifted out of.
 *
 * The region it was in and the columns it spanned belonged to the container,
 * and are the child's now: the layout around it must not shift for a gesture
 * that only took scaffolding away.
 */
function placedAs(child: BlockDraft, container: BlockDraft): BlockDraft {
	if (container.slot !== undefined) {
		child.slot = container.slot
	}
	if (container.meta) {
		child.meta = { ...child.meta, ...container.meta }
	}
	return child
}

function flowOf(type: string | undefined): Flow {
	if (type === GRID_TYPE) {
		return 'rows'
	}
	return type !== undefined && ROW_CONTAINERS.has(type) ? 'row' : 'stack'
}

/**
 * Whether a layout block lays out the way the one the editor places does.
 *
 * Read option by option against what the editor writes, each side falling back
 * on the schema's own default, so `Grid({ gap: "1rem" })` spelled out by hand is
 * still the grid the editor would have built.
 */
function isPlain(block: BlockDraft, catalog: BlockCatalog): boolean {
	const descriptor = descriptorOf(catalog, block.type)
	if (!descriptor) {
		return false
	}
	const placed = newBlockDraft(descriptor).config ?? {}
	const config = block.config ?? {}
	if (Object.keys(config).some((key) => !(key in descriptor.config))) {
		return false
	}
	return Object.entries(descriptor.config).every(([key, schema]) => {
		const own = config[key] ?? schema.default
		const editors = placed[key] ?? schema.default
		return JSON.stringify(own) === JSON.stringify(editors)
	})
}

/** Whether a block kept as written sits anywhere inside this one. */
function holdsKept(block: BlockDraft): boolean {
	let kept = false
	walkDraft(block.children ?? [], (child) => {
		kept ||= child.preserve === true
	})
	return kept
}

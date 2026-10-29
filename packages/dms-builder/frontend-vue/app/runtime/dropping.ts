/**
 * Where a dragged block would land, resolved at the pointer.
 *
 * The canvas offers no standing targets: a drop is aimed at the blocks that are
 * already on the page, and this reads a pointer inside one of them as a place
 * among its siblings or inside it. The rules it answers with are the catalog's
 * own — `container`, `allowedChildren` — read here so a refused placement is
 * said before the drop rather than surfacing as the module's refusal one round
 * trip later.
 *
 * Every block answers on all four of its sides at once: its left and right
 * quarters name the columns beside it, its top and bottom bands the places above
 * and below it, and what is left of a container aims inside it. The page is a
 * grid nobody sees — a block nothing lays out in columns yet gains a row of its
 * own the moment another is put beside it — so nobody has to know that a grid is
 * made of rows, or a column of a stack, to compose one out of them.
 */
import { descriptorOf, isStructural } from './catalog'
import { COLUMN_CONTAINER, ROW_WRAPPER } from './constants'
import { findNode, parentPath } from './draft'
import type {
	BlockCatalog,
	BlockDraft,
	BlockTypeDescriptor,
	PageDraft,
} from './types'
import {
	type DragPayload,
	type DropEdge,
	type DropAxis,
	type DropZone,
	type DropPlacement,
	type DropTarget,
	type PointerBox,
	type ColumnContext,
	LONE_COLUMN,
	ZONE_EDGES,
	SIDEWAYS_ZONES,
	labelOf,
	isRowContainer,
	spansFullWidth,
	zoneAt,
	columnContext,
	cannotHold,
	isWithin,
	parentTypeOf,
	fillSpan,
	childrenOf,
	siblingIndex,
	inside,
} from './dropping-geometry'

const REFUSALS = {
	self: 'A block cannot go inside itself',
	kept: 'This block is kept as written',
	flank: 'A row always spans the full width; drop inside it for a column',
	// Named as the palette names them, with what to do instead.
	leaf: (label: string) => `${label} can't hold other blocks · drop beside it instead`,
	only: (label: string, allowed: string[]) => `${label} only takes ${allowed.join(', ')}`,
}

/** The type that would land: the palette's, or the moved block's own. */
export function draggedType(
	draft: PageDraft | null,
	payload: DragPayload,
): string | undefined {
	if (payload.type) {
		return payload.type
	}
	return payload.path && draft ? findNode(draft, payload.path)?.type : undefined
}

/**
 * The child a container would build around a block it cannot hold itself.
 *
 * A Grid takes rows and nothing else, and someone aiming a card at one means the
 * card, not the scaffolding around it. The answer is the catalog's own rule read
 * one step further: a single allowed child, able to hold what is being dropped.
 */
export function wrapperFor(
	catalog: BlockCatalog | null,
	parent: string | undefined,
	type: string | undefined,
): BlockTypeDescriptor | undefined {
	const allowed = descriptorOf(catalog, parent)?.allowedChildren
	if (!type || allowed?.length !== 1 || allowed.includes(type)) {
		return undefined
	}
	const wrapper = descriptorOf(catalog, allowed[0])
	if (!wrapper?.container || cannotHold(wrapper, type)) {
		return undefined
	}
	return wrapper
}

/**
 * The container the canvas names for a drop, and frames.
 *
 * Never the structure the editor writes for itself: a row belongs to the grid
 * that built it, and naming it would put back in front of the user the one word
 * the whole gesture exists to spare them.
 */
export function namedHost(
	catalog: BlockCatalog | null,
	draft: PageDraft | null,
	parent: string | null,
): string | null {
	let path = parent
	while (draft && path !== null) {
		if (!isStructural(catalog, findNode(draft, path)?.type)) {
			return path
		}
		path = parentPath(path)
	}
	return path
}

/**
 * Why an insertion under `parent` would be refused, worded for the user.
 *
 * A type this build has never heard of is left to the module: the catalog is
 * read for the rules it states, not guessed at for the ones it does not.
 */
export function refusalFor(
	catalog: BlockCatalog | null,
	draft: PageDraft | null,
	parent: string | null,
	type: string | undefined,
	moving?: string,
): string | undefined {
	if (moving && parent !== null && isWithin(parent, moving)) {
		return REFUSALS.self
	}
	if (parent === null || !draft) {
		return undefined
	}
	const block = findNode(draft, parent)
	if (block?.preserve) {
		return REFUSALS.kept
	}
	// The one gesture that cannot be translated: a row among another row's
	// columns would be laid out across all of them, on its own line.
	if (spansFullWidth(type) && isRowContainer(block?.type)) {
		return REFUSALS.flank
	}
	const descriptor = descriptorOf(catalog, block?.type)
	if (!descriptor) {
		return undefined
	}
	if (!descriptor.container) {
		return REFUSALS.leaf(labelOf(catalog, descriptor.type))
	}
	if (!cannotHold(descriptor, type)) {
		return undefined
	}
	// A container that builds its own child around the block takes it after all.
	return wrapperFor(catalog, descriptor.type, type)
		? undefined
		: REFUSALS.only(
				labelOf(catalog, descriptor.type),
				(descriptor.allowedChildren ?? []).map((allowed) => labelOf(catalog, allowed)),
			)
}

/** Why a drop would be refused, wherever this placement puts it. */
export function refusalForDrop(
	catalog: BlockCatalog | null,
	draft: PageDraft | null,
	placement: DropPlacement,
	type: string | undefined,
	moving?: string,
): string | undefined {
	const wrap = placement.wrap
	if (!wrap) {
		return refusalFor(catalog, draft, placement.parent, type, moving)
	}
	if (moving && isWithin(wrap.around, moving)) {
		return REFUSALS.self
	}
	// A block pinned across its container is no more a column inside a stack
	// than it is one beside it.
	if (spansFullWidth(type)) {
		return REFUSALS.flank
	}
	return refusalFor(catalog, draft, parentPath(wrap.around), wrap.type, moving)
}

/** The end of the page: whatever is already there, then the new block. */
export function targetAtPage(draft: PageDraft | null): DropTarget {
	return {
		parent: null,
		index: (draft?.blocks ?? []).length,
		axis: 'horizontal',
	}
}

/** Where a pointer inside one block on the page aims. */
export function targetAtBlock(
	catalog: BlockCatalog | null,
	draft: PageDraft | null,
	payload: DragPayload,
	path: string,
	box: PointerBox,
): DropTarget | null {
	const block = draft ? findNode(draft, path) : undefined
	if (!draft || !block) {
		return null
	}
	const columns = columnContext(draft, path)
	const zone = zoneAt(box, {
		columns: columns !== undefined || joinsRow(catalog, block),
		inside: descriptorOf(catalog, block.type)?.container === true,
	})
	const target = targetInZone(draft, { path, block, box }, zone, columns)
	if (!target) {
		return null
	}
	const refusal = refusalForDrop(
		catalog,
		draft,
		target,
		draggedType(draft, payload),
		payload.path,
	)
	return refusal ? { ...target, refusal } : target
}

/**
 * The end of what a container holds, named by the container itself.
 *
 * A region holding nothing renders no block for a pointer to be read against,
 * and the box of the container around it is mostly the bands that aim beside
 * it: an author aiming at an empty tab was aiming at the bottom of the tab
 * set. The way in that stands for the region answers on its own behalf
 * instead, and what it answers is the one thing it means.
 */
export function targetInside(
	catalog: BlockCatalog | null,
	draft: PageDraft | null,
	payload: DragPayload,
	path: string,
): DropTarget | null {
	const block = draft ? findNode(draft, path) : undefined
	if (!draft || !block) {
		return null
	}
	const target = inside(path, block, undefined)
	const refusal = refusalForDrop(
		catalog,
		draft,
		target,
		draggedType(draft, payload),
		payload.path,
	)
	return refusal ? { ...target, refusal } : target
}

/**
 * What a drag actually does, named the way the drag-and-drop API names it.
 *
 * A block taken from the palette is copied into the page; a block already on
 * it is moved. Declaring the same effect at both ends is what lets the browser
 * draw the cursor for the gesture: a source offering one effect and a target
 * answering with another leaves it reconciling two gestures, and what it draws
 * then is its no-drop cursor, over a surface that does accept the drop.
 */
export function effectOfDrag(payload: DragPayload | null | undefined): 'copy' | 'move' {
	return payload?.path ? 'move' : 'copy'
}

/** Whether two answers say the same thing, so a hover can be left alone. */
export function sameTarget(
	left: DropTarget | null,
	right: DropTarget | null,
): boolean {
	if (!left || !right) {
		return left === right
	}
	return (
		left.parent === right.parent &&
		left.index === right.index &&
		left.axis === right.axis &&
		left.wrap?.around === right.wrap?.around &&
		left.wrap?.type === right.wrap?.type &&
		left.wrap?.index === right.wrap?.index &&
		left.refusal === right.refusal
	)
}

/** The block the pointer is over, read once for every zone that needs it. */
interface AimedBlock {
	path: string
	block: BlockDraft
	box: PointerBox
}

function targetInZone(
	draft: PageDraft,
	aimed: AimedBlock,
	zone: DropZone,
	columns: ColumnContext | undefined,
): DropTarget | null {
	if (zone === 'inside') {
		const fill = fillSpan(aimed.block, aimed.box, columns !== undefined)
		return inside(aimed.path, aimed.block, fill)
	}
	if (SIDEWAYS_ZONES.has(zone)) {
		return columns
			? beside(draft, columns.column, ZONE_EDGES[zone], 'vertical')
			: inNewRow(draft, aimed.path, ZONE_EDGES[zone])
	}
	return stackedAt(draft, stackAnchor(draft, aimed.path), ZONE_EDGES[zone])
}

/**
 * Whether a block nothing lays out in columns can still have one put beside it.
 *
 * Not structure: the canvas shows it as nothing but what it holds, so a flank
 * of it is the flank of a block inside it. Not a block pinned across its
 * container, which nothing can sit beside. And not a block kept as written,
 * which the module finds again only where it was.
 */
function joinsRow(catalog: BlockCatalog | null, block: BlockDraft): boolean {
	return (
		block.preserve !== true &&
		!isStructural(catalog, block.type) &&
		!spansFullWidth(block.type)
	)
}

/**
 * Beside a block that sits on its own: a row built around the two of them.
 *
 * The block moves into the row where it stood, and the drop takes the column
 * on the side that was aimed at.
 */
function inNewRow(
	draft: PageDraft,
	path: string,
	edge: DropEdge,
): DropTarget | null {
	const index = siblingIndex(draft, path)
	if (index === -1) {
		return null
	}
	return {
		parent: parentPath(path),
		index,
		wrap: {
			around: path,
			type: ROW_WRAPPER,
			index: edge === 'before' ? 0 : 1,
		},
		axis: 'vertical',
	}
}

/**
 * What a band above or below a row stands for.
 *
 * A row the editor built is the only one its grid holds, so above it means
 * above that grid. A row among several of a grid written by hand is still one
 * row of that grid.
 */
function stackAnchor(draft: PageDraft, path: string): string {
	const grid = parentPath(path)
	if (grid === null || !spansFullWidth(findNode(draft, path)?.type)) {
		return path
	}
	return childrenOf(draft, grid).length === 1 ? grid : path
}

export function beside(
	draft: PageDraft,
	path: string,
	edge: DropEdge,
	axis: DropAxis,
): DropTarget | null {
	const index = siblingIndex(draft, path)
	if (index === -1) {
		return null
	}
	return {
		parent: parentPath(path),
		index: edge === 'before' ? index : index + 1,
		axis,
	}
}

/**
 * Above or below a block, which is three different things.
 *
 * Stacked the way its own container already stacks, a block simply has a place
 * before or after it. Laid out among columns it has none, and the user pointing
 * above a cell means above *that cell*, not a band across the whole width — so
 * the cell is enclosed, together with the drop, in a column built for the
 * occasion. Unless the cell is everything its row holds: then the cell and the
 * row are the same surface, and a row of its own beside that one is the honest
 * reading — `wrapperFor` builds it, the same way it does for a first drop.
 */
function stackedAt(
	draft: PageDraft,
	path: string,
	edge: DropEdge,
): DropTarget | null {
	const row = parentPath(path)
	if (row === null || !isRowContainer(parentTypeOf(draft, path))) {
		return beside(draft, path, edge, 'horizontal')
	}
	if (childrenOf(draft, row).length <= LONE_COLUMN) {
		return beside(draft, row, edge, 'horizontal')
	}
	const index = siblingIndex(draft, path)
	if (index === -1) {
		return null
	}
	return {
		parent: row,
		index,
		wrap: {
			around: path,
			type: COLUMN_CONTAINER,
			index: edge === 'before' ? 0 : 1,
		},
		axis: 'horizontal',
	}
}

export {
	isRowContainer,
	spansFullWidth,
	zoneAt,
	columnAt,
	columnContext,
} from './dropping-geometry'
export type {
	DragPayload,
	DropAxis,
	DropZone,
	DropWrap,
	DropPlacement,
	DropTarget,
	Span,
	PointerBox,
	ZoneOptions,
	ColumnContext,
} from './dropping-geometry'

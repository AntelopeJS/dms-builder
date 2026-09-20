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
 * A block laid out among columns answers on all four of its sides at once: its
 * left and right quarters name the columns beside it, its top and bottom bands
 * the places above and below it, and what is left of a container aims inside it.
 * Nobody has to know that a grid is made of rows, or a column of a stack, to
 * compose one out of them.
 */
import { descriptorOf, isStructural } from './catalog'
import {
	COLUMN_CONTAINER,
	FULL_WIDTH_BLOCKS,
	ROW_CONTAINERS,
} from './constants'
import { findNode, joinPath, leafName, parentPath } from './draft'
import type {
	BlockCatalog,
	BlockDraft,
	BlockTypeDescriptor,
	PageDraft,
} from './types'

/** What a drag currently carries: a new block type, or a block being moved. */
export interface DragPayload {
	type?: string
	path?: string
}

/** Which side of a block an insertion sits on, whatever way it is laid out. */
export type DropEdge = 'before' | 'after' | 'inside'

/** How the insertion line runs: across a block, or down its flank. */
export type DropAxis = 'horizontal' | 'vertical'

/** The five places a pointer inside a block can name. */
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'inside'

export interface DropAnchor {
	/** The block the insertion line is drawn against; `null` is the page. */
	path: string | null
	edge: DropEdge
	axis: DropAxis
}

/**
 * A container the editor builds around a block, to hold it and the drop.
 *
 * Unlike `wrapperFor`, this one takes in a block that is already on the page:
 * it is how a cell of a row gains a second block under it without the row
 * gaining a column.
 */
export interface DropWrap {
	/** The block it encloses, beside the one being dropped. */
	around: string
	/** Its type — the catalog's own name for a column. */
	type: string
	/** Where the dropped block sits inside it. */
	index: number
}

/** Where a drop would land, as much of it as the catalog's rules have to read. */
export interface DropPlacement {
	/** The container that would receive the block; `null` is the page itself. */
	parent: string | null
	wrap?: DropWrap
}

export interface DropTarget extends DropPlacement {
	/** Where it would sit among that container's children. */
	index: number
	anchor: DropAnchor
	/** Why it would be refused, in a few words; absent when it is allowed. */
	refusal?: string
}

/** A block's extent along one axis, and the pointer's position on it. */
export interface Span {
	start: number
	size: number
	at: number
}

/** The pointer inside a block's box, on both axes. */
export interface PointerBox {
	x: Span
	y: Span
}

/** Which of a block's zones its surroundings give a meaning to. */
export interface ZoneOptions {
	/** Whether something lays it out among columns, so left and right name them. */
	columns: boolean
	/** Whether it can be aimed into at all. */
	inside: boolean
}

/** A block's place among columns: the row, and the column it sits in. */
export interface ColumnContext {
	/** The container laying its children out side by side. */
	row: string
	/** That row's child the block is in — itself, or the column holding it. */
	column: string
}

/** One edge in contention for the pointer, and how far away it is. */
interface ZoneEdge {
	zone: DropZone
	/** The distance to that edge, as a share of the box along its own axis. */
	distance: number
}

/**
 * The share of a container, at each end, that still aims beside it rather than
 * into it. A block that holds nothing has no inside, so the nearest edge wins
 * wherever the pointer is.
 */
const CONTAINER_EDGE = 0.25
/** The columns a child takes up when its metadata claims none. */
const ONE_COLUMN = 1
/** A row holding no more than this is the same surface as the cell in it. */
const LONE_COLUMN = 1

const ZONE_EDGES: Record<DropZone, DropEdge> = {
	left: 'before',
	right: 'after',
	top: 'before',
	bottom: 'after',
	inside: 'inside',
}

const SIDEWAYS_ZONES = new Set<DropZone>(['left', 'right'])

const REFUSALS = {
	self: 'A block cannot go inside itself',
	kept: 'This block is kept as written',
	flank: 'A row always spans the full width; drop inside it for a column',
	leaf: (type: string) => `${type} takes no child`,
	only: (type: string, allowed: string[]) =>
		`${type} only accepts ${allowed.join(', ')}`,
}

/** Whether a container lays its children out side by side. */
export function isRowContainer(type: string | undefined): boolean {
	return type !== undefined && ROW_CONTAINERS.has(type)
}

/** Whether a block takes its container's whole width, so nothing sits beside it. */
export function spansFullWidth(type: string | undefined): boolean {
	return type !== undefined && FULL_WIDTH_BLOCKS.has(type)
}

/**
 * Which of a block's five zones the pointer is in.
 *
 * Every live edge competes and the nearest one wins, each distance measured as a
 * share of the box along its own axis — so a wide, shallow cell answers with its
 * top and bottom long before a square one would, and the corners fall to
 * whichever edge the pointer is really closer to. A container keeps the middle
 * for itself; a block that holds nothing has no middle to keep.
 */
export function zoneAt(box: PointerBox, options: ZoneOptions): DropZone {
	const nearest = edgesOf(box, options.columns).reduce((closest, edge) =>
		edge.distance < closest.distance ? edge : closest,
	)
	if (options.inside && nearest.distance >= CONTAINER_EDGE) {
		return 'inside'
	}
	return nearest.zone
}

/**
 * Which place among children laid out along one axis a pointer names.
 *
 * Read off the columns the children claim rather than their rendered boxes: a
 * row sizes its own columns from those same numbers, and measuring the page
 * would mean waiting for the whole subtree to be laid out before answering. Past
 * the middle of a child the block belongs on its far side — the halves rule
 * again, applied to each column in turn.
 */
export function columnAt(span: Span, columns: number[]): number {
	const total = columns.reduce((sum, count) => sum + count, 0)
	if (total <= 0) {
		return columns.length
	}
	const offset = span.at - span.start
	let filled = 0
	let index = 0
	for (const count of columns) {
		if (((filled + count / 2) / total) * span.size > offset) {
			break
		}
		filled += count
		index += 1
	}
	return index
}

/**
 * The row a block is laid out in, however deep the column holding it goes.
 *
 * A block stacked inside a column still reads as one cell of the row, so
 * pointing at its flank names a column beside that whole stack. The walk stops
 * at a block its container lays out in one of its own slots: that one is placed
 * by the container, not among any row's columns.
 */
export function columnContext(
	draft: PageDraft,
	path: string,
): ColumnContext | undefined {
	let column = path
	let parent = parentPath(column)
	while (parent !== null) {
		if (isRowContainer(findNode(draft, parent)?.type)) {
			return { row: parent, column }
		}
		if (findNode(draft, column)?.slot) {
			return undefined
		}
		column = parent
		parent = parentPath(column)
	}
	return undefined
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
		return REFUSALS.leaf(descriptor.type)
	}
	if (!cannotHold(descriptor, type)) {
		return undefined
	}
	// A container that builds its own child around the block takes it after all.
	return wrapperFor(catalog, descriptor.type, type)
		? undefined
		: REFUSALS.only(descriptor.type, descriptor.allowedChildren ?? [])
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
	const blocks = draft?.blocks ?? []
	return {
		parent: null,
		index: blocks.length,
		anchor: endOf(null, blocks, 'horizontal'),
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
		columns: columns !== undefined,
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
		left.anchor.path === right.anchor.path &&
		left.anchor.edge === right.anchor.edge &&
		left.anchor.axis === right.anchor.axis &&
		left.wrap?.around === right.wrap?.around &&
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
	if (columns && SIDEWAYS_ZONES.has(zone)) {
		return beside(draft, columns.column, ZONE_EDGES[zone], 'vertical')
	}
	return stackedAt(draft, aimed.path, ZONE_EDGES[zone])
}

/**
 * The edges in contention, and how far the pointer is from each.
 *
 * Horizontal first, so a pointer exactly on a corner's diagonal falls to the
 * axis the row is composed on — the one the user is choosing a column with.
 */
function edgesOf(box: PointerBox, columns: boolean): ZoneEdge[] {
	const down = fractionOf(box.y)
	const stacked: ZoneEdge[] = [
		{ zone: 'top', distance: down },
		{ zone: 'bottom', distance: 1 - down },
	]
	if (!columns) {
		return stacked
	}
	const across = fractionOf(box.x)
	return [
		{ zone: 'left', distance: across },
		{ zone: 'right', distance: 1 - across },
		...stacked,
	]
}

/** Where the pointer sits on a span, from 0 at its start to 1 at its end. */
function fractionOf(span: Span): number {
	return span.size > 0 ? (span.at - span.start) / span.size : 0
}

/** Whether the catalog states a rule this block breaks as a direct child. */
function cannotHold(
	descriptor: BlockTypeDescriptor,
	type: string | undefined,
): boolean {
	const allowed = descriptor.allowedChildren
	return allowed !== undefined && type !== undefined && !allowed.includes(type)
}

/** Whether `path` is the block at `ancestor` or something it holds. */
function isWithin(path: string, ancestor: string): boolean {
	return path === ancestor || path.startsWith(`${ancestor}/`)
}

function parentTypeOf(draft: PageDraft, path: string): string | undefined {
	const parent = parentPath(path)
	return parent === null ? undefined : findNode(draft, parent)?.type
}

/** How a line between a container's children runs, given the way it lays them out. */
function lineAxis(type: string | undefined): DropAxis {
	return isRowContainer(type) ? 'vertical' : 'horizontal'
}

/**
 * The axis a container is filled along, when there is a place to read off it.
 *
 * A container stacked the way the page stacks it has no second axis to spare:
 * its own bands already say above and below, and the middle left over aims at
 * the end of what it holds.
 */
function fillSpan(
	block: BlockDraft,
	box: PointerBox,
	inRow: boolean,
): Span | undefined {
	if (isRowContainer(block.type)) {
		return box.x
	}
	return inRow ? box.y : undefined
}

/**
 * Read a container's children without touching the draft.
 *
 * `siblingsAt` fills in the list it is asked for, which on a draft the editor
 * is holding would count as an edit: hovering must not make the page dirty.
 */
function childrenOf(draft: PageDraft, parent: string | null): BlockDraft[] {
	if (parent === null) {
		return draft.blocks
	}
	return findNode(draft, parent)?.children ?? []
}

function siblingIndex(draft: PageDraft, path: string): number {
	return childrenOf(draft, parentPath(path)).findIndex(
		(block) => block.name === leafName(path),
	)
}

/** The line at the end of a list of children, drawn under the last of them. */
function endOf(
	parent: string | null,
	children: BlockDraft[],
	axis: DropAxis,
): DropAnchor {
	const last = children.at(-1)
	return last
		? { path: joinPath(parent, last.name), edge: 'after', axis }
		: { path: parent, edge: 'inside', axis }
}

function inside(
	path: string,
	block: BlockDraft,
	fill: Span | undefined,
): DropTarget {
	const children = block.children ?? []
	const axis = lineAxis(block.type)
	if (!fill || children.length === 0) {
		return {
			parent: path,
			index: children.length,
			anchor: endOf(path, children, axis),
		}
	}
	const index = columnAt(fill, children.map(columnsOf))
	return {
		parent: path,
		index,
		anchor: columnAnchor(path, children, index, axis),
	}
}

function columnsOf(child: BlockDraft): number {
	return Number(child.meta?.colSpan) || ONE_COLUMN
}

/** The column edge the line is drawn on, so it says which two it falls between. */
function columnAnchor(
	path: string,
	children: BlockDraft[],
	index: number,
	axis: DropAxis,
): DropAnchor {
	const leading = index === 0
	const child = children[leading ? 0 : index - 1]
	if (!child) {
		return { path, edge: 'inside', axis }
	}
	return {
		path: joinPath(path, child.name),
		edge: leading ? 'before' : 'after',
		axis,
	}
}

function beside(
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
		anchor: { path, edge, axis },
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
		anchor: { path, edge, axis: 'horizontal' },
	}
}

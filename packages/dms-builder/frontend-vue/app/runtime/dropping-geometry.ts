import { descriptorOf } from './catalog'
import { FULL_WIDTH_BLOCKS, ROW_CONTAINERS } from './constants'
import { findNode, leafName, parentPath } from './draft'
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
	/**
	 * How tall the block being moved is on the page, in pixels.
	 *
	 * The room opened for it is that tall, so what the page shows during the
	 * drag is the page the drop will leave behind rather than an approximation
	 * of it. A block coming from the palette has no height yet, and the room
	 * made for it falls back to a size of its own.
	 */
	height?: number
}

/** Which side of a block an insertion sits on, whatever way it is laid out. */
export type DropEdge = 'before' | 'after' | 'inside'

/** How a container fills, and so how the room made for a drop runs in it. */
export type DropAxis = 'horizontal' | 'vertical'

/** The five places a pointer inside a block can name. */
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'inside'

/**
 * A container the editor builds around a block, to hold it and the drop.
 *
 * Unlike `wrapperFor`, this one takes in a block that is already on the page.
 * A column is how a cell of a row gains a second block under it without the
 * row gaining a column; a row is how a block nothing lays out in columns gains
 * one beside it.
 */
export interface DropWrap {
	/** The block it encloses, beside the one being dropped. */
	around: string
	/**
	 * Its type: the catalog's own name for a column, or the grid that holds a
	 * row — see `ROW_WRAPPER`.
	 */
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
	/**
	 * The way that container fills, which is the way the room opened for the
	 * block runs in it: a band across a stack, a column down a row.
	 */
	axis: DropAxis
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
	/** The share of that axis, at this end, that still aims beside the block. */
	band: number
}

/**
 * The share of a container, at each end, that still aims beside it rather than
 * into it. A block that holds nothing has no inside, so the nearest edge wins
 * wherever the pointer is.
 *
 * A narrow band, because the two answers are not worth the same. Beside a
 * container is a place the neighbouring blocks also name — the same column
 * opens from the flank of whatever sits next to it — while inside it is named
 * by that container alone, and by nothing else on the page. And a container
 * aimed beside now gives a column up to the opening and narrows as it does,
 * so a middle kept to half the box shrinks while the user is reaching for it.
 */
const CONTAINER_EDGE = 0.15
/**
 * …and never more than this many pixels of it.
 *
 * The band is a handle, not a proportion: left to a share alone, the bigger a
 * container grew the wider the moat around its own inside became, which is
 * backwards. A tab set the height of the page had a band sixty pixels deep on
 * every side, and an author reaching for the tab pushed the set out of the way
 * instead — twice over, now that the room opened beside it moves what it
 * opens next to.
 */
const CONTAINER_EDGE_PX = 32
/** The columns a child takes up when its metadata claims none. */
const ONE_COLUMN = 1
/** A row holding no more than this is the same surface as the cell in it. */
export const LONE_COLUMN = 1

export const ZONE_EDGES: Record<DropZone, DropEdge> = {
	left: 'before',
	right: 'after',
	top: 'before',
	bottom: 'after',
	inside: 'inside',
}

export const SIDEWAYS_ZONES = new Set<DropZone>(['left', 'right'])

/** A type as the palette names it. */
export function labelOf(catalog: BlockCatalog | null, type: string): string {
	return descriptorOf(catalog, type)?.label ?? type
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
	if (options.inside && nearest.distance >= nearest.band) {
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

/**
 * The edges in contention, and how far the pointer is from each.
 *
 * Horizontal first, so a pointer exactly on a corner's diagonal falls to the
 * axis the row is composed on — the one the user is choosing a column with.
 */
function edgesOf(box: PointerBox, columns: boolean): ZoneEdge[] {
	const down = fractionOf(box.y)
	const downwards = bandOf(box.y)
	const stacked: ZoneEdge[] = [
		{ zone: 'top', distance: down, band: downwards },
		{ zone: 'bottom', distance: 1 - down, band: downwards },
	]
	if (!columns) {
		return stacked
	}
	const across = fractionOf(box.x)
	const sideways = bandOf(box.x)
	return [
		{ zone: 'left', distance: across, band: sideways },
		{ zone: 'right', distance: 1 - across, band: sideways },
		...stacked,
	]
}

/** How much of one axis, at each end, still aims beside rather than into. */
function bandOf(span: Span): number {
	return span.size > 0
		? Math.min(CONTAINER_EDGE, CONTAINER_EDGE_PX / span.size)
		: CONTAINER_EDGE
}

/** Where the pointer sits on a span, from 0 at its start to 1 at its end. */
function fractionOf(span: Span): number {
	return span.size > 0 ? (span.at - span.start) / span.size : 0
}

/** Whether the catalog states a rule this block breaks as a direct child. */
export function cannotHold(
	descriptor: BlockTypeDescriptor,
	type: string | undefined,
): boolean {
	const allowed = descriptor.allowedChildren
	return allowed !== undefined && type !== undefined && !allowed.includes(type)
}

/** Whether `path` is the block at `ancestor` or something it holds. */
export function isWithin(path: string, ancestor: string): boolean {
	return path === ancestor || path.startsWith(`${ancestor}/`)
}

export function parentTypeOf(draft: PageDraft, path: string): string | undefined {
	const parent = parentPath(path)
	return parent === null ? undefined : findNode(draft, parent)?.type
}

/** The way a container fills, given how it lays its children out. */
function fillAxis(type: string | undefined): DropAxis {
	return isRowContainer(type) ? 'vertical' : 'horizontal'
}

/**
 * The axis a container is filled along, when there is a place to read off it.
 *
 * A container stacked the way the page stacks it has no second axis to spare:
 * its own bands already say above and below, and the middle left over aims at
 * the end of what it holds.
 */
export function fillSpan(
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
export function childrenOf(draft: PageDraft, parent: string | null): BlockDraft[] {
	if (parent === null) {
		return draft.blocks
	}
	return findNode(draft, parent)?.children ?? []
}

export function siblingIndex(draft: PageDraft, path: string): number {
	return childrenOf(draft, parentPath(path)).findIndex(
		(block) => block.name === leafName(path),
	)
}

export function inside(
	path: string,
	block: BlockDraft,
	fill: Span | undefined,
): DropTarget {
	const children = block.children ?? []
	const axis = fillAxis(block.type)
	if (!fill || children.length === 0) {
		return { parent: path, index: children.length, axis }
	}
	return { parent: path, index: columnAt(fill, children.map(columnsOf)), axis }
}

function columnsOf(child: BlockDraft): number {
	return Number(child.meta?.colSpan) || ONE_COLUMN
}

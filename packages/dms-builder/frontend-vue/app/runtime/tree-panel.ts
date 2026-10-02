/**
 * A tree, as the simple mode's panel edits it: its items listed by hand or read
 * from an address, what it shows on the page, and what it does differently from
 * the defaults — how items are selected, which start open, how it looks — each
 * behind a switch of its own. Methods, handlers and on-demand loading are the
 * advanced view's.
 */
import { keyFrom } from './keys'

/** The block the simple mode edits with a panel of its own. */
export const TREE_BLOCK = 'Tree'

/**
 * The options that panel answers for. The ones it does not show — the method
 * an address is read with, loading on demand, which nodes are open right now —
 * are left to the advanced view, and offered nowhere in the simple mode.
 */
export const TREE_PANEL_OPTIONS = new Set([
	'title',
	'description',
	'staticNodes',
	'fetchUrl',
	'fetchUrlMethod',
	'lazyLoad',
	'expanded',
	'multiple',
	'propagateSelect',
	'selectionBehavior',
	'disabled',
	'defaultExpanded',
	'color',
	'size',
	'expandedIcon',
	'collapsedIcon',
	'trailingIcon',
])

/** How a click selects, when nothing says otherwise: the DMS's first choice. */
export const DEFAULT_SELECTION = 'toggle'

/** The settings behind each switch, cleared when it is turned off. */
export const CUSTOM_SELECTION = ['multiple', 'propagateSelect', 'disabled'] as const
export const CUSTOM_OPENING = ['defaultExpanded'] as const
export const CUSTOM_LOOK = [
	'color',
	'size',
	'expandedIcon',
	'collapsedIcon',
	'trailingIcon',
] as const

/** An item of the tree, as the panel writes one. */
export interface TreeItem {
	label: string
	/** What tells it apart among its siblings; the author never types it. */
	value?: string
	icon?: string
	children?: TreeItem[]
	[key: string]: unknown
}

/** One line of the list of items: an item, at its depth, with its place. */
export interface TreeRow {
	/** Its rank in the tree, then in each item below. */
	path: number[]
	item: TreeItem
	depth: number
	/** How many items share its list, which is as far as it can move. */
	siblings: number
}

function isItem(value: unknown): value is TreeItem {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function treeItems(value: unknown): TreeItem[] {
	return Array.isArray(value) ? value.filter(isItem) : []
}

/** The items as the lines of a list, each item's own under it. */
export function treeRows(items: unknown, depth = 0, at: number[] = []): TreeRow[] {
	const list = treeItems(items)
	return list.flatMap((item, rank) => [
		{ path: [...at, rank], item, depth, siblings: list.length },
		...treeRows(item.children, depth + 1, [...at, rank]),
	])
}

/** A value for an item labelled `label`, which no sibling holds yet. */
export function itemValue(label: string, siblings: TreeItem[]): string {
	const base = keyFrom(label) ?? 'item'
	const taken = new Set(siblings.map((item) => item.value))
	let value = base
	for (let rank = 2; taken.has(value); rank += 1) {
		value = `${base}${rank}`
	}
	return value
}

/** Apply `edit` to the list that holds the item at `path`. */
function inList(
	items: unknown,
	path: number[],
	edit: (list: TreeItem[], at: number) => TreeItem[],
): TreeItem[] {
	const list = treeItems(items)
	const [first, ...rest] = path
	if (first === undefined) {
		return list
	}
	if (rest.length === 0) {
		return edit(list, first)
	}
	return list.map((item, at) =>
		at === first ? withChildren(item, inList(item.children, rest, edit)) : item,
	)
}

/** An item holding `children`, or none once the last is gone. */
function withChildren(item: TreeItem, children: TreeItem[]): TreeItem {
	const next: TreeItem = { ...item, children }
	if (!children.length) {
		delete next.children
	}
	return next
}

/**
 * The items with one more, labelled `label`, at the end of the tree or of the
 * item at `parent`.
 */
export function withItemAdded(
	items: unknown,
	parent: number[] | null,
	label: string,
): TreeItem[] {
	const append = (list: TreeItem[]): TreeItem[] => [
		...list,
		{ label, value: itemValue(label, list) },
	]
	if (!parent) {
		return append(treeItems(items))
	}
	return inList(items, parent, (list, at) =>
		list.map((item, index) =>
			index === at ? withChildren(item, append(treeItems(item.children))) : item,
		),
	)
}

/** The items with `patch` applied to the one at `path`. */
export function withItemPatched(
	items: unknown,
	path: number[],
	patch: Partial<TreeItem>,
): TreeItem[] {
	return inList(items, path, (list, at) =>
		list.map((item, index) => {
			if (index !== at) {
				return item
			}
			const next: TreeItem = { ...item }
			for (const [key, value] of Object.entries(patch)) {
				if (value === undefined) {
					delete next[key]
				} else {
					next[key] = value
				}
			}
			return next
		}),
	)
}

/** The items without the one at `path`, and what it held. */
export function withoutItem(items: unknown, path: number[]): TreeItem[] {
	return inList(items, path, (list, at) => list.filter((_, index) => index !== at))
}

/** The items with the one at `path` moved `delta` places among its siblings. */
export function withItemMoved(items: unknown, path: number[], delta: number): TreeItem[] {
	return inList(items, path, (list, at) => {
		const target = at + delta
		if (target < 0 || target >= list.length) {
			return list
		}
		const next = [...list]
		const [moved] = next.splice(at, 1)
		next.splice(target, 0, moved as TreeItem)
		return next
	})
}

/**
 * How the tree names the item at `path` when it says which start open: the
 * values from the top down to it, joined by dots, as the DMS builds the path of
 * every item it shows.
 */
export function itemPath(items: unknown, path: number[]): string | undefined {
	const values: string[] = []
	let list = treeItems(items)
	for (const rank of path) {
		const item = list[rank]
		if (!item?.value) {
			return undefined
		}
		values.push(item.value)
		list = treeItems(item.children)
	}
	return values.join('.')
}

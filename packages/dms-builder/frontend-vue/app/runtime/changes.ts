/**
 * The draft's unsaved changes, in the terms of the page: what was added,
 * removed, moved or edited, each one with what it was and what it is now, and
 * the way to put it back on its own.
 *
 * The draft keeps no record of how it got where it is — undo snapshots whole
 * drafts — so the changes are read off the difference between the page as it
 * was saved and the page as it is. A block is matched across the two by where
 * the author placed it, then by its name, then by its contents: the rows and
 * columns the editor writes around blocks come and go with every placement,
 * and a block that only changed rows has not moved for anyone looking at it.
 */
import { descriptorOf, isStructural, optionLabel } from './catalog'
import { cloneDraft, findNode, insertNode, joinPath, moveNode, removeNode, siblingsAt } from './draft'
import { blockKind, blockTitle } from './naming'
import type { AddQueryInput, BlockCatalog, BlockDraft, PageDraft } from './types'

/** Where a change shows in the list, by what it reaches. */
export type ChangeGroup = 'page' | 'menu' | 'data'
export type ChangeKind = 'added' | 'removed' | 'edited' | 'moved'

/** How one change is put back, applied to the draft as one edit. */
export type ChangeRevert =
	| { kind: 'remove-block'; path: string }
	| { kind: 'restore-block'; block: BlockDraft; parent: string | null; index: number }
	| { kind: 'move-block'; path: string; parent: string | null; index: number }
	| {
			kind: 'restore-option'
			path: string
			field: 'config' | 'meta'
			key: string
			value: unknown
	  }
	| { kind: 'restore-block-field'; path: string; field: 'controller' | 'slot'; value?: string }
	| { kind: 'restore-page'; key: string; value: unknown }
	| { kind: 'restore-query'; name: string; query?: AddQueryInput }

export interface DraftChange {
	id: string
	group: ChangeGroup
	kind: ChangeKind
	/** What changed, named as the page shows it: `Top customers · Title`. */
	title: string
	/** Where it is or what it is, under the title. */
	detail?: string
	before?: string
	after?: string
	/** The block to go to, when the change is about one still on the page. */
	path?: string
	revert: ChangeRevert
}

/** The page's own settings as they are saved, which a draft only overrides. */
export type SavedPage = Record<string, unknown>

/** The settings that place the page in the menu rather than describe it. */
const MENU_SETTINGS = new Set(['hidden', 'order'])

const PAGE_SETTING_LABELS: Record<string, string> = {
	displayName: 'Title',
	description: 'Description',
	icon: 'Icon',
	hidden: 'Shown in the menu',
	order: 'Position in the menu',
	permission: 'Who can see it',
}

const SUMMARY_LENGTH = 40

/** A value as a line of the list can hold it. */
export function summary(value: unknown): string {
	if (value === undefined || value === null || value === '') {
		return '—'
	}
	if (typeof value === 'boolean') {
		return value ? 'on' : 'off'
	}
	if (typeof value === 'string') {
		const short =
			value.length > SUMMARY_LENGTH ? `${value.slice(0, SUMMARY_LENGTH)}…` : value
		return `“${short}”`
	}
	if (typeof value === 'number') {
		return String(value)
	}
	if (Array.isArray(value)) {
		return `${value.length} item${value.length === 1 ? '' : 's'}`
	}
	const id = (value as Record<string, unknown>).id
	return typeof id === 'string' ? id : 'set'
}

function same(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

/** A block the author placed, with where they placed it. */
interface Placed {
	block: BlockDraft
	/** Its path in the draft, the editor's own rows and columns included. */
	path: string
	/** Its path counting only the blocks an author placed: what they see. */
	shown: string
	/** The shown path of the block holding it; null is the page. */
	holder: string | null
	/** Where it comes in the page, read top to bottom. */
	order: number
}

function placedBlocks(draft: PageDraft, catalog: BlockCatalog | null): Placed[] {
	const placed: Placed[] = []
	const walk = (
		blocks: BlockDraft[],
		parent: string | null,
		holder: string | null,
	): void => {
		for (const block of blocks) {
			const path = joinPath(parent, block.name)
			if (isStructural(catalog, block.type)) {
				walk(block.children ?? [], path, holder)
				continue
			}
			const shown = joinPath(holder, block.name)
			placed.push({ block, path, shown, holder, order: placed.length })
			walk(block.children ?? [], path, shown)
		}
	}
	walk(draft.blocks, null, null)
	return placed
}

/** A block without what it holds: its children are blocks of their own. */
function own(block: BlockDraft): BlockDraft {
	const { children: _children, ...rest } = block
	return rest
}

/**
 * Pair the blocks of the saved page with those of the draft: by where they
 * are, then by name, then by being the same block, untouched, somewhere else.
 */
function match(saved: Placed[], drafted: Placed[]): Map<Placed, Placed> {
	const pairs = new Map<Placed, Placed>()
	const free = new Set(drafted)
	const pass = (fits: (a: Placed, b: Placed) => boolean): void => {
		for (const before of saved) {
			if (pairs.has(before)) {
				continue
			}
			for (const after of free) {
				if (after.block.type === before.block.type && fits(before, after)) {
					pairs.set(before, after)
					free.delete(after)
					break
				}
			}
		}
	}
	pass((a, b) => a.shown === b.shown)
	pass((a, b) => a.block.name === b.block.name)
	pass((a, b) => same(own(a.block), own(b.block)))
	return pairs
}

/** The longest run of items both sequences keep in the same order. */
function keptInOrder<T>(left: T[], right: T[]): Set<T> {
	const table = left.map(() => right.map(() => 0))
	for (let i = left.length - 1; i >= 0; i--) {
		for (let j = right.length - 1; j >= 0; j--) {
			table[i]![j] =
				left[i] === right[j]
					? 1 + (table[i + 1]?.[j + 1] ?? 0)
					: Math.max(table[i + 1]?.[j] ?? 0, table[i]?.[j + 1] ?? 0)
		}
	}
	const kept = new Set<T>()
	let i = 0
	let j = 0
	while (i < left.length && j < right.length) {
		if (left[i] === right[j]) {
			kept.add(left[i]!)
			i++
			j++
		} else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
			i++
		} else {
			j++
		}
	}
	return kept
}

/** Where a block sits in its parent's list, for putting it back there. */
function slotOf(draft: PageDraft, path: string): { parent: string | null; index: number } {
	const cut = path.lastIndexOf('/')
	const parent = cut === -1 ? null : path.slice(0, cut)
	const siblings = siblingsAt(draft, parent) ?? []
	const index = siblings.findIndex((block) => block.name === path.slice(cut + 1))
	return { parent, index: Math.max(index, 0) }
}

function holderName(
	holder: string | null,
	placed: Placed[],
	catalog: BlockCatalog | null,
): string {
	if (holder === null) {
		return 'the page'
	}
	const found = placed.find((entry) => entry.shown === holder)
	return found ? blockTitle(found.block, catalog) : holder
}

function blockChanges(
	saved: PageDraft,
	draft: PageDraft,
	catalog: BlockCatalog | null,
): DraftChange[] {
	const before = placedBlocks(saved, catalog)
	const after = placedBlocks(draft, catalog)
	const pairs = match(before, after)
	const matched = new Set(pairs.values())
	const changes: DraftChange[] = []

	for (const entry of after) {
		if (matched.has(entry)) {
			continue
		}
		changes.push({
			id: `added:${entry.path}`,
			group: 'page',
			kind: 'added',
			title: `Added ${blockTitle(entry.block, catalog)}`,
			detail: `${blockKind(entry.block, catalog)} · in ${holderName(entry.holder, after, catalog)}`,
			path: entry.path,
			revert: { kind: 'remove-block', path: entry.path },
		})
	}

	// Among the blocks still held where they were, those whose place among the
	// others changed: what stays in order is the longest run the two keep.
	const reordered = new Set<Placed>()
	const holders = new Set(before.map((entry) => entry.holder))
	for (const holder of holders) {
		const savedOrder = before.filter((entry) => {
			const now = pairs.get(entry)
			return entry.holder === holder && !!now && sameHolder(entry, now, pairs, before)
		})
		const draftOrder = [...savedOrder].sort(
			(a, b) => (pairs.get(a)?.order ?? 0) - (pairs.get(b)?.order ?? 0),
		)
		const kept = keptInOrder(savedOrder, draftOrder)
		for (const entry of savedOrder) {
			if (!kept.has(entry)) {
				reordered.add(entry)
			}
		}
	}

	for (const entry of before) {
		const now = pairs.get(entry)
		const name = blockTitle(entry.block, catalog)
		if (!now) {
			const { parent, index } = slotOf(saved, entry.path)
			changes.push({
				id: `removed:${entry.path}`,
				group: 'page',
				kind: 'removed',
				title: `Removed ${name}`,
				detail: blockKind(entry.block, catalog),
				revert: { kind: 'restore-block', block: cloneDraft(entry.block), parent, index },
			})
			continue
		}
		const movedOut = !sameHolder(entry, now, pairs, before)
		if (movedOut || reordered.has(entry)) {
			const { parent, index } = slotOf(saved, entry.path)
			changes.push({
				id: `moved:${now.path}`,
				group: 'page',
				kind: 'moved',
				title: `Moved ${blockTitle(now.block, catalog)}`,
				detail: movedOut
					? `${holderName(entry.holder, before, catalog)} → ${holderName(now.holder, after, catalog)}`
					: `within ${holderName(now.holder, after, catalog)}`,
				path: now.path,
				revert: { kind: 'move-block', path: now.path, parent, index },
			})
		}
		changes.push(...editsOf(entry.block, now, catalog))
	}
	return changes
}

/** Whether a block is still held by the same block it was. */
function sameHolder(
	before: Placed,
	after: Placed,
	pairs: Map<Placed, Placed>,
	saved: Placed[],
): boolean {
	if (before.holder === null || after.holder === null) {
		return before.holder === after.holder
	}
	const savedHolder = saved.find((entry) => entry.shown === before.holder)
	const pairedHolder = savedHolder ? pairs.get(savedHolder) : undefined
	return pairedHolder?.shown === after.holder
}

function editsOf(
	before: BlockDraft,
	now: Placed,
	catalog: BlockCatalog | null,
): DraftChange[] {
	const after = now.block
	const name = blockTitle(after, catalog)
	const schema = descriptorOf(catalog, after.type)?.config ?? {}
	const changes: DraftChange[] = []
	const edit = (
		id: string,
		label: string,
		from: unknown,
		to: unknown,
		revert: ChangeRevert,
	): void => {
		changes.push({
			id: `edited:${now.path}:${id}`,
			group: 'page',
			kind: 'edited',
			title: `${name} · ${label}`,
			before: summary(from),
			after: summary(to),
			path: now.path,
			revert,
		})
	}
	const keys = new Set([
		...Object.keys(before.config ?? {}),
		...Object.keys(after.config ?? {}),
	])
	for (const key of keys) {
		const option = schema[key]
		// A key the simple mode derives follows the option it is derived from.
		if (option?.ui?.derivedFrom) {
			continue
		}
		const from = before.config?.[key]
		const to = after.config?.[key]
		if (!same(from, to)) {
			// Unset reads as what the block does without it: its default.
			const shown = (value: unknown): unknown => value ?? option?.default
			edit(key, option ? optionLabel(key, option) : key, shown(from), shown(to), {
				kind: 'restore-option',
				path: now.path,
				field: 'config',
				key,
				value: from,
			})
		}
	}
	const metaKeys = new Set([
		...Object.keys(before.meta ?? {}),
		...Object.keys(after.meta ?? {}),
	])
	for (const key of metaKeys) {
		const from = before.meta?.[key]
		const to = after.meta?.[key]
		if (!same(from, to)) {
			edit(`meta.${key}`, key === 'colSpan' ? 'Width' : key, from, to, {
				kind: 'restore-option',
				path: now.path,
				field: 'meta',
				key,
				value: from,
			})
		}
	}
	if (before.controller !== after.controller) {
		edit('controller', 'Table', before.controller, after.controller, {
			kind: 'restore-block-field',
			path: now.path,
			field: 'controller',
			value: before.controller,
		})
	}
	if (before.slot !== after.slot) {
		edit('slot', 'Tab', before.slot, after.slot, {
			kind: 'restore-block-field',
			path: now.path,
			field: 'slot',
			value: before.slot,
		})
	}
	return changes
}

function pageChanges(
	saved: PageDraft,
	draft: PageDraft,
	savedPage: SavedPage,
): DraftChange[] {
	const keys = new Set([
		...Object.keys(saved.page ?? {}),
		...Object.keys(draft.page ?? {}),
	])
	const changes: DraftChange[] = []
	for (const key of keys) {
		const from = saved.page && key in saved.page ? saved.page[key] : savedPage[key]
		const to = draft.page && key in draft.page ? draft.page[key] : from
		if (same(from, to)) {
			continue
		}
		const shown = key === 'hidden'
		changes.push({
			id: `page:${key}`,
			group: MENU_SETTINGS.has(key) ? 'menu' : 'page',
			kind: 'edited',
			title: `Page · ${PAGE_SETTING_LABELS[key] ?? key}`,
			before: shown ? (from ? 'hidden' : 'shown') : summary(from),
			after: shown ? (to ? 'hidden' : 'shown') : summary(to),
			revert: {
				kind: 'restore-page',
				key,
				value: saved.page && key in saved.page ? saved.page[key] : undefined,
			},
		})
	}
	return changes
}

function queryChanges(
	saved: AddQueryInput[],
	draft: PageDraft,
): DraftChange[] {
	if (!draft.queries) {
		return []
	}
	const changes: DraftChange[] = []
	const was = new Map(saved.map((query) => [query.name, query]))
	const now = new Map(draft.queries.map((query) => [query.name, query]))
	for (const [name, query] of now) {
		const before = was.get(name)
		if (!before) {
			changes.push({
				id: `query:+:${name}`,
				group: 'data',
				kind: 'added',
				title: `Added data source ${name}`,
				detail: `from ${query.resource}`,
				revert: { kind: 'restore-query', name },
			})
		} else if (!same(before, query)) {
			changes.push({
				id: `query:~:${name}`,
				group: 'data',
				kind: 'edited',
				title: `Data source ${name}`,
				detail: `from ${query.resource}`,
				revert: { kind: 'restore-query', name, query: before },
			})
		}
	}
	for (const [name, query] of was) {
		if (!now.has(name)) {
			changes.push({
				id: `query:-:${name}`,
				group: 'data',
				kind: 'removed',
				title: `Removed data source ${name}`,
				detail: `from ${query.resource}`,
				revert: { kind: 'restore-query', name, query },
			})
		}
	}
	return changes
}

/**
 * Every unsaved change of the draft, against the page as saved.
 *
 * `savedPage` is the page's own settings as they were read, which the saved
 * draft does not repeat; `savedQueries` the data sources the page serves.
 */
export function draftChanges(
	saved: PageDraft | null,
	draft: PageDraft | null,
	catalog: BlockCatalog | null,
	savedPage: SavedPage = {},
	savedQueries: AddQueryInput[] = [],
): DraftChange[] {
	if (!saved || !draft || same(saved, draft)) {
		return []
	}
	return [
		...blockChanges(saved, draft, catalog),
		...pageChanges(saved, draft, savedPage),
		...queryChanges(saved.queries ?? savedQueries, draft),
	]
}

/** Put one change back, on a draft about to become the next one. */
export function revertChange(
	draft: PageDraft,
	revert: ChangeRevert,
	savedQueries: AddQueryInput[] = [],
): void {
	switch (revert.kind) {
		case 'remove-block':
			removeNode(draft, revert.path)
			return
		case 'restore-block': {
			const parent =
				revert.parent === null || findNode(draft, revert.parent)
					? revert.parent
					: null
			const siblings = siblingsAt(draft, parent) ?? []
			insertNode(
				draft,
				parent,
				Math.min(revert.index, siblings.length),
				cloneDraft(revert.block),
			)
			return
		}
		case 'move-block': {
			const parent =
				revert.parent === null || findNode(draft, revert.parent)
					? revert.parent
					: null
			const siblings = siblingsAt(draft, parent) ?? []
			moveNode(draft, revert.path, parent, Math.min(revert.index, siblings.length))
			return
		}
		case 'restore-option': {
			const block = findNode(draft, revert.path)
			if (!block) {
				return
			}
			const target = { ...(block[revert.field] ?? {}) }
			if (revert.value === undefined) {
				delete target[revert.key]
			} else {
				target[revert.key] = cloneDraft(revert.value)
			}
			block[revert.field] = target
			return
		}
		case 'restore-block-field': {
			const block = findNode(draft, revert.path)
			if (!block) {
				return
			}
			if (revert.value === undefined) {
				delete block[revert.field]
			} else {
				block[revert.field] = revert.value
			}
			return
		}
		case 'restore-page': {
			const page = { ...(draft.page ?? {}) }
			if (revert.value === undefined) {
				delete page[revert.key]
			} else {
				page[revert.key] = cloneDraft(revert.value)
			}
			draft.page = page
			return
		}
		case 'restore-query': {
			const queries = (draft.queries ?? savedQueries).filter(
				(query) => query.name !== revert.name,
			)
			draft.queries = revert.query ? [...queries, cloneDraft(revert.query)] : queries
		}
	}
}

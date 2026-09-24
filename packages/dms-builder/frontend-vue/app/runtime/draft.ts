import { descriptorOf, isStructural, slotIdFor, suggestedName } from './catalog'
import type {
	BlockCatalog,
	BlockDraft,
	BlockNode,
	PageDraft,
	PageStructure,
} from './types'

/** A block's address inside a draft: the `.child()` ids joined by `/`. */
export function joinPath(parent: string | null, name: string): string {
	return parent ? `${parent}/${name}` : name
}

export function parentPath(path: string): string | null {
	const cut = path.lastIndexOf('/')
	return cut === -1 ? null : path.slice(0, cut)
}

export function leafName(path: string): string {
	const cut = path.lastIndexOf('/')
	return cut === -1 ? path : path.slice(cut + 1)
}

export function cloneDraft<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

/**
 * A block the builder cannot rewrite is carried through by name; everything
 * else round-trips as data.
 */
function nodeToDraft(node: BlockNode): BlockDraft {
	if (!node.editable || !node.type) {
		// Only the value is opaque: where the block sits is still ours to write,
		// so its slot and child metadata travel with it.
		return {
			name: node.name,
			preserve: true,
			...(node.slot ? { slot: node.slot } : {}),
			...(node.meta ? { meta: node.meta } : {}),
			...(node.opaqueReason ? { opaqueReason: node.opaqueReason } : {}),
		}
	}
	return {
		name: node.name,
		type: node.type,
		config: node.config ?? {},
		...(node.slot ? { slot: node.slot } : {}),
		...(node.meta ? { meta: node.meta } : {}),
		...(node.controller ? { controller: node.controller } : {}),
		...(node.children?.length
			? { children: node.children.map(nodeToDraft) }
			: {}),
	}
}

export function structureToDraft(structure: PageStructure): PageDraft {
	return { blocks: structure.blocks.map(nodeToDraft) }
}

export function siblingsAt(
	draft: PageDraft,
	path: string | null,
): BlockDraft[] | undefined {
	if (path === null) {
		return draft.blocks
	}
	const parent = findNode(draft, path)
	if (!parent) {
		return undefined
	}
	parent.children ??= []
	return parent.children
}

export function findNode(
	draft: PageDraft,
	path: string,
): BlockDraft | undefined {
	let current: BlockDraft | undefined
	let list: BlockDraft[] | undefined = draft.blocks
	for (const part of path.split('/')) {
		current = list?.find((block) => block.name === part)
		if (!current) {
			return undefined
		}
		list = current.children
	}
	return current
}

/**
 * The block a validation pointer addresses, as a draft path:
 * `/blocks/0/children/1/type` answers `grid/text`.
 *
 * The module reports where an issue sits by index into the draft it was sent;
 * the editor never shows those indexes, and the block's name is what the user
 * can act on. Anything past the last block — `/type`, `/config/…` — belongs to
 * the block resolved so far, so the walk stops there.
 */
export function pathForPointer(
	draft: PageDraft,
	pointer: string,
): string | undefined {
	const parts = pointer.split('/').filter((part) => part.length > 0)
	if (parts.shift() !== 'blocks') {
		return undefined
	}
	let siblings: BlockDraft[] | undefined = draft.blocks
	let path: string | null = null
	while (siblings) {
		const index = Number(parts.shift())
		const block: BlockDraft | undefined = Number.isInteger(index)
			? siblings[index]
			: undefined
		if (!block) {
			return path ?? undefined
		}
		path = joinPath(path, block.name)
		if (parts.shift() !== 'children') {
			return path
		}
		siblings = block.children
	}
	return path ?? undefined
}

export function uniqueName(siblings: BlockDraft[], base: string): string {
	const taken = new Set(siblings.map((block) => block.name))
	if (!taken.has(base)) {
		return base
	}
	let index = 2
	while (taken.has(`${base}${index}`)) {
		index += 1
	}
	return `${base}${index}`
}

export function insertNode(
	draft: PageDraft,
	parent: string | null,
	index: number | null,
	node: BlockDraft,
): string | undefined {
	const siblings = siblingsAt(draft, parent)
	if (!siblings) {
		return undefined
	}
	node.name = uniqueName(siblings, node.name)
	siblings.splice(index ?? siblings.length, 0, node)
	return joinPath(parent, node.name)
}

export function removeNode(draft: PageDraft, path: string): boolean {
	const siblings = siblingsAt(draft, parentPath(path))
	if (!siblings) {
		return false
	}
	const index = siblings.findIndex((block) => block.name === leafName(path))
	if (index === -1) {
		return false
	}
	siblings.splice(index, 1)
	return true
}

export function moveNode(
	draft: PageDraft,
	path: string,
	destParent: string | null,
	destIndex: number,
): string | undefined {
	const source = siblingsAt(draft, parentPath(path))
	const index = source?.findIndex((block) => block.name === leafName(path))
	if (!source || index === undefined || index === -1) {
		return undefined
	}
	// Moving a block into its own subtree would detach the tree from the page.
	if (destParent !== null && (destParent === path || destParent.startsWith(`${path}/`))) {
		return undefined
	}
	const node = source[index]
	if (!node) {
		return undefined
	}
	source.splice(index, 1)
	const target = siblingsAt(draft, destParent)
	if (!target) {
		source.splice(index, 0, node)
		return undefined
	}
	// `destIndex` addresses the list as the caller saw it, before the node was
	// lifted out; dropping below its own position therefore shifts by one.
	const sameParent = parentPath(path) === destParent
	const shifted = sameParent && index < destIndex ? destIndex - 1 : destIndex
	const clamped = Math.max(0, Math.min(shifted, target.length))
	if (!sameParent) {
		node.name = uniqueName(target, node.name)
	}
	target.splice(clamped, 0, node)
	return joinPath(destParent, node.name)
}

export function duplicateNode(
	draft: PageDraft,
	path: string,
): string | undefined {
	const siblings = siblingsAt(draft, parentPath(path))
	const index = siblings?.findIndex((block) => block.name === leafName(path))
	if (!siblings || index === undefined || index === -1) {
		return undefined
	}
	const original = siblings[index]
	// A preserved block is identified by its name on disk; a copy would match
	// nothing, so there is nothing to duplicate.
	if (!original || original.preserve) {
		return undefined
	}
	const copy = cloneDraft(original)
	copy.name = uniqueName(siblings, copy.name)
	siblings.splice(index + 1, 0, copy)
	return joinPath(parentPath(path), copy.name)
}

export function renameNode(
	draft: PageDraft,
	path: string,
	name: string,
): string | undefined {
	const siblings = siblingsAt(draft, parentPath(path))
	const node = findNode(draft, path)
	if (!siblings || !node) {
		return undefined
	}
	const others = siblings.filter((block) => block !== node)
	node.name = uniqueName(others, name)
	return joinPath(parentPath(path), node.name)
}

export function walkDraft(
	blocks: BlockDraft[],
	visit: (block: BlockDraft, path: string) => void,
	parent: string | null = null,
): void {
	for (const block of blocks) {
		const path = joinPath(parent, block.name)
		visit(block, path)
		if (block.children?.length) {
			walkDraft(block.children, visit, path)
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A value the engine hands over to be written back exactly as it read it — a
 * reference it cannot inline, a data type. Naming anything inside one would
 * change what it re-emits, so it is left alone whatever it is missing.
 */
function isSentinel(entry: Record<string, unknown>): boolean {
	return Object.keys(entry).some((key) => key.startsWith('$'))
}

/**
 * Name the regions of every container that holds its children through its own
 * options, for the ones nobody has named.
 *
 * Adding a tab is giving it a title, and that is all an author should have to
 * do; the id its children attach to is the editor's, the way the name of a
 * block is. Left out, it reaches the engine as a page whose own type refuses to
 * compile, and the author is answered with a compiler error about a property no
 * panel ever showed them.
 *
 * Only a region that has never been named is given one: an author clearing a
 * title to type another must not have one written back under their cursor, and
 * an id that already exists is what the children are attached by.
 */
export function nameSlots(draft: PageDraft, catalog: BlockCatalog | null): void {
	if (!catalog) {
		return
	}
	walkDraft(draft.blocks, (block) => {
		const dynamic = descriptorOf(catalog, block.type)?.dynamicSlots
		const entries = dynamic
			? (block.config ?? {})[dynamic.optionPath]
			: undefined
		if (!dynamic || !Array.isArray(entries)) {
			return
		}
		const taken = new Set(
			entries
				.filter(isRecord)
				.map((entry) => entry[dynamic.idKey])
				.filter((id): id is string => typeof id === 'string' && id !== ''),
		)
		const kind = block.type ?? 'slot'
		entries.forEach((entry, index) => {
			const current = isRecord(entry) ? entry[dynamic.idKey] : undefined
			if (
				!isRecord(entry) ||
				isSentinel(entry) ||
				(typeof current === 'string' && current !== '')
			) {
				return
			}
			const rank = index + 1
			const labelKey = dynamic.labelKey
			// The id follows the title the author gave. One the editor invented
			// says nothing worth reading back, so that case takes the plain rank.
			const authored = labelKey ? entry[labelKey] : undefined
			if (labelKey && !authored) {
				entry[labelKey] = `${kind} ${rank}`
			}
			const id = slotIdFor(authored, `${suggestedName(kind)}${rank}`, taken)
			entry[dynamic.idKey] = id
			taken.add(id)
		})
	})
}

/**
 * How many blocks the page holds, as its author counts them.
 *
 * The layout the editor writes is not counted: nobody placed it, and a page of
 * two cards side by side is two blocks, not four.
 */
export function countBlocks(draft: PageDraft, catalog: BlockCatalog | null): number {
	let total = 0
	walkDraft(draft.blocks, (block) => {
		if (!isStructural(catalog, block.type)) {
			total += 1
		}
	})
	return total
}

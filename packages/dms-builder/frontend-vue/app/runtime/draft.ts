import type { BlockDraft, BlockNode, PageDraft, PageStructure } from './types'

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

export function countBlocks(draft: PageDraft): number {
	let total = 0
	walkDraft(draft.blocks, () => {
		total += 1
	})
	return total
}

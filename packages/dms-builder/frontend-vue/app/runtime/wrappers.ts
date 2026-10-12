/**
 * The wrappers the editor writes around what an author places, so that nobody
 * has to place one: a section's rows, and the guard showing a message instead
 * of a container's content when a source says there is nothing.
 *
 * A section lays its content out as rows — a label beside a control — and a row
 * holds one control. An author drops a meter into a section; the editor writes
 * the row around it, the row's label one of the meter's settings. A form, a list,
 * a table or a notice is the section's content as it is.
 *
 * A guard sits inside the container it guards, around all of that container's
 * content — a card's body, a section's rows, one tab of a tab set — so the frame
 * and its title stay and only what they hold gives way to the message. A block
 * dropped into a guarded container lands in its guard.
 *
 * Both are read after every edit, like the layout, and only where the edit
 * reached: a page written by hand stays as written wherever nobody touched it.
 */
import { descriptorOf } from './catalog'
import { FIELD_ROW, GUARD_BLOCK, ROW_CONTROLS, SECTION_BLOCK } from './constants'
import { findNode, joinPath, parentPath, uniqueName } from './draft'
import { blockKind } from './naming'
import type { BlockCatalog, BlockDraft, PageDraft } from './types'

/** Whether a block goes into a section in a row of its own: a control does. */
export function needsRow(block: BlockDraft): boolean {
	return !block.preserve && ROW_CONTROLS.has(block.type ?? '')
}

/** The children of a container showing in one of its regions; `undefined` is its body. */
function inRegion(block: BlockDraft, region: string | undefined): BlockDraft[] {
	return (block.children ?? []).filter((child) => child.slot === region)
}

/**
 * The guard holding the whole of a container's region, if it has one: the
 * region's only child, a guard.
 */
export function contentGuard(
	block: BlockDraft | undefined,
	region?: string,
): BlockDraft | undefined {
	const content = block ? inRegion(block, region) : []
	return content.length === 1 && content[0]?.type === GUARD_BLOCK ? content[0] : undefined
}

/** The list a section's rows are in: its own children, or its guard's. */
function rowsOf(section: BlockDraft): BlockDraft[] | undefined {
	return contentGuard(section)?.children ?? section.children
}

/** The block a wrapper stands for: a row's block, a guard's container. */
export function ownerOf(
	draft: PageDraft,
	path: string,
): string | null {
	const block = findNode(draft, path)
	if (block?.type === FIELD_ROW) {
		const child = block.children?.[0]
		return child ? joinPath(path, child.name) : parentPath(path)
	}
	if (block?.type === GUARD_BLOCK) {
		return parentPath(path)
	}
	return path
}

function rowAround(
	catalog: BlockCatalog | null,
	block: BlockDraft,
	siblings: BlockDraft[],
): BlockDraft {
	return {
		name: uniqueName(siblings, `${block.name}Row`),
		type: FIELD_ROW,
		config: { label: blockKind(block, catalog) },
		children: [block],
	}
}

/**
 * A section's rows after an edit: a block that arrived in it gets a row, a row
 * left with nothing goes, and a row handed a second block — dropped above or
 * below the one it holds — splits in two.
 */
function tidyRows(
	catalog: BlockCatalog | null,
	rows: BlockDraft[],
	before: BlockDraft[],
): BlockDraft[] {
	const known = new Map(before.map((row) => [row.name, row]))
	const tidied: BlockDraft[] = []
	const taken = (): BlockDraft[] => [...tidied, ...rows]
	for (const block of rows) {
		if (block.type !== FIELD_ROW) {
			tidied.push(
				needsRow(block) && !known.has(block.name)
					? rowAround(catalog, block, taken())
					: block,
			)
			continue
		}
		const held = block.children ?? []
		const was = known.get(block.name)
		if (held.length === 0) {
			// Emptied by this edit; one written empty is left as written.
			if (!was || (was.children?.length ?? 0) > 0) {
				continue
			}
		}
		// The row keeps the block it held, and its label with it; a block
		// dropped above or below that one gets a row of its own there.
		const kept =
			held.find((child) => child.name === was?.children?.[0]?.name) ?? held[0]
		const at = kept ? held.indexOf(kept) : 0
		const own = (extra: BlockDraft): BlockDraft =>
			needsRow(extra) ? rowAround(catalog, extra, taken()) : extra
		tidied.push(...held.slice(0, at).map(own))
		block.children = kept ? [kept] : []
		tidied.push(block)
		tidied.push(...held.slice(at + 1).map(own))
	}
	return tidied
}

/**
 * A guarded region after an edit: whatever arrived beside its guard goes into
 * it, in the order it stands in; a guard emptied by the edit goes with it.
 */
function tidyGuard(container: BlockDraft, previous: BlockDraft, region: string | undefined): void {
	const was = contentGuard(previous, region)
	if (!was) {
		return
	}
	const children = container.children ?? []
	const guard = children.find((child) => child.type === GUARD_BLOCK && child.name === was.name)
	if (!guard || guard.slot !== region) {
		return
	}
	const at = children.indexOf(guard)
	const arrived = children.filter((child) => child !== guard && child.slot === region)
	if (arrived.length > 0) {
		const before = arrived.filter((child) => children.indexOf(child) < at)
		const after = arrived.filter((child) => children.indexOf(child) > at)
		const held = guard.children ?? []
		for (const child of arrived) {
			delete child.slot
			child.name = uniqueName(
				[...held, ...arrived.filter((other) => other !== child)],
				child.name,
			)
		}
		guard.children = [...before, ...held, ...after]
		container.children = children.filter((child) => !arrived.includes(child))
	}
	if ((guard.children?.length ?? 0) === 0 && (was.children?.length ?? 0) > 0) {
		container.children = (container.children ?? []).filter((child) => child !== guard)
	}
}

/** The regions a container has children in, its body included. */
function regionsOf(block: BlockDraft): Array<string | undefined> {
	return [...new Set([undefined, ...(block.children ?? []).map((child) => child.slot)])]
}

/**
 * Put the wrappers back to what the edit leaves them needing. Only the blocks
 * standing where they stood before the edit are read: a section moved
 * elsewhere keeps its content as it was, written by hand or not.
 */
export function tidyWrappers(
	draft: PageDraft,
	catalog: BlockCatalog | null,
	previous: PageDraft | null,
): void {
	if (!previous) {
		return
	}
	const visit = (blocks: BlockDraft[], parent: string | null): void => {
		for (const block of blocks) {
			const path = joinPath(parent, block.name)
			const was = findNode(previous, path)
			if (was && was.type === block.type && block.children) {
				for (const region of regionsOf(block)) {
					tidyGuard(block, was, region)
				}
				// Rows only where the DMS has them: an older one does not.
				if (block.type === SECTION_BLOCK && descriptorOf(catalog, FIELD_ROW)) {
					const rows = rowsOf(block)
					const holder = contentGuard(block) ?? block
					if (rows) {
						holder.children = tidyRows(catalog, rows, rowsOf(was) ?? [])
					}
				}
			}
			visit(block.children ?? [], path)
		}
	}
	visit(draft.blocks, null)
}

/**
 * Guard a container's region: its content moves into a guard of its own, which
 * shows it unless a source says there is nothing. Nothing to guard, no guard.
 */
export function guardContent(
	draft: PageDraft,
	path: string,
	region?: string,
	config: Record<string, unknown> = {},
): boolean {
	const container = findNode(draft, path)
	const content = container ? inRegion(container, region) : []
	if (!container || content.length === 0 || contentGuard(container, region)) {
		return false
	}
	const children = container.children ?? []
	const guard: BlockDraft = {
		name: uniqueName(children, region ? `${region}Guard` : 'guard'),
		type: GUARD_BLOCK,
		config: { when: 'empty', ...config },
		children: content,
	}
	for (const child of content) {
		delete child.slot
	}
	if (region !== undefined) {
		guard.slot = region
	}
	const at = children.indexOf(content[0] as BlockDraft)
	container.children = children.filter((child) => !content.includes(child))
	container.children.splice(at, 0, guard)
	return true
}

/** Take a region's guard off: what it held goes back where it stood. */
export function unguardContent(draft: PageDraft, path: string, region?: string): boolean {
	const container = findNode(draft, path)
	const guard = contentGuard(container, region)
	if (!container || !guard) {
		return false
	}
	const children = container.children ?? []
	const taken = children.filter((child) => child !== guard)
	const held = (guard.children ?? []).map((child) => {
		child.name = uniqueName(taken, child.name)
		taken.push(child)
		if (region !== undefined) {
			child.slot = region
		}
		return child
	})
	const at = children.indexOf(guard)
	container.children = [...children.slice(0, at), ...held, ...children.slice(at + 1)]
	return true
}

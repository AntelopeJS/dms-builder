import { descriptorOf, newBlockDraft, shownRegion, slotsOf } from './catalog'
import {
	COLUMN_CONTAINER,
	FIELD_ROW,
	PAGE_TOOLBAR,
	ROW_WRAPPER,
} from './constants'
import {
	draggedType,
	isRowContainer,
	refusalForDrop,
	wrapperFor,
	type DropPlacement,
	type DropWrap,
} from './dropping'
import { blockTitle } from './naming'
import { t } from './i18n'
import { seedPageToolbar } from './page-controls'
import {
	cloneDraft,
	duplicateNode,
	findNode,
	insertNode,
	joinPath,
	leafName,
	moveNode,
	parentPath,
	removeNode,
	siblingsAt,
} from './draft'
import type { BlockDraft, PageDraft } from './types'
import {
	PAGE_LAYOUTS,
	type PageLayout,
	type Placement,
	type SessionCore,
} from './session-model'
import type { createDerived } from './session-derived'
import type { createHistory } from './session-history'
import type { createNavigation } from './session-navigation'

export function createBlocks(scope: SessionCore & ReturnType<typeof createDerived> & ReturnType<typeof createHistory> & ReturnType<typeof createNavigation>) {
	const { session, paletteTarget, openSlot, handOverPlacement, handOverSpan, linesForSpacer, nameOnPage, placedAt, rankOf, notify, mutate, select, endDrag } = scope

	function refusalAt(parent: string | null, type?: string): string | undefined {
		return refusalTo({ parent }, type)
	}

	function refusalTo(
		placement: DropPlacement,
		type?: string,
		moving?: string,
	): string | undefined {
		return refusalForDrop(
			session.value.catalog,
			session.value.draft,
			placement,
			type,
			moving,
		)
	}

	/**
	 * Put a block in one of its container's slots when that is the only way it
	 * renders.
	 *
	 * A tab set holds its children through the slots its own options declare, and
	 * a child carrying none is laid out nowhere: dropped into it, a block would
	 * simply disappear from the page until someone assigned it a tab by hand. It
	 * takes the first slot instead, and the first slot is created for it when the
	 * container has none yet.
	 */
	function adoptSlot(
		draft: PageDraft,
		parent: string | null,
		node: BlockDraft,
	): void {
		const container = parent === null ? undefined : findNode(draft, parent)
		const descriptor = descriptorOf(session.value.catalog, container?.type)
		const slots = slotsOf(descriptor, container)
		if (node.slot && slots.some((slot) => slot.id === node.slot)) {
			return
		}
		const dynamic = descriptor?.dynamicSlots
		if (!container || !dynamic) {
			// Anywhere else the container renders its children itself, and a slot
			// left over from where the block came from would hide it.
			delete node.slot
			return
		}
		const shown = shownRegion(
			descriptor,
			container,
			session.value.openRegions[parent ?? ''],
		)
		node.slot = (shown ?? openSlot(container, dynamic)).id
	}

	/**
	 * The container a block really lands in: the one aimed at, or the child that
	 * container builds around it when it holds nothing else.
	 *
	 * A Grid holds rows and the user aims a card at it; creating the row as part
	 * of the same gesture is the whole difference between a grid and a stack. The
	 * row is inserted through `insertNode`, so its name is free of the ones its
	 * siblings already took.
	 */
	function hostFor(
		draft: PageDraft,
		placement: Placement,
		type: string | undefined,
		wrap?: DropWrap,
	): Placement {
		const enclosed = wrap
			? wrap.type === ROW_WRAPPER
				? rowAround(draft, wrap)
				: stackAround(draft, wrap)
			: undefined
		if (enclosed) {
			return enclosed
		}
		const parent = placement.parent
		const container = parent === null ? undefined : findNode(draft, parent)
		const wrapper = wrapperFor(session.value.catalog, container?.type, type)
		if (!wrapper) {
			return placement
		}
		const created = insertNode(
			draft,
			parent,
			placement.index,
			newBlockDraft(wrapper),
		)
		return created ? { parent: created, index: null } : placement
	}

	/**
	 * Enclose a block that is already on the page, so the drop can stack with it.
	 *
	 * Pointing above or below one cell of a row asks for something the row cannot
	 * lay out: it puts its children side by side and nothing else. The cell moves
	 * into a column of its own instead, and the two blocks share it. The column
	 * inherits the span the cell claimed, or the row would re-measure itself and
	 * the layout would shift under a gesture that only added a block.
	 */
	function stackAround(draft: PageDraft, wrap: DropWrap): Placement | undefined {
		const descriptor = descriptorOf(session.value.catalog, wrap.type)
		const parent = parentPath(wrap.around)
		const siblings = siblingsAt(draft, parent)
		const at = siblings?.findIndex(
			(block) => block.name === leafName(wrap.around),
		)
		const enclosed = at === undefined || at === -1 ? undefined : siblings?.[at]
		if (!descriptor || !siblings || !enclosed || at === undefined) {
			return undefined
		}
		siblings.splice(at, 1)
		const column = newBlockDraft(descriptor)
		handOverSpan(enclosed, column)
		const created = insertNode(draft, parent, at, column)
		if (!created) {
			siblings.splice(at, 0, enclosed)
			return undefined
		}
		column.children = [enclosed]
		return { parent: created, index: wrap.index }
	}

	/**
	 * Build a row around a block that sits on its own, so the drop can go beside it.
	 *
	 * The block moves into the row where it stood, and the grid holding the row
	 * takes over what placed the block there — the region of a tab, the columns
	 * it spanned — or the layout around it would shift under a gesture that only
	 * added a block.
	 */
	function rowAround(draft: PageDraft, wrap: DropWrap): Placement | undefined {
		const grid = descriptorOf(session.value.catalog, wrap.type)
		const row = descriptorOf(session.value.catalog, grid?.allowedChildren?.[0])
		const parent = parentPath(wrap.around)
		const siblings = siblingsAt(draft, parent)
		const at = siblings?.findIndex(
			(block) => block.name === leafName(wrap.around),
		)
		const enclosed = at === undefined || at === -1 ? undefined : siblings?.[at]
		if (!grid || !row || !siblings || !enclosed || at === undefined) {
			return undefined
		}
		siblings.splice(at, 1)
		const gridDraft = newBlockDraft(grid)
		handOverPlacement(enclosed, gridDraft)
		const created = insertNode(draft, parent, at, gridDraft)
		if (!created) {
			siblings.splice(at, 0, enclosed)
			return undefined
		}
		const rowDraft = newBlockDraft(row)
		rowDraft.children = [enclosed]
		gridDraft.children = [rowDraft]
		return { parent: joinPath(created, rowDraft.name), index: wrap.index }
	}

	function addBlock(
		type: string,
		parent: string | null = null,
		index: number | null = null,
		wrap?: DropWrap,
	): void {
		const descriptor = descriptorOf(session.value.catalog, type)
		if (!descriptor) {
			return
		}
		// The rule is the catalog's own, and the module enforces it again on save:
		// applying the insertion and reporting it as added would be a lie the user
		// only hears about one round trip later.
		const refusal = refusalTo({ parent, wrap }, type)
		if (refusal) {
			notify(refusal)
			return
		}
		let node: BlockDraft | undefined
		mutate((draft) => {
			const host = hostFor(draft, { parent, index }, type, wrap)
			const placed = newBlockDraft(descriptor, rankOf(draft, type))
			placed.name = nameOnPage(draft, placed.name)
			adoptSlot(draft, host.parent, placed)
			linesForSpacer(draft, host.parent, placed)
			let at = host.index
			if (type === PAGE_TOOLBAR) {
				seedPageToolbar(draft, session.value.catalog, placed)
				// A page's toolbar is the first thing in its body: placed on the
				// page with no spot aimed at, that is where it goes.
				if (host.parent === null && index === null && !wrap) {
					at = 0
				}
			}
			if (insertNode(draft, host.parent, at, placed)) {
				node = placed
			}
		})
		const created = node && placedAt(node)
		if (created) {
			select(created)
			notify(t('toasts.block_added', { block: descriptor.label ?? descriptor.type }))
		}
	}

	/**
	 * Add a block next to the selection — below it, or beside it — the way the
	 * palette is used from the keyboard, where a drag is not on offer. With
	 * nothing selected, it goes where a click would put it.
	 *
	 * Beside a block already in a row is one more column of that row; below a
	 * cell of a row stacks the two in that column, as a drop there would.
	 */
	function addNextTo(type: string, beside = false): void {
		const path = session.value.selection
		const draft = session.value.draft
		if (!path || !draft) {
			addBlock(type, paletteTarget.value, null)
			return
		}
		const parent = parentPath(path)
		const holder = parent === null ? undefined : findNode(draft, parent)
		const inRow = isRowContainer(holder?.type)
		const siblings = siblingsAt(draft, parent) ?? []
		const at = siblings.findIndex((block) => block.name === leafName(path))
		if (beside) {
			if (inRow) {
				addBlock(type, parent, at + 1)
			} else {
				addBlock(type, parent, null, { around: path, type: ROW_WRAPPER, index: 1 })
			}
			return
		}
		if (inRow) {
			addBlock(type, parent, null, { around: path, type: COLUMN_CONTAINER, index: 1 })
			return
		}
		addBlock(type, parent, at === -1 ? null : at + 1)
	}

	/**
	 * Lay a starting layout on the page, as one edit: rows of blocks, a row of
	 * several placed side by side the way a drop beside a block places them.
	 * Types the project's DMS does not declare are left out.
	 */
	function applyLayout(layout: PageLayout): void {
		const catalog = session.value.catalog
		const rows = PAGE_LAYOUTS[layout]
			.map((row) => row.filter((type) => descriptorOf(catalog, type)))
			.filter((row) => row.length > 0)
		if (!rows.length) {
			return
		}
		mutate((draft) => {
			for (const row of rows) {
				let first: string | undefined
				let rowParent: string | null = null
				for (const [column, type] of row.entries()) {
					const descriptor = descriptorOf(catalog, type)
					if (!descriptor) {
						continue
					}
					let placement: Placement = { parent: null, index: null }
					if (first !== undefined && column === 1) {
						placement = hostFor(draft, placement, type, {
							around: first,
							type: ROW_WRAPPER,
							index: 1,
						})
						rowParent = placement.parent
					} else if (column > 1) {
						placement = { parent: rowParent, index: null }
					}
					const placed = newBlockDraft(descriptor, rankOf(draft, type))
					placed.name = nameOnPage(draft, placed.name)
					if (type === PAGE_TOOLBAR) {
						seedPageToolbar(draft, catalog, placed)
					}
					const path = insertNode(draft, placement.parent, placement.index, placed)
					first ??= path
				}
			}
		})
		notify(t('toasts.layout_added'), { undo: true })
	}

	function remove(path: string): void {
		const block = session.value.draft
			? findNode(session.value.draft, path)
			: undefined
		let removed = false
		mutate((draft) => {
			removed = removeNode(draft, path)
		})
		if (!removed) {
			return
		}
		if (session.value.selection === path) {
			select(null)
		}
		// Named, and undone from where it is said: one key took it away, so
		// one click brings it back.
		notify(
			block
				? t('toasts.removed', { block: blockTitle(block, session.value.catalog) })
				: t('toasts.block_removed'),
			{ undo: true },
		)
	}

	function duplicate(path: string): void {
		let node: BlockDraft | undefined
		mutate((draft) => {
			const created = duplicateNode(draft, path)
			node = created ? findNode(draft, created) : undefined
		})
		const created = node && placedAt(node)
		if (created) {
			select(created)
			notify(t('toasts.block_duplicated'))
		}
	}

	/**
	 * Tried on a copy first, and written back only once it worked.
	 *
	 * A move can need a container built for it — a row, or a column around the
	 * cell it lands under — and the draft can still turn the move itself down.
	 * Building on a copy is the only way that scaffolding leaves no trace when
	 * it does: the page must not read as edited by a gesture that changed
	 * nothing.
	 */
	function move(
		path: string,
		parent: string | null,
		index: number,
		wrap?: DropWrap,
	): void {
		const current = session.value.draft
		if (!current) {
			return
		}
		const trial = cloneDraft(current)
		const host = hostFor(trial, { parent, index }, findNode(trial, path)?.type, wrap)
		const moved = moveNode(trial, path, host.parent, host.index ?? 0)
		if (!moved) {
			return
		}
		const node = findNode(trial, moved)
		if (node) {
			adoptSlot(trial, host.parent, node)
		}
		mutate((draft) => {
			draft.blocks = trial.blocks
		})
		const landed = node ? placedAt(node) : undefined
		select(landed ?? moved)
	}

	function nudge(path: string, delta: number): void {
		const draft = session.value.draft
		if (!draft) {
			return
		}
		const parent = parentPath(path)
		// A control moves with its row, which is what its section lays out.
		if (parent !== null && findNode(draft, parent)?.type === FIELD_ROW) {
			nudge(parent, delta)
			return
		}
		const siblings = siblingsAt(draft, parent)
		if (!siblings) {
			return
		}
		const index = siblings.findIndex((block) => block.name === leafName(path))
		if (index === -1 || index + delta < 0 || index + delta >= siblings.length) {
			return
		}
		// `move` takes the index in the list as it stands now: stepping down means
		// landing after the next sibling, hence the extra one.
		move(path, parent, delta > 0 ? index + 2 : index - 1)
	}

	function drop(): void {
		const target = session.value.dropTarget
		if (!target) {
			endDrag()
			return
		}
		dropAt(target.parent, target.index, target.wrap)
	}

	/** Resolve a drop: a palette drag inserts, a block drag moves. */
	function dropAt(
		parent: string | null,
		index: number,
		wrap?: DropWrap,
	): void {
		const payload = session.value.dragging
		session.value.dragging = null
		session.value.dropTarget = null
		if (!payload) {
			return
		}
		const refusal = refusalTo(
			{ parent, wrap },
			draggedType(session.value.draft, payload),
			payload.path,
		)
		if (refusal) {
			notify(refusal)
			return
		}
		if (payload.path) {
			move(payload.path, parent, index, wrap)
			return
		}
		if (payload.type) {
			addBlock(payload.type, parent, index, wrap)
		}
	}
	return {
		refusalAt,
		refusalTo,
		adoptSlot,
		hostFor,
		stackAround,
		rowAround,
		addBlock,
		addNextTo,
		applyLayout,
		remove,
		duplicate,
		move,
		nudge,
		drop,
		dropAt,
	}
}

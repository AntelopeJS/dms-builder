import {
	sameTarget,
	targetAtBlock,
	targetAtPage,
	targetInside,
	type DragPayload,
	type DropTarget,
	type PointerBox,
} from './dropping'
import { ownerOf } from './wrappers'
import {
	LEFT_TABS,
	INSPECTOR_VIEWS,
	type RailView,
	type Workspace,
	type SessionCore,
} from './session-model'
import type { createDerived } from './session-derived'

export function createNavigation(scope: SessionCore & ReturnType<typeof createDerived>) {
	const { session, selected } = scope

	/**
	 * Select a block, or nothing. A block is configured in the inspector; with
	 * nothing selected the inspector says so, unless it was showing something
	 * other than a block — the page's settings stay open over a click on the
	 * canvas around the blocks.
	 */
	function select(path: string | null, view: RailView = 'config'): void {
		// A wrapper is selected through the block it wraps, whose panel holds
		// its settings: a row's block, a guard's container.
		const draft = session.value.draft
		session.value.selection = path && draft ? ownerOf(draft, path) : path
		if (path) {
			setView(view)
		}
	}

	/** Open a place of the editor, keeping whatever the others show. */
	function setView(view: RailView): void {
		session.value.menu = null
		switch (view) {
			case 'resource': {
				// Reached from a block that reads a table, the tables open on that
				// one; from anywhere else, on the list of them.
				const ref = selected.value?.controller
				session.value.table = ref ? { ref, tab: 'fields', adding: false } : null
				session.value.workspace = 'tables'
				return
			}
			case 'library':
			case 'layers':
			case 'pages':
				session.value.workspace = 'page'
				session.value.leftTab = LEFT_TABS[view]
				return
			default:
				session.value.workspace = 'page'
				session.value.inspector = INSPECTOR_VIEWS[view]
		}
	}

	/** Switch the bar's workspace, the page's own state left as it was. */
	function setWorkspace(workspace: Workspace): void {
		session.value.menu = null
		if (workspace === 'tables' && session.value.workspace !== 'tables') {
			setView('resource')
			return
		}
		session.value.workspace = workspace
	}

	function openTable(ref: string): void {
		setView('resource')
		session.value.table = { ref, tab: 'fields', adding: false }
	}

	/**
	 * Climb one step back: inside the tables, out of the field being added, then
	 * out of the table, then back to the page; on the page, from whatever the
	 * inspector was showing back to the selection.
	 */
	function back(): void {
		const table = session.value.table
		if (session.value.workspace === 'tables' && table) {
			session.value.table = table.adding ? { ...table, adding: false } : null
			return
		}
		if (session.value.workspace !== 'page') {
			session.value.workspace = 'page'
			return
		}
		session.value.inspector = 'block'
	}

	/**
	 * Record which of a container's own regions is on screen.
	 *
	 * Reported by the block itself as it renders — a tab set is the only
	 * container that hides part of what it holds, and it is the one that knows
	 * which part — so that a drop into it lands where the author is looking.
	 */
	function openRegion(path: string, slot: string): void {
		if (session.value.openRegions[path] === slot) {
			return
		}
		session.value.openRegions = { ...session.value.openRegions, [path]: slot }
	}

	function openMenu(path: string, x: number, y: number): void {
		select(path)
		session.value.menu = { path, x, y }
	}

	function closeMenu(): void {
		session.value.menu = null
	}

	function beginDrag(payload: DragPayload): void {
		session.value.dragging = payload
		session.value.dropTarget = null
	}

	function endDrag(): void {
		session.value.dragging = null
		session.value.dropTarget = null
	}

	function hover(path: string | null): void {
		session.value.hovered = path
	}

	/**
	 * Take note of where the pointer is aiming.
	 *
	 * `dragover` fires throughout the gesture, and the canvas draws itself from
	 * this answer: an unchanged one is not written back, so the page is not
	 * re-rendered dozens of times while the pointer sits still.
	 */
	function aim(target: DropTarget | null): void {
		if (!sameTarget(session.value.dropTarget, target)) {
			session.value.dropTarget = target
		}
	}

	function aimAt(path: string, box: PointerBox): void {
		const payload = session.value.dragging
		if (!payload) {
			return
		}
		aim(
			targetAtBlock(
				session.value.catalog,
				session.value.draft,
				payload,
				path,
				box,
			),
		)
	}

	function aimAtPage(): void {
		if (session.value.dragging) {
			aim(targetAtPage(session.value.draft))
		}
	}

	/**
	 * Aim at a container's own way in, and at the region offering it.
	 *
	 * Naming the region is what lets a tab set the preview has not built yet
	 * take a drop into the tab it is aimed at rather than into the first one:
	 * every region of such a set is on screen at once, so the pointer is the
	 * only thing that says which. A set the preview has built shows one region
	 * at a time and reports it itself, so this names the one already open.
	 */
	function aimInto(path: string, region?: string): void {
		if (!session.value.dragging) {
			return
		}
		if (region !== undefined) {
			openRegion(path, region)
		}
		aim(
			targetInside(
				session.value.catalog,
				session.value.draft,
				session.value.dragging,
				path,
			),
		)
	}
	return {
		select,
		setView,
		setWorkspace,
		openTable,
		back,
		openRegion,
		openMenu,
		closeMenu,
		beginDrag,
		endDrag,
		hover,
		aim,
		aimAt,
		aimAtPage,
		aimInto,
	}
}

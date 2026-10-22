/**
 * The controls a page needs for what its blocks do, placed by the editor
 * rather than looked for in the palette: the period selector the cards bound
 * to the page's period follow, and the Live / Pause switch of a live page.
 *
 * Both go into the page's toolbar, the bar first in its body that draws them
 * at one size beside the time the page last read its data: the one the page
 * has, or one the editor puts at its top, set as the DMS's `pageToolbar()`
 * sets them (the `initialChildren` of its `PageToolbar` type). A page
 * written before the toolbar keeps its controls where they are, and gets the next one
 * beside them.
 */
import { descriptorOf, newBlockDraft } from './catalog'
import {
	LIVE_TOGGLE,
	PAGE_PERIOD_SCOPE,
	PAGE_TOOLBAR,
	PERIOD_SELECTOR,
} from './constants'
import { uniqueName, walkDraft } from './draft'
import type { BlockCatalog, BlockDraft, BlockTypeDescriptor, PageDraft } from './types'

/**
 * The child `pageToolbar()` places for a control of this type: its id and the
 * options it sets, as the catalog's `PageToolbar` declares them.
 */
function toolbarChildOf(catalog: BlockCatalog | null, type: string) {
	return descriptorOf(catalog, PAGE_TOOLBAR)?.initialChildren?.find((child) => child.type === type)
}

/** Whether a block follows the page's own period, through its period option. */
function followsPagePeriod(block: BlockDraft, catalog: BlockCatalog | null): boolean {
	const descriptor = descriptorOf(catalog, block.type)
	return Object.values(descriptor?.config ?? {}).some((schema) => {
		const option = schema.ui?.periodOption
		return option !== undefined && block.config?.[option] === PAGE_PERIOD_SCOPE
	})
}

/** Whether a block is the selector driving the page's own period. */
function drivesPagePeriod(block: BlockDraft): boolean {
	if (block.type !== PERIOD_SELECTOR) {
		return false
	}
	const id = block.config?.id
	return id === undefined || id === PAGE_PERIOD_SCOPE
}

function isLiveToggle(block: BlockDraft): boolean {
	return block.type === LIVE_TOGGLE
}

function anyBlock(draft: PageDraft, test: (block: BlockDraft) => boolean): boolean {
	let found = false
	walkDraft(draft.blocks, (block) => {
		found ||= test(block)
	})
	return found
}

/**
 * Whether the source decides what a block holds: a block the engine cannot
 * rewrite, or one with options managed in code, whose children stay as written.
 */
function managedInCode(block: BlockDraft): boolean {
	return !!block.preserve || !!block.lockedOptions
}

/** The page's toolbar: the first one at its top level. */
export function pageToolbarOf(draft: PageDraft): BlockDraft | undefined {
	return draft.blocks.find((block) => block.type === PAGE_TOOLBAR)
}

/**
 * Where a control the editor places goes: into the page's toolbar, made at
 * the top of the page when it has none, or beside the controls of a page
 * laid out before the toolbar — a selector or a switch of its own at its top
 * level — whose author would not want a second bar.
 */
function placeControl(draft: PageDraft, catalog: BlockCatalog | null, control: BlockDraft): void {
	const toolbar = pageToolbarOf(draft)
	if (toolbar && !managedInCode(toolbar)) {
		addToToolbar(toolbar, control, catalog)
		return
	}
	const standalone = draft.blocks.some((block) => drivesPagePeriod(block) || isLiveToggle(block))
	if (toolbar || standalone) {
		placeStandalone(draft, control)
		return
	}
	// Every DMS this module supports declares the toolbar (interface-dms floor).
	const toolbarType = descriptorOf(catalog, PAGE_TOOLBAR)
	if (!toolbarType) {
		return
	}
	const created = newBlockDraft(toolbarType)
	created.name = uniqueName(draft.blocks, 'toolbar')
	addToToolbar(created, control, catalog)
	draft.blocks.unshift(created)
}

/**
 * A control in the toolbar, set and named as `pageToolbar()` sets and names
 * it. The switch goes before the selector: the toolbar orders them itself,
 * and the source reads in the order the bar shows.
 */
function addToToolbar(toolbar: BlockDraft, control: BlockDraft, catalog: BlockCatalog | null): void {
	const children = (toolbar.children ??= [])
	const placed = toolbarChildOf(catalog, control.type)
	control.name = uniqueName(children, placed?.id ?? control.name)
	control.config = { ...control.config, ...placed?.options }
	const selector = children.findIndex((child) => child.type === PERIOD_SELECTOR)
	const at = isLiveToggle(control) && selector !== -1 ? selector : children.length
	children.splice(at, 0, control)
}

/**
 * A control at the top level, as the editor placed it before the toolbar:
 * the selector first, the switch under it — or under a code-managed toolbar
 * it cannot add to.
 */
function placeStandalone(draft: PageDraft, control: BlockDraft): void {
	control.name = uniqueName(draft.blocks, control.name)
	let at = draft.blocks[0]?.type === PAGE_TOOLBAR ? 1 : 0
	if (isLiveToggle(control) && draft.blocks[at]?.type === PERIOD_SELECTOR) {
		at += 1
	}
	draft.blocks.splice(at, 0, control)
}

function newControl(descriptor: BlockTypeDescriptor, name: string): BlockDraft {
	const control = newBlockDraft(descriptor)
	control.name = name
	return control
}

/**
 * A period selector in the page's toolbar, once an edit binds a block to the
 * page's period and nothing on the page sets that period: a card that follows
 * a period nobody can pick shows all of time, and an author who ticked
 * "Period" expects one. Only on the edit doing the binding — a selector the
 * author then takes off stays off. Answers whether it placed one.
 */
export function ensurePeriodSelector(
	draft: PageDraft,
	catalog: BlockCatalog | null,
	previous: PageDraft | null,
): boolean {
	const descriptor = descriptorOf(catalog, PERIOD_SELECTOR)
	if (
		!descriptor ||
		!previous ||
		anyBlock(draft, drivesPagePeriod) ||
		!anyBlock(draft, (block) => followsPagePeriod(block, catalog)) ||
		anyBlock(previous, (block) => followsPagePeriod(block, catalog))
	) {
		return false
	}
	placeControl(draft, catalog, newControl(descriptor, 'period'))
	return true
}

/**
 * Make the page live, or not: its `live` options, and its Live / Pause switch
 * in the page's toolbar. Off, every switch the editor can take off goes, since
 * a page that is not live draws none, and so does a toolbar left with nothing
 * in it; one that was empty already is the author's.
 */
export function setPageLive(
	draft: PageDraft,
	catalog: BlockCatalog | null,
	live: Record<string, unknown> | null,
): void {
	draft.page = { ...(draft.page ?? {}), live }
	if (!live) {
		removeAll(draft.blocks, isLiveToggle)
		return
	}
	const descriptor = descriptorOf(catalog, LIVE_TOGGLE)
	if (!descriptor || anyBlock(draft, isLiveToggle)) {
		return
	}
	placeControl(draft, catalog, newControl(descriptor, 'live'))
}

/**
 * What a toolbar the author places comes with: the selector of the page's
 * period when nothing on the page sets it, and the switch of a live page that
 * has none, each set the way the toolbar draws it. Without them, the bar would
 * show only when the page last read its data.
 */
export function seedPageToolbar(
	draft: PageDraft,
	catalog: BlockCatalog | null,
	toolbar: BlockDraft,
): void {
	const live = descriptorOf(catalog, LIVE_TOGGLE)
	if (live && draft.page?.live && !anyBlock(draft, isLiveToggle)) {
		addToToolbar(toolbar, newControl(live, 'live'), catalog)
	}
	const period = descriptorOf(catalog, PERIOD_SELECTOR)
	if (period && !anyBlock(draft, drivesPagePeriod)) {
		addToToolbar(toolbar, newControl(period, 'period'), catalog)
	}
}

/**
 * Take every block passing `test` off, except inside a block whose children
 * the source decides; a toolbar the removal empties goes with it.
 */
function removeAll(blocks: BlockDraft[], test: (block: BlockDraft) => boolean): void {
	for (let at = blocks.length - 1; at >= 0; at -= 1) {
		const block = blocks[at] as BlockDraft
		if (test(block)) {
			blocks.splice(at, 1)
			continue
		}
		if (!block.children || managedInCode(block)) {
			continue
		}
		const held = block.children.length
		removeAll(block.children, test)
		if (block.type === PAGE_TOOLBAR && held > 0 && block.children.length === 0) {
			blocks.splice(at, 1)
		}
	}
}

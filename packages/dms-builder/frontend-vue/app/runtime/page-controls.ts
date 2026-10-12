/**
 * The controls a page needs for what its blocks do, placed by the editor
 * rather than looked for in the palette: the period selector the cards bound
 * to the page's period follow, and the Live / Pause switch of a live page.
 *
 * Both sit at the top of the page, where a page written by hand keeps them.
 */
import { descriptorOf, newBlockDraft } from './catalog'
import { LIVE_TOGGLE, PAGE_PERIOD_SCOPE, PERIOD_SELECTOR } from './constants'
import { uniqueName, walkDraft } from './draft'
import type { BlockCatalog, BlockDraft, PageDraft } from './types'

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

function anyBlock(draft: PageDraft, test: (block: BlockDraft) => boolean): boolean {
	let found = false
	walkDraft(draft.blocks, (block) => {
		found ||= test(block)
	})
	return found
}

/**
 * A period selector at the top of the page, once an edit binds a block to the
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
	const selector = newBlockDraft(descriptor)
	selector.name = uniqueName(draft.blocks, 'period')
	draft.blocks.unshift(selector)
	return true
}

/**
 * Make the page live, or not: its `live` options, and its Live / Pause switch.
 * The switch goes at the top, under the page's period selector when it starts
 * with one; off, every switch goes, since a page that is not live draws none.
 */
export function setPageLive(
	draft: PageDraft,
	catalog: BlockCatalog | null,
	live: Record<string, unknown> | null,
): void {
	draft.page = { ...(draft.page ?? {}), live }
	if (!live) {
		removeAll(draft.blocks, (block) => block.type === LIVE_TOGGLE)
		return
	}
	const descriptor = descriptorOf(catalog, LIVE_TOGGLE)
	if (!descriptor || anyBlock(draft, (block) => block.type === LIVE_TOGGLE)) {
		return
	}
	const toggle = newBlockDraft(descriptor)
	toggle.name = uniqueName(draft.blocks, 'live')
	const at = draft.blocks[0]?.type === PERIOD_SELECTOR ? 1 : 0
	draft.blocks.splice(at, 0, toggle)
}

function removeAll(blocks: BlockDraft[], test: (block: BlockDraft) => boolean): void {
	for (let at = blocks.length - 1; at >= 0; at -= 1) {
		const block = blocks[at] as BlockDraft
		if (test(block)) {
			blocks.splice(at, 1)
			continue
		}
		if (block.children) {
			removeAll(block.children, test)
		}
	}
}

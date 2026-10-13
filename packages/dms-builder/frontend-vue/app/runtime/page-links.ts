/**
 * Links that lead whoever reads the page to another one: a card's, a button's.
 *
 * Their option takes an address typed by hand — a page's path, an anchor, a
 * site elsewhere — and someone building a page knows the page by its name, not
 * by its path. Beside the box, the project's pages are offered by name; picking
 * one writes its path, and the box still takes anything else.
 *
 * Only these: an option whose address is a route the page calls (`fetchUrl`,
 * `submitUrl`) is not somewhere a reader goes.
 */
import type { PageSummary } from './types'

const PAGE_LINK_KEYS = new Set(['to', 'backTo'])

/** Whether an option is a link a reader follows to another page. */
export function linksToPage(name: string, widget: unknown): boolean {
	return widget === 'url' && PAGE_LINK_KEYS.has(name)
}

/** The page a link leads to, when it is one of the project's. */
export function linkedPage(
	pages: PageSummary[],
	value: unknown,
): PageSummary | undefined {
	return typeof value === 'string'
		? pages.find((page) => page.ref === value)
		: undefined
}

export interface PageLinkItem {
	label: string
	icon: string
	ref: string
}

const PAGE_ICON = 'i-ph-file-light'

/** The pages to link to, by name, the way the menu lists them. */
export function pageLinkItems(pages: PageSummary[]): PageLinkItem[] {
	return [...pages]
		.sort((a, b) => a.displayName.localeCompare(b.displayName))
		.map((page) => ({
			label: page.displayName,
			icon: page.icon ?? PAGE_ICON,
			ref: page.ref,
		}))
}

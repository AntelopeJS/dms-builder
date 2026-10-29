import { type PageLayout } from '../runtime/session'
import type { PageSummary } from '../runtime/types'

export interface CategoryNode {
	ref: string
	label: string
	pages: PageSummary[]
	children: CategoryNode[]
}

/** A line of the tree: keyed by the category's ref, or by the page's route. */
export interface RowBase {
	ref: string
	label: string
	icon?: string
	/** The category being renamed is drawn as the form that renames it. */
	slot?: 'rename'
}

export interface CategoryRow extends RowBase {
	kind: 'category'
	node: CategoryNode
	children?: Row[]
}

export interface PageRow extends RowBase {
	kind: 'page'
	page: PageSummary
}

export type Row = CategoryRow | PageRow

export function pageRow(page: PageSummary): PageRow {
	return {
		kind: 'page',
		ref: page.ref,
		label: page.displayName,
		icon: page.icon || 'i-ph-file',
		page,
	}
}

export function empty(node: CategoryNode): boolean {
	return !node.pages.length && !node.children.length
}

/** What a folder, a route segment and a class name can all be built from. */
export function slugify(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

export type StartLayout = PageLayout | 'blank'

/** What a new page can start from; a blank page is written as it is. */
export const LAYOUT_ITEMS: { label: string; value: StartLayout; icon: string }[] = [
	{ label: 'Blank', value: 'blank', icon: 'i-ph-file-light' },
	{ label: 'Dashboard', value: 'dashboard', icon: 'i-ph-squares-four-light' },
	{ label: 'List', value: 'list', icon: 'i-ph-table-light' },
	{ label: 'Form', value: 'form', icon: 'i-ph-note-pencil-light' },
]

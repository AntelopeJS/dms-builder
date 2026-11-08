import { displayText } from './i18n'
import type { CategorySummary, PageSummary } from './types'

export interface CategoryOption {
	label: string
	value: string
	depth: number
}

/**
 * The route a category puts its pages under: `pages.shop.reports` answers at
 * `/shop/reports`, and the root category at `/`.
 */
export function categoryRoute(ref: string): string {
	const slug = ref.replace(/^pages\.?/, '').replace(/\./g, '/')
	return slug ? `/${slug}` : ''
}

/** Pages in the order the menu lists them: by order, then name, then id. */
export function byMenuOrder(a: PageSummary, b: PageSummary): number {
	return (
		(a.order ?? 0) - (b.order ?? 0) ||
		a.displayName.localeCompare(b.displayName) ||
		a.id.localeCompare(b.id)
	)
}

/** Categories in the order the menu lists them: by order, then name. */
export function byCategoryOrder(a: CategorySummary, b: CategorySummary): number {
	return (
		(a.order ?? 0) - (b.order ?? 0) || a.displayName.localeCompare(b.displayName)
	)
}

/**
 * The categories as a menu reads them: in tree order, labelled by display name
 * and indented by depth.
 *
 * A ref such as `pages.table-view` is an address, not a name — offering it in a
 * picker asks the reader to translate it back into the label they see in the
 * navigation.
 */
export function categoryOptions(
	categories: CategorySummary[],
): CategoryOption[] {
	const options: CategoryOption[] = []
	const walk = (parent: string | undefined, depth: number): void => {
		for (const category of categories
			.filter((entry) => (entry.parent ?? undefined) === parent)
			.sort(byCategoryOrder)) {
			options.push({
				label: `${'\u00A0\u00A0'.repeat(depth)}${depth > 0 ? '↳ ' : ''}${displayText(category.displayName)}`,
				value: category.ref,
				depth,
			})
			walk(category.ref, depth + 1)
		}
	}
	walk(undefined, 0)
	return options
}

/** The place a category is written with when it moves in the menu. */
export interface CategoryPlace {
	ref: string
	order: number
}

/**
 * The places to write so `ref` moves one step earlier (`-1`) or later (`1`)
 * among its siblings, and nothing else. Two neighbours with places of their
 * own swap them. Siblings that share a place or have none are all numbered
 * again from 1, and only the ones whose number changes are returned.
 */
export function categoryMoves(
	categories: CategorySummary[],
	ref: string,
	delta: -1 | 1,
): CategoryPlace[] {
	const category = categories.find((entry) => entry.ref === ref)
	if (!category) {
		return []
	}
	const siblings = categories
		.filter((entry) => (entry.parent ?? undefined) === (category.parent ?? undefined))
		.sort(byCategoryOrder)
	const at = siblings.findIndex((entry) => entry.ref === ref)
	const neighbour = siblings[at + delta]
	if (!neighbour) {
		return []
	}
	if (
		category.order !== undefined &&
		neighbour.order !== undefined &&
		category.order !== neighbour.order
	) {
		return [
			{ ref, order: neighbour.order },
			{ ref: neighbour.ref, order: category.order },
		]
	}
	const reordered = siblings.filter((entry) => entry.ref !== ref)
	reordered.splice(at + delta, 0, category)
	return reordered.flatMap((entry, index) =>
		entry.order === index + 1 ? [] : [{ ref: entry.ref, order: index + 1 }],
	)
}

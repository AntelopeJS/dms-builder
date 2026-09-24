import type { CategorySummary } from './types'

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
		for (const category of categories.filter(
			(entry) => (entry.parent ?? undefined) === parent,
		)) {
			options.push({
				label: `${'\u00A0\u00A0'.repeat(depth)}${depth > 0 ? '↳ ' : ''}${category.displayName}`,
				value: category.ref,
				depth,
			})
			walk(category.ref, depth + 1)
		}
	}
	walk(undefined, 0)
	return options
}

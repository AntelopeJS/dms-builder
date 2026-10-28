import type { ResourceDraft } from './database'
import type { OpenItem } from './database-types'

/**
 * A column of several native types, declared as the answer says or left out: it was left out of
 * the proposal, so a declaration adds it as a plain field nobody lists, filters or sorts yet.
 */
export function answerFieldType(resource: ResourceDraft, item: OpenItem, value: unknown): void {
	const column = item.column ?? ''
	resource.fields = resource.fields.filter((field) => field.column !== column)
	if (typeof value !== 'string') {
		return
	}
	resource.fields.push({
		column,
		include: true,
		declared: value,
		label: column,
		listable: false,
		filterable: false,
		sortable: false,
		searchable: false,
		relation: null,
	})
}

import type { FieldDraft, ResourceDraft } from './database'
import type { ColumnDisplay, TabsChoice } from './database-types'

/** The declaration each display needs of its column. */
const DECLARATION_OF: Record<ColumnDisplay['kind'], string> = {
	badge: 'string',
	price: 'number',
}

/**
 * The display a column is sent with: its own while the column is declared as the display needs and
 * is not a relation column, else none, as a draft of an older builder holds none.
 */
export function sentDisplay(field: FieldDraft): ColumnDisplay | null {
	const display = field.display ?? null
	return display && !field.relation && DECLARATION_OF[display.kind] === field.declared ? display : null
}

/** The tabs a relation is sent with: only over a column that is kept, filterable and sent as a badge. */
export function sentTabs(resource: ResourceDraft): TabsChoice | null {
	const column = resource.tabs?.column
	const field = resource.fields.find((candidate) => candidate.include && candidate.column === column)
	return field?.filterable && sentDisplay(field)?.kind === 'badge' ? { column: field.column } : null
}

/**
 * A table form, as the simple mode's panel edits it.
 *
 * The panel picks the table it works on, says what the form does with a row
 * and which fields it asks for, what it is called, and what happens once it
 * is sent — in words, with no address or variable to type.
 */
import { CONTROLLER_SETTING } from './catalog'

/** The block the simple mode edits with a panel of its own. */
export const RESOURCE_FORM_BLOCK = 'ResourceForm'

/**
 * The options that panel edits. Whatever else the block declares — where the
 * row id is read from, what every submit adds — is left to the advanced view.
 */
export const RESOURCE_FORM_PANEL_OPTIONS = new Set([
	// The table it works on, which the panel picks, its fields beside.
	CONTROLLER_SETTING,
	'mode',
	'title',
	'description',
	'fieldsOrientation',
	'redirectOnSuccess',
	'submitLabel',
	'successMessage',
	'errorMessage',
])

export type ResourceFormMode = 'new' | 'edit' | 'view'

/**
 * The row a table form edits or shows unless told otherwise: the one the page
 * is opened on (`QUERY_ROW_ID` in `@antelopejs/interface-dms`).
 */
const OPENED_ROW = '{{query.id}}'

/** The row a form creating one has just written, once the server answers. */
const CREATED_ROW = '{{response._id}}'

/**
 * The variable the row a table form saves is known by once it is sent: the
 * one it created, or the one it edits. A form showing a row sends nothing.
 */
export function savedRowOf(
	mode: unknown,
	rowId: unknown,
): string | undefined {
	if (mode === 'new') {
		return CREATED_ROW
	}
	if (mode === 'edit') {
		return typeof rowId === 'string' && rowId ? rowId : OPENED_ROW
	}
	return undefined
}

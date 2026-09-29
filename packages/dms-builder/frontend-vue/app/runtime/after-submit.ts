/**
 * Where a form goes once it is sent, as the simple mode picks it: a page, and
 * for a form over a table, that page opened on the row just saved.
 *
 * The block holds it as one address — `redirectOnSuccess` — in which the row
 * is a variable the form fills in once the server has answered. Someone
 * building a page picks a page and ticks a box; the variable is written here,
 * never typed.
 */

/**
 * The query a page is opened on a row with: what a table form reads the row
 * from unless told otherwise (`QUERY_ROW_ID` in `@antelopejs/interface-dms`).
 */
const ROW_QUERY = 'id'

/** An address, then the row it is opened on as a variable, and nothing else. */
const OPENED_ON_ROW = new RegExp(`^([^?#]+)\\?${ROW_QUERY}=(\\{\\{[^}]+\\}\\})$`)

export interface AfterSubmit {
	/** The page it goes to, or an address written in code. */
	page: string
	/** Whether that page is opened on the row just saved. */
	openRow: boolean
}

/**
 * Where a form goes once sent, read off the address it holds; `undefined` when
 * it stays on the page. Only a form that can open a page on its row reads the
 * row off: for any other, the whole address is where it goes.
 */
export function readAfterSubmit(
	redirect: string | undefined,
	opensRows: boolean,
): AfterSubmit | undefined {
	if (!redirect) {
		return undefined
	}
	const match = opensRows ? OPENED_ON_ROW.exec(redirect) : null
	return match ? { page: match[1]!, openRow: true } : { page: redirect, openRow: false }
}

/**
 * The address a form holds to go to `page`, opened on the row it saved when
 * `savedRow` — the variable that row is known by — says which. No page is no
 * address: the form stays.
 */
export function writeAfterSubmit(
	page: string | undefined,
	openRow: boolean,
	savedRow: string | undefined,
): string | undefined {
	if (!page) {
		return undefined
	}
	return openRow && savedRow ? `${page}?${ROW_QUERY}=${savedRow}` : page
}

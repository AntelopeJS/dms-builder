/**
 * Who sees what of the page, read the way the DMS decides it.
 *
 * A role opens a page with the page's permission, and is shown each block of
 * it with a permission of the block's own, named after where the block sits:
 * the page's, then the name of every block down to it — the rows and columns
 * the editor writes included. A role holds ids, not prefixes, so holding the
 * page gives none of its blocks, and a block hidden from a role hides all it
 * holds.
 *
 * Which is what the editor has to say out loud: adding a block, renaming it,
 * moving it, or laying it in a row the editor wrote, all hand it a permission
 * no role holds yet — the owner, who is the one building the page, sees it
 * and nobody else does.
 */
import { pairedBlocks } from './changes'
import { joinPath, leafName } from './draft'
import { blockTitle } from './naming'
import type { BlockCatalog, BlockDraft, PageAccess, PageDraft, RoleAccess } from './types'

const SEPARATOR = '.'
/** The actions that only read: a role keeping these and no other reads only. */
const READ_ACTIONS = new Set(['list', 'view', 'details', 'read'])
/** Past this many, the rest of the roles are counted rather than named. */
const NAMED_ROLES = 2

/**
 * What a role would not be shown of a block, as the DMS's preview veils it:
 * hidden, or shown without some of what it offers — its actions, or a block
 * it holds through its settings, a card's chart.
 */
export type BlockVeil =
	| { state: 'hidden' }
	| { state: 'readonly' | 'limited'; withheld: string[] }

/** Something about who sees the page that changes on save, said before it. */
export interface AccessWarning {
	id: string
	/** The block it is about, to go to. */
	path?: string
	title: string
	detail: string
}

/** Whether roles decide anything on the page at all. */
export function rolesDecide(access: PageAccess | null): access is PageAccess {
	return access?.mode === 'blocks' || access?.mode === 'page'
}

/**
 * The permission the page opens under in the draft: the one it names, else
 * the one named after it — a permission taken off goes back to that one.
 */
export function draftPermission(
	access: PageAccess,
	page: Record<string, unknown> | undefined,
): string {
	if (!page || !('permission' in page)) {
		return access.permission
	}
	const id = (page.permission as { id?: unknown } | null | undefined)?.id
	return typeof id === 'string' && id.trim() ? id.trim() : access.fullId
}

/** A block's permission: the page's, then the names down to the block. */
export function blockPermission(page: string, path: string): string {
	return [page, ...path.split('/')].join(SEPARATOR)
}

function holds(access: PageAccess, role: RoleAccess, id: string): boolean {
	return role.all || role.permissions.includes(id) || access.granted.includes(id)
}

/** Whether the role opens the page, under the permission `page`. */
export function opensPage(access: PageAccess, role: RoleAccess, page: string): boolean {
	return !rolesDecide(access) || holds(access, role, page)
}

/** Whether the role is shown the block at `path`: the page, then each block down to it. */
export function seesBlock(
	access: PageAccess,
	role: RoleAccess,
	page: string,
	path: string,
): boolean {
	if (!opensPage(access, role, page)) {
		return false
	}
	if (access.mode !== 'blocks') {
		return true
	}
	const parts = path.split('/')
	return parts.every((_, index) =>
		holds(access, role, blockPermission(page, parts.slice(0, index + 1).join('/'))),
	)
}

/** The roles opening the page under the permission `page`. */
export function rolesOpening(access: PageAccess, page: string): RoleAccess[] {
	return (access.roles ?? []).filter((role) => opensPage(access, role, page))
}

/** The roles shown the block at `path`. */
export function rolesSeeing(access: PageAccess, page: string, path: string): RoleAccess[] {
	return (access.roles ?? []).filter((role) => seesBlock(access, role, page, path))
}

/** Roles as a sentence names them: `Support`, `Admin and Support`, `Admin, Support and 2 more`. */
export function roleNames(roles: RoleAccess[]): string {
	const names = roles.map((role) => role.name)
	if (names.length <= 1) {
		return names[0] ?? ''
	}
	if (names.length <= NAMED_ROLES + 1) {
		return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
	}
	const rest = names.length - NAMED_ROLES
	return `${names.slice(0, NAMED_ROLES).join(', ')} and ${rest} more`
}

/**
 * What the role would not be shown of the draft, by path, as the DMS's own
 * preview veils it: a block it is not given is hidden with all it holds; one
 * it is given without some of its actions reads only, or is limited.
 */
export function veilsFor(
	access: PageAccess,
	role: RoleAccess,
	draft: PageDraft,
	page: string,
): Record<string, BlockVeil> {
	const veils: Record<string, BlockVeil> = {}
	if (!rolesDecide(access)) {
		return veils
	}
	const pageHidden = !opensPage(access, role, page)
	const visit = (blocks: BlockDraft[], parent: string | null): void => {
		for (const block of blocks) {
			const path = joinPath(parent, block.name)
			if (pageHidden) {
				veils[path] = { state: 'hidden' }
				continue
			}
			if (access.mode !== 'blocks') {
				continue
			}
			const id = blockPermission(page, path)
			if (!holds(access, role, id)) {
				veils[path] = { state: 'hidden' }
				continue
			}
			const actions = (access.actions[id] ?? []).filter(
				(action) => !access.granted.includes(action.id),
			)
			const withheld = actions.filter((action) => !holds(access, role, action.id))
			const missing = (access.held?.[id] ?? []).filter((part) => !holds(access, role, part.id))
			if (withheld.length > 0 || missing.length > 0) {
				const writes = actions.filter(
					(action) => !READ_ACTIONS.has(action.id.split(SEPARATOR).at(-1) ?? ''),
				)
				const keepsWrite = writes.some((action) => holds(access, role, action.id))
				const readsOnly = withheld.length > 0 && writes.length > 0 && !keepsWrite
				veils[path] = {
					state: readsOnly ? 'readonly' : 'limited',
					withheld: [...missing, ...withheld].map((entry) => entry.title),
				}
			}
			visit(block.children ?? [], path)
		}
	}
	visit(draft.blocks, null)
	return veils
}

/**
 * Who would stop seeing what, once the draft is saved: a page whose new
 * permission some roles do not hold, a block that takes a new permission —
 * added, renamed, moved, laid in a new row — and so leaves the roles that saw
 * it, or reaches none. A block inside one already said is not said again.
 */
export function accessWarnings(
	access: PageAccess | null,
	saved: PageDraft | null,
	draft: PageDraft | null,
	catalog: BlockCatalog | null,
): AccessWarning[] {
	if (!rolesDecide(access) || !access.roles?.length || !saved || !draft) {
		return []
	}
	const before = access.permission
	const after = draftPermission(access, draft.page)
	const warnings: AccessWarning[] = []
	const blocks = pairedBlocks(saved, draft, catalog)

	if (before !== after) {
		const closed = rolesOpening(access, before).filter(
			(role) => !opensPage(access, role, after),
		)
		if (closed.length > 0) {
			warnings.push({
				id: 'access:page',
				title: `${roleNames(closed)} no longer ${closed.length === 1 ? 'opens' : 'open'} this page`,
				detail: `${closed.length === 1 ? 'It does' : 'They do'} not hold the permission the page is given now.`,
			})
		}
		// Every block's permission is named after the page's: none carries over.
		const losing =
			access.mode === 'blocks'
				? (access.roles ?? []).filter(
						(role) =>
							!closed.includes(role) &&
							blocks.some(
								(entry) =>
									entry.was &&
									seesBlock(access, role, before, entry.was.path) &&
									!seesBlock(access, role, after, entry.path),
							),
					)
				: []
		if (losing.length > 0) {
			warnings.push({
				id: 'access:page-blocks',
				title: `${roleNames(losing)} ${losing.length === 1 ? 'loses' : 'lose'} the blocks ${losing.length === 1 ? 'it was' : 'they were'} given`,
				detail:
					'A block’s permission is named after the page’s: under a new one, no grant made on its blocks carries over. Give them again in Roles.',
			})
		}
		return warnings
	}

	if (access.mode !== 'blocks') {
		return warnings
	}
	const said: string[] = []
	for (const entry of blocks) {
		if (said.some((path) => entry.path.startsWith(`${path}/`))) {
			continue
		}
		const now = rolesSeeing(access, after, entry.path)
		const title = blockTitle(entry.block, catalog)
		if (!entry.was) {
			if (now.length === 0) {
				said.push(entry.path)
				warnings.push({
					id: `access:new:${entry.path}`,
					path: entry.path,
					title: `No role sees ${title} yet`,
					detail: 'A new block is shown to the owner only, until a role is given it in Roles.',
				})
			}
			continue
		}
		const lost = rolesSeeing(access, before, entry.was.path).filter(
			(role) => !now.includes(role),
		)
		if (lost.length === 0) {
			continue
		}
		said.push(entry.path)
		warnings.push({
			id: `access:lost:${entry.path}`,
			path: entry.path,
			title: `${roleNames(lost)} ${lost.length === 1 ? 'loses' : 'lose'} ${title}`,
			detail: `${reasonOf(entry.was, entry)}, so it takes a new permission — a block’s is named after where it sits. Give it again in Roles.`,
		})
	}
	return warnings
}

/** Why a block's permission changes: its name, its place, or the row it is in. */
function reasonOf(
	was: { path: string; shown: string },
	now: { path: string; shown: string },
): string {
	if (leafName(was.path) !== leafName(now.path)) {
		return 'It was renamed'
	}
	return was.shown === now.shown
		? 'The editor laid it in another row or column'
		: 'It was moved'
}

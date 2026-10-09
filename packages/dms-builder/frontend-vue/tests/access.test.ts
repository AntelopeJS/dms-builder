import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	accessWarnings,
	blockPermission,
	draftPermission,
	roleNames,
	rolesSeeing,
} from '../app/runtime/access'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockDraft, PageAccess, PageDraft, RoleAccess } from '../app/runtime/types'
import { installFakeHost, testCatalog, type FakeBackend } from './support/builder-harness'

/**
 * Who sees what of the page, the way the DMS decides it: a block's permission
 * is the page's followed by the names down to it, and a role holds ids, not
 * prefixes. What the editor has to say before a save hands a block one no
 * role holds.
 */

const catalog = testCatalog()
const PAGE = 'pages.reports.sales'

function text(name: string, content = name): BlockDraft {
	return { name, type: 'Text', config: { content } }
}

function grid(...cells: BlockDraft[]): BlockDraft {
	return {
		name: 'grid',
		type: 'Grid',
		config: {},
		children: [{ name: 'gridRow', type: 'GridRow', config: {}, children: cells }],
	}
}

function page(...blocks: BlockDraft[]): PageDraft {
	return { blocks }
}

function role(name: string, ...permissions: string[]): RoleAccess {
	return { id: name.toLowerCase(), name, members: 2, all: false, permissions }
}

const support = role('Support', PAGE, `${PAGE}.title`, `${PAGE}.chart`, `${PAGE}.chart.list`)
const finance = role('Finance', PAGE, `${PAGE}.title`)
const outsider = role('Outsider')

function access(extra: Partial<PageAccess> = {}): PageAccess {
	return {
		mode: 'blocks',
		fullId: PAGE,
		permission: PAGE,
		actions: {
			[`${PAGE}.chart`]: [
				{ id: `${PAGE}.chart.list`, title: 'List' },
				{ id: `${PAGE}.chart.export`, title: 'Export' },
			],
		},
		held: {},
		granted: [],
		roles: [support, finance, outsider],
		...extra,
	}
}

describe('the permission of a block', () => {
	it('is the page’s, then the names down to it, the editor’s rows included', () => {
		expect(blockPermission(PAGE, 'grid/gridRow/kpi')).toBe(`${PAGE}.grid.gridRow.kpi`)
	})

	it('follows the page’s, as the draft gives it one or takes it off', () => {
		const known = access({ permission: 'shop.desk' })
		expect(draftPermission(known, undefined)).toBe('shop.desk')
		expect(draftPermission(known, { permission: { id: 'shop.board' } })).toBe('shop.board')
		expect(draftPermission(known, { permission: null })).toBe(PAGE)
	})

	it('is held one block at a time: a role holding the page holds none of its blocks', () => {
		const seeing = rolesSeeing(access(), PAGE, 'intro').map((entry) => entry.name)
		expect(seeing).toEqual([])
		expect(rolesSeeing(access(), PAGE, 'title').map((entry) => entry.name)).toEqual([
			'Support',
			'Finance',
		])
	})

	it('is everyone’s on a page every member reaches, and no one’s to check on one roles do not decide', () => {
		expect(rolesSeeing(access({ mode: 'everyone' }), PAGE, 'intro')).toHaveLength(3)
		expect(rolesSeeing(access({ mode: 'unmanaged' }), PAGE, 'intro')).toHaveLength(3)
	})
})

describe('what a save would take from the roles', () => {
	const saved = page(text('title'), text('chart'))

	function titles(draft: PageDraft, known = access()): string[] {
		return accessWarnings(known, saved, draft, catalog).map((warning) => warning.title)
	}

	it('is nothing while every block keeps its place and name', () => {
		expect(titles(page(text('chart'), text('title', 'Sales')))).toEqual([])
	})

	it('says a block added reaches no role yet', () => {
		const [warning] = accessWarnings(
			access(),
			saved,
			page(text('title'), text('chart'), text('notes', 'Notes')),
			catalog,
		)
		expect(warning).toMatchObject({ title: 'No role sees Notes yet', path: 'notes' })
	})

	it('says who loses a block renamed, and why', () => {
		const draft = page({ ...text('title'), name: 'heading' }, text('chart'))
		const [warning] = accessWarnings(access(), saved, draft, catalog)
		expect(warning?.title).toBe('Support and Finance lose title')
		expect(warning?.detail).toContain('It was renamed')
	})

	it('says who loses a block the editor laid in a row, though it did not move for anyone', () => {
		const draft = page(grid(text('title'), text('notes', 'Notes')), text('chart'))
		const warnings = accessWarnings(access(), saved, draft, catalog)
		expect(warnings.map((warning) => warning.title)).toEqual([
			'Support and Finance lose title',
			'No role sees Notes yet',
		])
		expect(warnings[0]?.detail).toContain('laid it in another row or column')
	})

	it('says nothing again of what a block already said holds', () => {
		const before = page(text('title'))
		const draft = page(text('title'), {
			name: 'section',
			type: 'Section',
			config: {},
			children: [text('one'), text('two')],
		})
		expect(
			accessWarnings(access(), before, draft, catalog).map((warning) => warning.path),
		).toEqual(['section'])
	})

	it('says who no longer opens the page under a new permission, and who loses its blocks', () => {
		const draft = { ...page(text('title'), text('chart')), page: { permission: { id: 'shop.desk' } } }
		const known = access({ roles: [support, { ...finance, permissions: [...finance.permissions, 'shop.desk'] }] })
		expect(titles(draft, known)).toEqual([
			'Support no longer opens this page',
			'Finance loses the blocks it was given',
		])
	})

	it('is nothing on a page roles do not decide, or with no role to lose anything', () => {
		const draft = page(text('notes'))
		expect(titles(draft, access({ mode: 'everyone' }))).toEqual([])
		expect(titles(draft, access({ mode: 'unmanaged' }))).toEqual([])
		expect(titles(draft, access({ roles: null }))).toEqual([])
		expect(titles(draft, access({ roles: [] }))).toEqual([])
	})

	it('names a few roles and counts the rest', () => {
		const many = ['A', 'B', 'C', 'D'].map((name) => role(name))
		expect(roleNames(many.slice(0, 3))).toBe('A, B and C')
		expect(roleNames(many)).toBe('A, B and 2 more')
	})
})

describe('the session’s view of who sees the page', () => {
	let backend: FakeBackend
	let builder: BuilderController

	beforeEach(async () => {
		vi.useFakeTimers()
		backend = installFakeHost()
		backend.answers['GET /api/builder/page/access'] = access({
			fullId: 'reports.sales',
			permission: 'reports.sales',
			actions: {},
			roles: [role('Support', 'reports.sales', 'reports.sales.title')],
		})
		builder = useBuilder()
		builder.close()
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
	})

	afterEach(() => {
		builder.close()
		vi.useRealTimers()
	})

	it('reads it with the page, and warns of a block added before it is saved', () => {
		expect(builder.session.value.access?.mode).toBe('blocks')
		expect(builder.accessWarnings.value).toEqual([])
		builder.addBlock('Text')
		expect(builder.accessWarnings.value.map((warning) => warning.title)).toEqual([
			expect.stringMatching(/^No role sees .+ yet$/),
		])
	})

	it('asks who holds the permission the draft gives the page', async () => {
		builder.patchPage({ permission: { id: 'shop.desk', title: 'Sales' } })
		await vi.advanceTimersByTimeAsync(0)
		const asked = backend.calls.filter((call) => call.path === '/api/builder/page/access')
		expect(asked.at(-1)?.query).toEqual({ ref: '/reports/sales', permission: 'shop.desk' })
	})

	it('says nothing when the module answers with something else', async () => {
		backend.answers['GET /api/builder/page/access'] = { ok: true, data: {}, changes: [] }
		builder.close()
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
		expect(builder.session.value.access).toBeNull()
		expect(builder.accessWarnings.value).toEqual([])
	})
})

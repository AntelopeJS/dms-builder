import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Component, type VNode } from 'vue'
import PagePanel from '../app/components/PagePanel.vue'
import PagesPanel from '../app/components/PagesPanel.vue'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { PageSummary } from '../app/runtime/types'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	fakeEvent,
	findAll,
	fire,
	installDocumentStub,
	mount,
	stub,
	textOf,
	type TestNode,
} from './support/render'
import { pushedRoutes } from './stubs/frontend-module'

/**
 * The pages of a project as a tree an author finds their way in — by the
 * order the menu shows, by name — and a page's own settings, which say which
 * of them are written at once.
 */

let backend: FakeBackend
let builder: BuilderController
let mounted: (() => void)[] = []

installDocumentStub()
Object.assign(globalThis, {
	resolveDmsComponent: () => undefined,
	useDmsDevReload: () => ({ awaitRoute: () => Promise.resolve(true) }),
})

function summary(
	ref: string,
	category: string,
	extra: Partial<PageSummary> = {},
): PageSummary {
	const id = ref.split('/').pop() ?? ref
	return {
		ref,
		id,
		displayName: id.charAt(0).toUpperCase() + id.slice(1),
		category,
		filepath: `pages/${id}.ts`,
		...extra,
	}
}

interface TreeRow {
	label?: string
	slot?: string
	children?: TreeRow[]
}

/**
 * A stand-in for `UTree` that draws its items the way the real one does: each
 * a `treeitem` filled by the slots an item is drawn with, its children listed
 * under it while it is expanded. Clicking a row selects it and folds or
 * unfolds it, as a user's click does.
 */
function treeDouble(): Component {
	return {
		name: 'UTree',
		inheritAttrs: false,
		setup(_props, { slots, attrs }) {
			return () => {
				const key = attrs['get-key'] as (row: TreeRow) => string
				const expanded = attrs.expanded as string[]
				const current = attrs['model-value'] as TreeRow | undefined
				const select = attrs.onSelect as (event: unknown, row: TreeRow) => void
				const expand = attrs['onUpdate:expanded'] as (keys: string[]) => void
				const draw = (row: TreeRow, level: number): VNode => {
					const open = expanded.includes(key(row))
					const props = { item: row, level, expanded: open }
					return h('li', [
						h(
							'div',
							{
								role: 'treeitem',
								'aria-level': level,
								'aria-selected': !!current && key(current) === key(row),
								onClick: () => {
									select(fakeEvent('tree.select'), row)
									if (row.children) {
										expand(
											open
												? expanded.filter((entry) => entry !== key(row))
												: [...expanded, key(row)],
										)
									}
								},
							},
							row.slot
								? (slots[row.slot]?.(props) ?? [])
								: [
										...(slots['item-label']?.(props) ?? [row.label]),
										...(slots['item-trailing']?.(props) ?? []),
									],
						),
						open && row.children
							? h(
									'ul',
									{ role: 'group' },
									row.children.map((child) => draw(child, level + 1)),
								)
							: null,
					])
				}
				return h(
					'UTree',
					attrs,
					(attrs.items as TreeRow[]).map((row) => draw(row, 1)),
				)
			}
		},
	}
}

const parts = (): Record<string, Component> => ({
	UTree: treeDouble(),
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
	USelectMenu: stub('USelectMenu'),
	USwitch: stub('USwitch'),
	UTextarea: stub('UTextarea'),
	UInputNumber: stub('UInputNumber'),
})

/** Mount a panel, and unmount it once the test is over. */
const mountPanel: typeof mount = (component, options) => {
	const tree = mount(component, options)
	mounted.push(tree.unmount)
	return tree
}

function buttonLabelled(root: TestNode, label: string): TestNode {
	const found = findAll(
		root,
		(node) =>
			node.tag === 'UButton' &&
			(node.props.label === label || node.props['aria-label'] === label),
	)[0]
	if (!found) {
		throw new Error(`no button "${label}"`)
	}
	return found
}

/** The page rows of the tree, by what they say. */
function listed(root: TestNode): string[] {
	return findAll(
		root,
		(node) => node.props.role === 'treeitem' && textOf(node).includes('/'),
	).map(textOf)
}

function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

function sent(method: string, path: string): Record<string, unknown> | undefined {
	return backend.calls.find(
		(call) => call.method === method && call.path === path,
	)?.body
}

function deletions(): Array<Record<string, string> | undefined> {
	return backend.calls
		.filter((call) => call.method === 'DELETE')
		.map((call) => call.query)
}

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(200)
	await nextTick()
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	backend.answers['GET /api/builder/pages'] = [
		summary('/reports/sales', 'reports', { order: 2 }),
		summary('/reports/weekly', 'reports', { order: 1, hidden: true }),
		summary('/reports/totals', 'reports', { order: 1 }),
		summary('/shop/orders', 'shop'),
	]
	backend.answers['GET /api/builder/categories'] = [
		{ ref: 'reports', displayName: 'Reports' },
		{ ref: 'shop', displayName: 'Shop' },
		{ ref: 'shop.old', displayName: 'Old', parent: 'shop' },
	]
	builder = useBuilder()
	builder.close()
	pushedRoutes.length = 0
})

afterEach(() => {
	for (const unmount of mounted) unmount()
	mounted = []
	builder.close()
	vi.useRealTimers()
})

async function tree(): Promise<TestNode> {
	await builder.open('/reports/sales')
	builder.setView('pages')
	const { root } = mountPanel(PagesPanel, { components: parts() })
	await settle()
	return root
}

describe('the pages, as a tree', () => {
	it('lists each category in the order the menu shows it', async () => {
		const root = await tree()

		expect(listed(root)).toEqual([
			'Totals /reports/totals',
			'Weekly /reports/weekly',
			'Sales /reports/sales',
			'Orders /shop/orders',
		])
		const open = findAll(root, (node) => node.props['aria-selected'] === true)
		expect(open.map(textOf)).toEqual(['Sales /reports/sales'])
		expect(
			findAll(root, (node) => node.props.name === 'i-ph-eye-slash'),
			'the hidden page says so',
		).toHaveLength(1)
	})

	it('finds a page by name, opening the category it sits in', async () => {
		const root = await tree()
		const reports = findAll(
			root,
			(node) =>
				node.props.role === 'treeitem' && textOf(node).startsWith('Reports'),
		)[0]!
		fire(reports, 'click')
		await nextTick()
		expect(listed(root), 'folded away').toEqual(['Orders /shop/orders'])

		write(
			findAll(root, (node) => node.props.placeholder === 'Find a page')[0]!,
			'tot',
		)
		await nextTick()

		expect(listed(root)).toEqual(['Totals /reports/totals'])
		expect(textOf(root)).not.toContain('Shop')
	})

	it('starts a page in the category it is asked from, at the address its title gives', async () => {
		const root = await tree()

		fire(buttonLabelled(root, 'New page in Shop'), 'click')
		await nextTick()
		write(
			findAll(
				root,
				(node) => node.tag === 'UInput' && node.props.placeholder === 'Revenue',
			)[0]!,
			'Monthly revenue',
		)
		await nextTick()
		expect(textOf(root)).toContain('/shop/monthly-revenue')

		fire(buttonLabelled(root, 'Create page'), 'click')
		await settle()
		expect(sent('POST', '/api/builder/pages')).toEqual({
			name: 'monthly-revenue',
			displayName: 'Monthly revenue',
			category: 'shop',
		})
	})

	it('renames a category where it stands', async () => {
		const root = await tree()

		fire(buttonLabelled(root, 'Rename Shop'), 'click')
		await nextTick()
		const name = findAll(
			root,
			(node) => node.props['aria-label'] === 'Category name',
		)[0]!
		expect(name.props.modelValue).toBe('Shop')
		write(name, 'Store')
		await nextTick()
		fire(buttonLabelled(root, 'Save the name'), 'click')
		await settle()

		expect(sent('PUT', '/api/builder/category')).toEqual({
			category: 'shop',
			patch: { displayName: 'Store' },
		})
	})

	it('offers to delete a category only once nothing is in it', async () => {
		const root = await tree()
		const labels = findAll(root, (node) => node.tag === 'UButton').map(
			(node) => node.props['aria-label'],
		)

		expect(labels).toContain('Delete Old')
		expect(labels).not.toContain('Delete Shop')
	})

	it('asks before deleting a page, and deletes it once told to', async () => {
		const root = await tree()

		fire(buttonLabelled(root, 'Delete Totals'), 'click')
		await settle()

		expect(backend.confirms).toEqual([
			expect.objectContaining({ title: 'Delete Totals?', confirmColor: 'error' }),
		])
		expect(deletions()).toEqual([{ ref: '/reports/totals' }])
		expect(pushedRoutes, 'another page than the open one').toEqual([])
		expect(builder.session.value.draft).not.toBeNull()
	})

	it('deletes nothing when the question is turned down', async () => {
		const root = await tree()
		backend.confirmAnswer = false

		fire(buttonLabelled(root, 'Delete Totals'), 'click')
		await settle()

		expect(backend.confirms).toHaveLength(1)
		expect(deletions()).toEqual([])
	})
})

describe("a page's settings", () => {
	async function settings(): Promise<TestNode> {
		await builder.open('/reports/sales')
		builder.setView('page')
		const { root } = mountPanel(PagePanel, { components: parts() })
		await settle()
		return root
	}

	it('are left for the pages they are listed among', async () => {
		await settings()

		builder.back()

		expect(builder.session.value.view).toBe('pages')
	})

	it('move the page down the menu at once', async () => {
		const root = await settings()

		write(findAll(root, (node) => node.tag === 'UInputNumber')[0]!, 1)
		await settle()

		expect(sent('POST', '/api/builder/page/configure')).toEqual({
			page: '/reports/sales',
			patch: { order: 1 },
		})
	})

	it('ask before moving the page, naming its new address', async () => {
		const root = await settings()
		const category = findAll(
			root,
			(node) => node.tag === 'USelectMenu' && node.props['model-value'] === 'reports',
		)[0]!

		backend.confirmAnswer = false
		write(category, 'shop')
		await settle()
		const [asked] = backend.confirms
		expect(asked?.description).toContain('/shop/sales')
		expect(asked?.description).toContain('Nothing redirects the old address.')
		expect(asked).toMatchObject({ cancelLabel: 'Keep it in Reports' })
		expect(sent('POST', '/api/builder/page/configure'), 'nothing moved yet').toBe(
			undefined,
		)

		backend.confirmAnswer = true
		write(category, 'shop')
		await settle()
		expect(sent('POST', '/api/builder/page/configure')).toEqual({
			page: '/reports/sales',
			patch: { category: 'shop' },
		})
	})

	it('write the permission once it is changed', async () => {
		const root = await settings()
		const permission = findAll(
			root,
			(node) => node.tag === 'UInput' && node.props.placeholder === 'shop.products',
		)[0]!

		write(permission, 'shop.orders')
		fire(permission, 'change')
		await settle()

		expect(sent('POST', '/api/builder/page/configure')).toEqual({
			page: '/reports/sales',
			patch: { permission: { id: 'shop.orders', title: 'Sales' } },
		})
	})
})

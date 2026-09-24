import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import PageDelete from '../app/components/PageDelete.vue'
import PagePanel from '../app/components/PagePanel.vue'
import PagesPanel from '../app/components/PagesPanel.vue'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { PageSummary } from '../app/runtime/types'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	findAll,
	fire,
	installDocumentStub,
	mount,
	stub,
	textOf,
	type TestNode,
} from './support/render'

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

const parts = (): Record<string, Component> => ({
	DmsBuilderPageDelete: PageDelete as Component,
	DmsBuilderIconPicker: stub('DmsBuilderIconPicker'),
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
		(node) =>
			node.tag === 'button' &&
			textOf(node).includes('/') &&
			!('aria-expanded' in node.props),
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
			'Totals/reports/totals',
			'Weekly/reports/weekly',
			'Sales/reports/sales',
			'Orders/shop/orders',
		])
		const open = findAll(root, (node) => node.props['aria-current'] === 'page')
		expect(open.map(textOf)).toEqual(['Sales/reports/sales'])
		expect(
			findAll(root, (node) => node.props.name === 'i-ph-eye-slash'),
			'the hidden page says so',
		).toHaveLength(1)
	})

	it('finds a page by name, opening the category it sits in', async () => {
		const root = await tree()
		const reports = findAll(
			root,
			(node) => node.tag === 'button' && textOf(node).startsWith('Reports'),
		)[0]!
		fire(reports, 'click')
		await nextTick()
		expect(listed(root), 'folded away').toEqual(['Orders/shop/orders'])

		write(
			findAll(root, (node) => node.props.placeholder === 'Find a page')[0]!,
			'tot',
		)
		await nextTick()

		expect(listed(root)).toEqual(['Totals/reports/totals'])
		expect(textOf(root)).not.toContain('Shop')
	})

	it('starts a page in the category it is asked from, at the address its title gives', async () => {
		const root = await tree()

		fire(buttonLabelled(root, 'New page in Shop'), 'click')
		await nextTick()
		write(
			findAll(root, (node) => node.props.id === 'new-entry-title')[0]!,
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

		fire(buttonLabelled(root, 'Later in the menu'), 'click')
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

		write(category, 'shop')
		await nextTick()
		expect(textOf(root)).toContain('/shop/sales')
		expect(textOf(root)).toContain('Nothing redirects the old address.')
		expect(sent('POST', '/api/builder/page/configure'), 'nothing moved yet').toBe(
			undefined,
		)

		fire(buttonLabelled(root, 'Keep it in Reports'), 'click')
		await nextTick()
		expect(textOf(root)).not.toContain('Nothing redirects')
	})
})

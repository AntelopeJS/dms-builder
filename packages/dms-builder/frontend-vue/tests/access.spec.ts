import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import Access from '../app/components/Access.vue'
import Banners from '../app/components/Banners.vue'
import ChangesPanel from '../app/components/ChangesPanel.vue'
import Node from '../app/components/Node.vue'
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
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { PageAccess } from '../app/runtime/types'

/**
 * What the editor says about who sees the page: the page looked at as a role,
 * what a save would take from the roles, and who is shown the block selected.
 */

let backend: FakeBackend
let builder: BuilderController
let unmount: (() => void) | undefined

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const PAGE = 'reports.sales'

function access(): PageAccess {
	return {
		mode: 'blocks',
		fullId: PAGE,
		permission: PAGE,
		actions: {},
		held: {},
		granted: [],
		roles: [
			{
				id: 'support',
				name: 'Support',
				members: 3,
				all: false,
				permissions: [PAGE, `${PAGE}.title`],
			},
		],
	}
}

function show(component: Parameters<typeof mount>[0], props?: Record<string, unknown>): TestNode {
	const view = mount(component, {
		props,
		components: { USelectMenu: stub('USelectMenu') },
	})
	unmount = view.unmount
	return view.root
}

beforeEach(async () => {
	vi.useFakeTimers()
	backend = installFakeHost()
	backend.answers['GET /api/builder/page/access'] = access()
	builder = useBuilder()
	builder.close()
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
})

afterEach(() => {
	unmount?.()
	unmount = undefined
	builder.close()
	vi.useRealTimers()
})

describe('the page looked at as a role', () => {
	it('veils the block the role is not shown, the way the DMS’s preview does', async () => {
		builder.setViewAs('support')
		const intro = builder.session.value.draft?.blocks[1]
		const root = show(Node, { block: intro, path: 'intro' })
		await nextTick()

		const badge = findAll(root, (node) => node.props['data-veil-badge'] === 'hidden')
		expect(badge.map(textOf)).toEqual(['Hidden for Support'])
		expect(findAll(root, (node) => node.props['data-veil'] === 'hidden')).toHaveLength(1)
	})

	it('leaves a block the role is shown as it is', async () => {
		builder.setViewAs('support')
		const title = builder.session.value.draft?.blocks[0]
		const root = show(Node, { block: title, path: 'title' })
		await nextTick()
		expect(findAll(root, (node) => 'data-veil-badge' in node.props)).toHaveLength(0)
	})

	it('says so in a strip under the bar, with what is hidden, until it is left', async () => {
		builder.setViewAs('support')
		const root = show(Banners)
		await nextTick()

		const strip = findAll(root, (node) => node.props['aria-label'] === 'Role preview')[0]
		expect(strip).toBeDefined()
		// Each word its own item of the strip, which wraps them on a narrow screen.
		const words = findAll(strip!, (node) => node.tag === 'span' || node.tag === 'b').map(textOf)
		expect(words).toEqual(expect.arrayContaining(['Viewing', 'Sales', 'as']))
		const badges = findAll(strip!, (node) => node.tag === 'UBadge').map((node) => node.props.label)
		expect(badges).toEqual(['1 block hidden'])

		const exit = findAll(strip!, (node) => node.props.label === 'Exit preview')[0]!
		fire(exit, 'click')
		await nextTick()
		expect(builder.session.value.viewAs).toBeNull()
		expect(findAll(root, (node) => node.props['aria-label'] === 'Role preview')).toHaveLength(0)
	})
})

describe('what a save would take from the roles', () => {
	it('is listed with the changes, the block a click away', async () => {
		builder.addBlock('Text')
		const root = show(ChangesPanel)
		await nextTick()

		expect(textOf(root)).toContain('Who sees it · 1')
		const warning = findAll(root, (node) => 'data-access-warning' in node.props)[0]!
		expect(textOf(warning)).toMatch(/No role sees .+ yet/)
		const path = String(warning.props['data-access-warning']).replace('access:new:', '')
		fire(findAll(warning, (node) => node.tag === 'button')[0]!, 'click')
		expect(builder.session.value.selection).toBe(path)
	})
})

describe('who is shown a block, or opens the page', () => {
	it('names the roles, or says only the owner is', async () => {
		const seen = show(Access, { path: 'title' })
		await nextTick()
		expect(textOf(seen)).toContain('Seen by Support')
		unmount?.()

		const hidden = show(Access, { path: 'intro' })
		await nextTick()
		expect(textOf(hidden)).toContain('Only the owner sees it')
		unmount?.()

		const page = show(Access)
		await nextTick()
		expect(textOf(page)).toContain('Opens for Support')
	})
})

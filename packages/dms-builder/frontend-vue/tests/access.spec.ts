import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import Access from '../app/components/Access.vue'
import ChangesPanel from '../app/components/ChangesPanel.vue'
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
 * What the editor says about who sees the page: what a save would take from
 * the roles, and who is shown the block selected.
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

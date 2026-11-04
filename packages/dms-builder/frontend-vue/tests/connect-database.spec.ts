import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DatabasePanel from '../app/components/DatabasePanel.vue'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { findAll, installDocumentStub, mount, stub, type TestNode } from './support/render'

/**
 * The deep link that opens the builder on the Database workspace with the
 * connect form already showing, wherever the person was.
 */

let backend: FakeBackend
let builder: BuilderController
let unmount: (() => void) | undefined

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const CONNECTED = [{ id: 'erp', engine: 'postgresql', version: '17', database: 'erp', role: 'reader' }]
const FORM = 'DmsBuilderDatabaseConnect'

const COMPONENTS = {
	DmsBuilderDatabaseConnect: stub(FORM),
	DmsBuilderDatabaseBuild: stub('DmsBuilderDatabaseBuild'),
	DmsBuilderDatabaseProposal: stub('DmsBuilderDatabaseProposal'),
	USelect: stub('USelect'),
}

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(200)
	await nextTick()
}

function shows(root: TestNode, tag: string): boolean {
	return findAll(root, (node) => node.tag === tag).length > 0
}

function infoReads(): string[] {
	return backend.calledPaths().filter((call) => call === 'GET /api/builder/database/connection')
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	backend.answers['GET /api/builder/database/connections'] = CONNECTED
	backend.answers['GET /api/builder/database/connection'] = {
		wiring: { connection: 'erp', modules: [{ id: 'erp-tables', path: 'modules/erp-tables' }], unrecorded: [] },
		details: {},
	}
	backend.answers['GET /api/builder/database/mapping'] = { ok: true, data: [{}], changes: [] }
	builder = useBuilder()
	builder.close()
})

afterEach(() => {
	unmount?.()
	unmount = undefined
	builder.close()
	vi.useRealTimers()
})

describe('opening the builder on the connect form', () => {
	it('opens the builder on the Database workspace, asking for the form', async () => {
		await builder.connectDatabase('/reports/sales')
		await settle()

		expect(builder.session.value.active).toBe(true)
		expect(builder.session.value.workspace).toBe('database')
		expect(builder.session.value.pageRef).toBe('/reports/sales')
		expect(builder.session.value.connectRequest).toBe(true)
	})

	it('has the form on the first render of a panel that was not mounted yet, though a connection exists', async () => {
		await builder.connectDatabase('/reports/sales')
		const mounted = mount(DatabasePanel, { components: COMPONENTS })
		unmount = mounted.unmount

		expect(shows(mounted.root, FORM), 'the form is drawn before anything is read').toBe(true)
		expect(builder.session.value.connectRequest, 'the request is taken').toBe(false)

		await settle()
		expect(shows(mounted.root, FORM), 'the connection listed does not take its place').toBe(true)
		expect(infoReads(), 'the first connection is not opened behind the form').toEqual([])
	})

	it('shows the form in a panel that is already open, from the builder already open', async () => {
		await builder.open('/reports/sales')
		builder.setWorkspace('database')
		const mounted = mount(DatabasePanel, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		expect(shows(mounted.root, FORM)).toBe(false)

		await builder.connectDatabase('/reports/sales')
		await nextTick()

		expect(shows(mounted.root, FORM)).toBe(true)
		expect(backend.calledPaths().filter((call) => call === 'GET /api/builder/catalog')).toHaveLength(1)
	})

	it('keeps an unsaved draft when the builder was already open on a page', async () => {
		await builder.open('/reports/sales')
		builder.addBlock('Text')
		const draft = builder.session.value.draft

		await builder.connectDatabase('/reports/sales')

		expect(builder.session.value.workspace).toBe('database')
		expect(builder.session.value.draft).toBe(draft)
		expect(builder.dirty.value).toBe(true)
	})

	it('opens the workspace on a page the builder cannot read, without blaming the page', async () => {
		backend.answers['GET /api/builder/page'] = {
			ok: false,
			error: { code: 'not_found', ref: '/auth' },
		}

		await builder.connectDatabase('/auth')
		await settle()

		expect(builder.session.value.active).toBe(true)
		expect(builder.session.value.workspace).toBe('database')
		expect(builder.session.value.loading).toBe(false)
		expect(builder.session.value.draft).toBeNull()
		expect(builder.session.value.error).toBeNull()
		expect(builder.session.value.connectRequest).toBe(true)
	})

	it('says so when the builder itself cannot start', async () => {
		backend.answers['GET /api/builder/catalog'] = new Error('backend down')

		await builder.connectDatabase('/reports/sales')
		await settle()

		expect(builder.session.value.workspace).toBe('database')
		expect(builder.session.value.error).not.toBeNull()
	})

	it('opens the page workspace as before for an ordinary open', async () => {
		await builder.open('/reports/sales')

		expect(builder.session.value.workspace).toBe('page')
		expect(builder.session.value.connectRequest).toBe(false)
	})
})

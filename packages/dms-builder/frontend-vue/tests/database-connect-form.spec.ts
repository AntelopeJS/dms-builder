import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DatabaseConnect from '../app/components/DatabaseConnect.vue'
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
 * *Connect a database*: the name following the database's until typed, the
 * batch written by one Connect, and the form handing over to the build screen.
 */

let backend: FakeBackend
let unmount: (() => void) | undefined

installDocumentStub()

const COMPONENTS = {
	USelect: stub('USelect'),
	USwitch: stub('USwitch'),
	DmsBuilderDiffView: stub('DmsBuilderDiffView'),
}

function button(root: TestNode, name: string): TestNode {
	const match = findAll(
		root,
		(node) => node.tag === 'UButton' && (node.props.label === name || textOf(node).trim() === name),
	)[0]
	if (!match) {
		throw new Error(`no button ${name}`)
	}
	return match
}

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(10)
	await nextTick()
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
})

afterEach(() => {
	unmount?.()
	vi.useRealTimers()
})

describe('connecting a database', () => {
	function inputs(root: TestNode): TestNode[] {
		return findAll(root, (node) => node.tag === 'UInput')
	}

	it('keeps the password when a write is refused, so the retry does not drop it', async () => {
		backend.answers['GET /api/builder/database/project'] = { modules: [] }
		backend.answers['POST /api/builder/database/project'] = { ok: true, data: { files: [] }, changes: [] }
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		const [name, , host, , database, user, password] = inputs(mounted.root)
		for (const [input, value] of [[name, 'erp'], [host, 'db.example'], [database, 'erp'], [user, 'reader'], [password, 's3cret']] as const) {
			fire(input!, 'update:modelValue', value as never)
		}
		await settle()
		backend.answers['POST /api/builder/database/project'] = {
			ok: false,
			error: { code: 'invalid_config', issues: [{ pointer: '', message: '.env is not ignored by git' }] },
		}
		fire(button(mounted.root, 'Connect'), 'click')
		await settle()
		expect(textOf(mounted.root)).toContain('.env is not ignored by git')
		expect(inputs(mounted.root)[6]?.props.modelValue).toBe('s3cret')
	})

	it('refuses a host that carries a port, before showing anything', async () => {
		backend.answers['GET /api/builder/database/project'] = { modules: [] }
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		const [name, , host, , database, user] = inputs(mounted.root)
		for (const [input, value] of [[name, 'erp'], [host, 'db.example:5433'], [database, 'erp'], [user, 'reader']] as const) {
			fire(input!, 'update:modelValue', value as never)
		}
		await settle()
		expect(button(mounted.root, 'Connect').props.disabled).toBe(true)
		expect(button(mounted.root, 'Show the changes').props.disabled).toBe(true)
		expect(textOf(mounted.root)).toContain('no spaces, port or path')
	})

	it('writes the batch with one Connect, no diff shown, and hands over the connection and its tables module', async () => {
		backend.answers['GET /api/builder/database/project'] = { modules: [] }
		backend.answers['POST /api/builder/database/project'] = { ok: true, data: { files: [] }, changes: [] }
		const written: unknown[][] = []
		const mounted = mount(DatabaseConnect, {
			components: COMPONENTS,
			props: { onWritten: (...args: unknown[]) => written.push(args) },
		})
		unmount = mounted.unmount
		await settle()
		const [, , host, , database, user, password] = inputs(mounted.root)
		for (const [input, value] of [[host, 'db.example'], [database, 'Roaster'], [user, 'reader'], [password, 'pw']] as const) {
			fire(input!, 'update:modelValue', value as never)
		}
		await settle()
		fire(button(mounted.root, 'Connect'), 'click')
		await settle()
		const writes = backend.calls.filter((call) => call.method === 'POST' && call.path === '/api/builder/database/project')
		expect(writes.map((call) => (call.body?.opts as { dryRun: boolean }).dryRun)).toEqual([false])
		expect(written).toEqual([['roaster', 'builder-db-roaster-tables']])
	})

	it('names the connection after its database until a name is typed', async () => {
		backend.answers['GET /api/builder/database/project'] = { modules: [] }
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		const database = () => inputs(mounted.root)[4]!
		const name = () => inputs(mounted.root)[0]!
		fire(database(), 'update:modelValue', 'erp' as never)
		await settle()
		expect(name().props['model-value']).toBe('erp')
		fire(name(), 'update:modelValue', 'Accounts' as never)
		await settle()
		fire(database(), 'update:modelValue', 'erp_staging' as never)
		await settle()
		expect(name().props['model-value']).toBe('Accounts')
	})

	it('writes a MongoDB database name into .env beside its URL, both by the variables named', async () => {
		backend.answers['GET /api/builder/database/project'] = { modules: [] }
		backend.answers['POST /api/builder/database/project'] = { ok: true, data: { files: [] }, changes: [] }
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		const select = findAll(mounted.root, (node) => node.tag === 'USelect')[0]
		fire(select!, 'update:modelValue', 'mongodb' as never)
		await settle()
		const [name, , host, , database, user, password] = inputs(mounted.root)
		for (const [input, value] of [[name, 'erp'], [host, 'db'], [database, 'erp_staging'], [user, 'reader'], [password, 'pw']] as const) {
			fire(input!, 'update:modelValue', value as never)
		}
		await settle()
		fire(button(mounted.root, 'Connect'), 'click')
		await settle()
		const written = backend.calls.filter(
			(call) => call.method === 'POST' && call.path === '/api/builder/database/project' && call.body?.variables,
		)
		expect(written.map((call) => call.body?.variables)).toEqual([
			[
				{ name: 'BUILDER_DB_ERP_URL', value: 'mongodb://reader:pw@db:27017/erp_staging' },
				{ name: 'BUILDER_DB_ERP_DATABASE', value: 'erp_staging' },
			],
		])
	})
})

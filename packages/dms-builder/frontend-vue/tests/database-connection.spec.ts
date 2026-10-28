import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DatabaseConnectionEdit from '../app/components/DatabaseConnectionEdit.vue'
import DatabaseConnectionRemove from '../app/components/DatabaseConnectionRemove.vue'
import type { ConnectionInfo } from '../app/runtime/database-types'
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
 * A connection after it was made: its details edited without the password
 * travelling back, and its removal shown before it is done, its tables module
 * folder among what goes.
 */

let backend: FakeBackend
let unmount: (() => void) | undefined

installDocumentStub()

const INFO: ConnectionInfo = {
	wiring: {
		connection: 'erp',
		driver: 'builder-db-erp',
		modules: [{ id: 'builder-db-erp-tables', path: 'modules/builder-db-erp-tables' }],
		unrecorded: [],
		ownsDriver: true,
		variable: 'BUILDER_DB_ERP_URL',
		variables: ['BUILDER_DB_ERP_URL'],
	},
	details: {
		scheme: 'postgres',
		host: 'db.example',
		port: '5432',
		database: 'erp',
		user: 'reader',
		hasPassword: true,
		options: { sslmode: 'require' },
	},
}

const COMPONENTS = {
	USelect: stub('USelect'),
	USwitch: stub('USwitch'),
	UCheckbox: stub('UCheckbox'),
	DmsBuilderDiffView: stub('DmsBuilderDiffView'),
	DmsBuilderFoldCard: stub('DmsBuilderFoldCard'),
}

const REMOVE = '/api/builder/database/connection/remove'

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

function only(root: TestNode, tag: string): TestNode {
	const match = findAll(root, (node) => node.tag === tag)[0]
	if (!match) {
		throw new Error(`no ${tag}`)
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
	backend.answers[`POST ${REMOVE}`] = { ok: true, data: { files: [] }, changes: [] }
	backend.answers['POST /api/builder/database/connection/url'] = {
		ok: true,
		data: { variable: 'BUILDER_DB_ERP_URL' },
		changes: [],
	}
})

afterEach(() => {
	unmount?.()
	vi.useRealTimers()
})

describe('removing a connection', () => {
	it('shows its changes first, the module folder among them, then removes', async () => {
		const mounted = mount(DatabaseConnectionRemove, {
			props: { connection: 'erp', info: INFO },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		const removals = () => backend.calls.filter((call) => call.path === REMOVE).map((call) => call.body)
		expect(removals()).toEqual([{ connection: 'erp', dryRun: true }])
		expect(textOf(mounted.root)).toContain('delete modules/builder-db-erp-tables')

		fire(button(mounted.root, 'Remove erp'), 'click')
		await settle()
		expect(removals().at(-1)).toEqual({ connection: 'erp', dryRun: false })
		expect(textOf(mounted.root)).toContain('Removed. Restart the project.')
	})
})

describe('removing a connection whose driver is shared', () => {
	it('says it keeps the driver and its URL', async () => {
		const mounted = mount(DatabaseConnectionRemove, {
			props: { connection: 'erp', info: { ...INFO, wiring: { ...INFO.wiring, ownsDriver: false } } },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		expect(textOf(mounted.root)).toContain('keep the driver builder-db-erp and its URL')
		expect(textOf(mounted.root)).not.toContain('envOverrides')
	})
})

describe('editing a connection through a socket directory', () => {
	it('shows its details, and saves the directory as the driver reads it', async () => {
		const details = { ...INFO.details!, host: '/var/run/postgresql', port: '' }
		const mounted = mount(DatabaseConnectionEdit, {
			props: { connection: 'erp', info: { ...INFO, details } },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		fire(button(mounted.root, 'Save'), 'click')
		await settle()
		const saved = backend.calls.find((call) => call.path === '/api/builder/database/connection/url')
		expect(saved?.body).toEqual({
			connection: 'erp',
			url: 'postgres://reader@%2Fvar%2Frun%2Fpostgresql/erp?sslmode=require',
		})
	})
})

describe('editing a connection', () => {
	it('fills its details, and saves a URL without the password when it was left empty', async () => {
		const mounted = mount(DatabaseConnectionEdit, {
			props: { connection: 'erp', info: INFO },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		fire(button(mounted.root, 'Save'), 'click')
		await settle()
		const saved = backend.calls.find((call) => call.path === '/api/builder/database/connection/url')
		expect(saved?.body).toEqual({
			connection: 'erp',
			url: 'postgres://reader@db.example:5432/erp?sslmode=require',
		})
		expect(textOf(mounted.root)).toContain('Saved. Restart the project.')
	})
})

describe('editing a connection saved as postgresql://', () => {
	it('keeps its scheme, and asks for the password once the host changes', async () => {
		const details = { ...INFO.details!, scheme: 'postgresql' }
		const mounted = mount(DatabaseConnectionEdit, {
			props: { connection: 'erp', info: { ...INFO, details } },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		const host = findAll(mounted.root, (node) => node.tag === 'UInput')[0]!
		fire(host, 'update:modelValue', 'db2.example')
		await settle()
		expect(button(mounted.root, 'Save').props.disabled).toBe(true)
		fire(host, 'update:modelValue', 'db.example')
		await settle()
		fire(button(mounted.root, 'Save'), 'click')
		await settle()
		const saved = backend.calls.find((call) => call.path === '/api/builder/database/connection/url')
		expect(saved?.body).toEqual({
			connection: 'erp',
			url: 'postgresql://reader@db.example:5432/erp?sslmode=require',
		})
	})
})

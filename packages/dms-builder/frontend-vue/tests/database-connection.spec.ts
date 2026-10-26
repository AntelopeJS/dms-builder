import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DatabaseConnect from '../app/components/DatabaseConnect.vue'
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
 * travelling back, and its removal shown before it is done, the module folder
 * kept for a later connection unless asked.
 */

let backend: FakeBackend
let unmount: (() => void) | undefined

installDocumentStub()

const INFO: ConnectionInfo = {
	wiring: {
		connection: 'erp',
		driver: 'builder-db-erp',
		modules: [{ id: 'builder-db-erp-tables', path: 'modules/builder-db-erp-tables' }],
		variable: 'BUILDER_DB_ERP_URL',
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
	it('shows its changes first, keeps the module folder unless asked, then removes', async () => {
		const mounted = mount(DatabaseConnectionRemove, {
			props: { connection: 'erp', info: INFO },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		const removals = () => backend.calls.filter((call) => call.path === REMOVE).map((call) => call.body)
		expect(removals()).toEqual([{ connection: 'erp', deleteFolders: false, dryRun: true }])

		fire(only(mounted.root, 'UCheckbox'), 'update:modelValue', true)
		await settle()
		expect(removals().at(-1)).toEqual({ connection: 'erp', deleteFolders: true, dryRun: true })
		fire(only(mounted.root, 'UCheckbox'), 'update:modelValue', false)
		await settle()

		fire(button(mounted.root, 'Remove erp'), 'click')
		await settle()
		expect(removals().at(-1)).toEqual({ connection: 'erp', deleteFolders: false, dryRun: false })
		expect(textOf(mounted.root)).toContain('modules/builder-db-erp-tables is kept')
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

describe('connecting a database when a module was kept', () => {
	it('offers the kept module for the tables', async () => {
		backend.answers['GET /api/builder/database/project'] = { modules: [] }
		backend.answers['GET /api/builder/database/adoptable'] = [
			{ path: 'modules/old-tables', name: 'old-tables', connection: 'legacy' },
		]
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		const select = findAll(
			mounted.root,
			(node) => node.tag === 'USelect' && JSON.stringify(node.props.items).includes('old-tables'),
		)[0]
		expect(select?.props.items).toEqual([
			{ label: 'A new module', value: 'new' },
			{ label: 'modules/old-tables, kept from legacy', value: 'modules/old-tables' },
		])
	})
})

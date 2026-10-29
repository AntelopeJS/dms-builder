import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DatabaseBuild from '../app/components/DatabaseBuild.vue'
import type { AnalysisState, ConnectionInfo, MappingProposal } from '../app/runtime/database-types'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { findAll, fire, installDocumentStub, mount, textOf, type TestNode } from './support/render'

/**
 * The build screen of a connection just written: it follows the reload through
 * failed requests, starts the analysis once connected, and stops at the fork.
 */

let backend: FakeBackend
let unmount: (() => void) | undefined

installDocumentStub()

const CONNECTION = 'GET /api/builder/database/connection'
const CONNECTIONS = 'GET /api/builder/database/connections'
const ANALYSIS = 'GET /api/builder/database/analysis'
const ANALYSE = 'POST /api/builder/database/analyse'

const INFO: ConnectionInfo = {
	wiring: {
		connection: 'orb',
		driver: 'builder-db-orb',
		modules: [{ id: 'builder-db-orb-tables', path: 'modules/builder-db-orb-tables' }],
		unrecorded: [],
		ownsDriver: true,
		variable: 'BUILDER_DB_ORB_URL',
		variables: ['BUILDER_DB_ORB_URL'],
	},
}

const PROPOSAL: MappingProposal = {
	connection: 'orb',
	module: 'builder-db-orb-tables',
	database: { engine: 'postgresql', role: 'reader', writes: 'none' },
	resources: [
		{
			relation: 'public.orders',
			tableView: { value: true, rule: 'R1', kind: 'default' },
			writable: { value: false, rule: 'W1', kind: 'default' },
			label: { value: null, rule: 'L1', kind: 'default' },
			title: { value: 'Orders', rule: 'T1', kind: 'default' },
			fields: [],
			leftOut: [],
			writes: { insert: false, update: false, delete: false },
		},
	],
	excluded: [],
	open: [],
}

function analysis(status: AnalysisState['status']): { ok: true; data: AnalysisState; changes: [] } {
	return {
		ok: true,
		data: {
			id: 'job-7',
			connection: 'orb',
			status,
			progress: { relations: 1, described: 1, toProfile: 1, profiled: status === 'done' ? 1 : 0, timeouts: 0 },
			proposal: status === 'done' ? PROPOSAL : undefined,
		},
		changes: [],
	}
}

function down(): Error {
	return new Error('fetch failed')
}

function notFound(): Error {
	return Object.assign(new Error('404'), { data: { code: 'not_found' } })
}

function backendDown(): void {
	backend.answers[CONNECTION] = down()
	backend.answers[CONNECTIONS] = down()
	backend.answers[ANALYSIS] = down()
}

function stepStatus(root: TestNode, key: string): unknown {
	return findAll(root, (node) => node.props['data-step'] === key)[0]?.props['data-status']
}

function button(root: TestNode, name: string): TestNode | undefined {
	return findAll(root, (node) => node.tag === 'UButton' && node.props.label === name)[0]
}

async function tick(ms = 1000): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms)
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

describe('building a connection just written', () => {
	it('follows the reload, starts the analysis once connected, and forks on its job', async () => {
		backendDown()
		const reviewed: string[] = []
		const mounted = mount(DatabaseBuild, {
			props: { connection: 'orb', module: 'builder-db-orb-tables', onReview: (job: string) => reviewed.push(job) },
		})
		unmount = mounted.unmount
		await tick(10)
		expect(stepStatus(mounted.root, 'reload')).toBe('running')
		expect(textOf(mounted.root)).toContain('about 15 seconds')

		backend.answers[CONNECTION] = INFO
		backend.answers[CONNECTIONS] = [{ id: 'orb', engine: 'postgresql', version: '16.15', database: 'orb', role: 'reader' }]
		backend.answers[ANALYSIS] = notFound()
		backend.answers[ANALYSE] = analysis('running')
		await tick()
		expect(stepStatus(mounted.root, 'connect')).toBe('done')
		expect(backend.calls.filter((call) => `${call.method} ${call.path}` === ANALYSE)).toHaveLength(1)
		expect(backend.calls.find((call) => `${call.method} ${call.path}` === ANALYSE)?.body).toMatchObject({
			connection: 'orb',
			module: 'builder-db-orb-tables',
		})

		backend.answers[ANALYSIS] = analysis('running')
		await tick()
		expect(stepStatus(mounted.root, 'read')).toBe('running')
		expect(button(mounted.root, 'Review it myself')).toBeUndefined()

		backend.answers[ANALYSIS] = analysis('done')
		await tick()
		expect(textOf(mounted.root)).toContain('1 table: 1 page, 0 for statistics, 0 questions')
		fire(button(mounted.root, 'Review it myself')!, 'click')
		expect(reviewed).toEqual(['job-7'])
		expect(backend.calls.filter((call) => `${call.method} ${call.path}` === ANALYSE)).toHaveLength(1)
	})

	it('shows how to restart by hand once the project has been away 3 minutes', async () => {
		backendDown()
		const mounted = mount(DatabaseBuild, { props: { connection: 'orb', module: 'builder-db-orb-tables' } })
		unmount = mounted.unmount
		await tick(10)
		await tick(3 * 60 * 1000 - 2000)
		expect(stepStatus(mounted.root, 'reload')).toBe('running')
		await tick(3000)
		expect(stepStatus(mounted.root, 'reload')).toBe('failed')
		expect(textOf(mounted.root)).toContain('Restart it by hand')
		expect(button(mounted.root, 'Remove')).toBeDefined()
	})

	it('offers Edit and Remove when the connection reports an error', async () => {
		backend.answers[CONNECTION] = INFO
		backend.answers[CONNECTIONS] = [
			{ id: 'orb', error: 'PostgreSQL adapter is not connected: wrong user or password (28P01)' },
		]
		backend.answers[ANALYSIS] = notFound()
		let edits = 0
		const mounted = mount(DatabaseBuild, {
			props: { connection: 'orb', module: 'builder-db-orb-tables', onEdit: () => (edits += 1) },
		})
		unmount = mounted.unmount
		await tick(10)
		expect(stepStatus(mounted.root, 'connect')).toBe('failed')
		expect(textOf(mounted.root)).toContain('wrong user or password')
		expect(button(mounted.root, 'Remove')).toBeDefined()
		fire(button(mounted.root, 'Edit the connection')!, 'click')
		expect(edits).toBe(1)
		expect(backend.calls.some((call) => `${call.method} ${call.path}` === ANALYSE)).toBe(false)
	})
})

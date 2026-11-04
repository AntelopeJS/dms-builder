import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DatabaseApplied from '../app/components/DatabaseApplied.vue'
import DatabaseApplySummary from '../app/components/DatabaseApplySummary.vue'
import DatabaseBuild from '../app/components/DatabaseBuild.vue'
import DatabaseConnect from '../app/components/DatabaseConnect.vue'
import DatabasePanel from '../app/components/DatabasePanel.vue'
import DatabasePromptCopy from '../app/components/DatabasePromptCopy.vue'
import DatabaseProposal from '../app/components/DatabaseProposal.vue'
import DatabaseRelation from '../app/components/DatabaseRelation.vue'
import { ASSISTANT_ACTIONS_KEY } from '../app/runtime/database-build'
import type { AnalysisState, MappingProposal, ProposedField, ProposedResource } from '../app/runtime/database-types'
import { t } from '../app/runtime/i18n'
import english from '../i18n/locales/builder-en-GB.json'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { findAll, fire, installDocumentStub, mount, stub, textOf, walk, type TestNode } from './support/render'
import { setTestLocale } from './stubs/frontend-module'

/**
 * The Database workspace in French: every screen shows its text from the
 * French catalog. A component that draws a literal again shows the English
 * sentence its catalog entry still holds, and fails here.
 */

type Messages = { [key: string]: string | Messages }

let backend: FakeBackend
let unmount: (() => void) | undefined

installDocumentStub()

const COMPONENTS = {
	USelect: stub('USelect'),
	USwitch: stub('USwitch'),
	DmsEyebrow: stub('DmsEyebrow'),
	UPopover: stub('UPopover'),
	DmsBuilderDiffView: stub('DmsBuilderDiffView'),
	DmsBuilderFoldCard: stub('DmsBuilderFoldCard'),
	DmsBuilderDatabaseRelation: DatabaseRelation,
	DmsBuilderDatabaseApplySummary: DatabaseApplySummary,
	DmsBuilderDatabaseApplied: DatabaseApplied,
	DmsBuilderDatabasePromptCopy: DatabasePromptCopy,
	DmsBuilderDatabaseConnect: DatabaseConnect,
	DmsBuilderDatabaseBuild: DatabaseBuild,
	DmsBuilderDatabaseProposal: DatabaseProposal,
}

function sentences(messages: Messages, into: string[] = []): string[] {
	for (const value of Object.values(messages)) {
		if (typeof value === 'string') {
			into.push(...value.split(' | ').flatMap((form) => form.split(/\{\w+\}/)))
		} else {
			sentences(value, into)
		}
	}
	return into
}

const ENGLISH_SENTENCES = sentences((english as unknown as { dms_builder: { database: Messages } }).dms_builder.database)
	.map((text) => text.trim())
	.filter((text) => text.length >= 14 && text.includes(' '))

/** Everything a screen shows: its text and the labels it hands its controls. */
function shown(root: TestNode): string {
	const attributes = ['label', 'placeholder', 'help', 'title', 'description', 'aria-label']
	const labels = walk(root).flatMap((node) =>
		attributes.map((name) => node.props[name]).filter((value): value is string => typeof value === 'string'),
	)
	return [textOf(root), ...labels].join('\n')
}

function expectFrench(root: TestNode, french: string): void {
	const text = shown(root)
	expect(text).toContain(french)
	expect(ENGLISH_SENTENCES.filter((sentence) => text.includes(sentence))).toEqual([])
}

function button(root: TestNode, name: string): TestNode {
	const match = findAll(root, (node) => node.tag === 'UButton' && node.props.label === name)[0]
	if (!match) throw new Error(`no button ${name}`)
	return match
}

async function settle(ms = 10): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms)
	await nextTick()
}

function field(column: string): ProposedField {
	const proposed = <T>(value: T, rule = 'R6') => ({ value, rule, kind: 'default' as const })
	return {
		column,
		native: 'text',
		accepts: ['string'],
		declared: proposed('string', 'F3'),
		label: proposed(column, 'L2'),
		listable: proposed(true, 'FL'),
		filterable: proposed(false, 'FL'),
		sortable: proposed(false, 'FL'),
		searchable: proposed(false, 'FL'),
		profile: { traits: [], nulls: 10, distinct: 25 },
	}
}

const CUSTOMERS: ProposedResource = {
	relation: 'erp.customers',
	tableView: { value: true, rule: 'R6', kind: 'default' },
	writable: { value: false, rule: 'W1', kind: 'default' },
	label: { value: 'name', rule: 'L1', kind: 'default' },
	title: { value: 'Customers', rule: 'L2', kind: 'default' },
	fields: [field('code'), field('name')],
	leftOut: [],
	writes: { insert: false, update: false, delete: false },
	rows: 4000,
	profiledRows: 40,
}

const PROPOSAL: MappingProposal = {
	connection: 'erp',
	module: 'erp-tables',
	database: { engine: 'postgresql 17.5', role: 'erp_reader', writes: 'none' },
	resources: [CUSTOMERS],
	excluded: [],
	open: [],
}

const DONE: AnalysisState = {
	id: 'job-1',
	connection: 'erp',
	status: 'done',
	progress: { relations: 1, described: 1, toProfile: 1, profiled: 1, timeouts: 0 },
	proposal: PROPOSAL,
}

beforeEach(() => {
	vi.useFakeTimers()
	setTestLocale('fr-FR')
	backend = installFakeHost()
	backend.answers['GET /api/builder/database/connections'] = []
	backend.answers['GET /api/builder/database/analysis'] = { ok: true, data: DONE, changes: [] }
	backend.answers['POST /api/builder/database/analyse'] = { ok: true, data: { ...DONE, status: 'running', proposal: undefined }, changes: [] }
	backend.answers['GET /api/builder/database/mapping'] = { ok: true, data: [], changes: [] }
	backend.answers['POST /api/builder/database/sample'] = {
		relation: 'erp.customers',
		columns: ['code', 'name'],
		rows: [[{ text: 'C0000001', truncated: false }, { text: 'Ada Lovelace', truncated: false }]],
		sample: null,
	}
	backend.answers['GET /api/builder/database/connection'] = {
		wiring: {
			connection: 'erp',
			driver: 'builder-db-erp',
			modules: [{ id: 'erp-tables', path: 'modules/erp-tables' }],
			unrecorded: [],
			ownsDriver: true,
			variable: 'BUILDER_DB_ERP_URL',
			variables: ['BUILDER_DB_ERP_URL'],
		},
	}
})

afterEach(() => {
	unmount?.()
	setTestLocale('en-GB')
	vi.useRealTimers()
})

describe('the Database workspace in French', () => {
	it('shows the connect form in French', async () => {
		const mounted = mount(DatabaseConnect, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		expectFrench(mounted.root, t('database.connect.title'))
		expect(shown(mounted.root)).not.toContain('Connect a database')
	})

	it('shows the databases list with nothing connected in French', async () => {
		const mounted = mount(DatabasePanel, { components: COMPONENTS })
		unmount = mounted.unmount
		await settle()
		expectFrench(mounted.root, t('database.panel.empty'))
	})

	it('shows the build steps and the fork in French', async () => {
		backend.answers['GET /api/builder/database/connections'] = [
			{ id: 'erp', engine: 'postgresql', version: '17.5', database: 'erp', role: 'erp_reader' },
		]
		const assistant = { isAvailable: true, startConversation: () => undefined }
		const mounted = mount(DatabaseBuild, {
			props: { connection: 'erp', module: 'erp-tables' },
			components: COMPONENTS,
			provide: [[ASSISTANT_ACTIONS_KEY, assistant]],
		})
		unmount = mounted.unmount
		await settle(1000)
		expectFrench(mounted.root, t('database.build.add.title'))
		expect(button(mounted.root, t('database.build.finish'))).toBeDefined()
		expect(shown(mounted.root)).toContain(t('database.build.undecided'))
	})

	it('shows the proposal and an opened relation in French', async () => {
		const mounted = mount(DatabaseProposal, {
			props: { connection: 'erp', module: 'erp-tables' },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		fire(button(mounted.root, t('database.proposal.analyse')), 'click')
		await settle()
		expectFrench(mounted.root, t('database.proposal.analyse_again'))
		const relation = findAll(mounted.root, (node) => node.tag === 'UButton' && textOf(node).includes('erp.customers'))[0]!
		fire(relation, 'click')
		await settle()
		expectFrench(mounted.root, t('database.proposal.apply'))
	})

	it('shows the applied card and the Copy prompt popover in French', async () => {
		const mounted = mount(DatabaseApplied, {
			props: { tables: 3, connection: 'erp', module: 'erp-tables', warnings: [], handedOff: false, canHandOff: true },
			components: COMPONENTS,
		})
		unmount = mounted.unmount
		await settle()
		expectFrench(mounted.root, t('database.applied.title'))
		expect(button(mounted.root, t('database.applied.hand_off'))).toBeDefined()
		expect(shown(mounted.root)).toContain(t('database.copy.label'))
	})
})

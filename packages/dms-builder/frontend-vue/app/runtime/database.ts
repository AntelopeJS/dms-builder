/**
 * The builder's decision code for a database mapping: the proposal the analysis
 * answered, turned into a draft the integrator edits, and the draft turned into
 * the `MapResources` call Apply sends. The draft holds choices only, never a
 * profile or a sampled row, so it is safe to keep in the browser.
 */
import type {
	MapResourcesInput,
	MappedField,
	MappedResource,
	MappingProposal,
	ModuleEntryInput,
	OpenItem,
	ProjectConfigStep,
	ProposedField,
	ProposedResource,
} from './database-types'

const CATALOG_INTERFACE = '@antelopejs/interface-database-catalog'
const DATABASE_INTERFACE = '@antelopejs/interface-database'
const POSTGRES_PACKAGE = '@antelopejs-private/postgres'
const STATEMENT_TIMEOUT_MS = 30000
const DRAFT_PREFIX = 'dms-builder:database:'
/** How long a mapping draft nobody came back to is kept. */
export const KEEP_MAPPING_DRAFT_MS = 7 * 24 * 60 * 60 * 1000

export interface FieldDraft {
	column: string
	include: boolean
	declared: string
	label: string
	listable: boolean
	filterable: boolean
	sortable: boolean
	searchable: boolean
	relation: string | null
}

export interface ResourceDraft {
	relation: string
	include: boolean
	tableView: boolean
	writable: boolean
	label: string | null
	title: string
	fields: FieldDraft[]
}

export interface MappingDraft {
	connection: string
	module: string
	resources: ResourceDraft[]
	/** Open items answered, by id. */
	answers: Record<string, unknown>
	/** Relations decided against here, with why. */
	excluded: Record<string, string>
}

function fieldDraft(field: ProposedField): FieldDraft {
	return {
		column: field.column,
		include: true,
		declared: field.declared.value,
		label: field.label.value,
		listable: field.listable.value,
		filterable: field.filterable.value,
		sortable: field.sortable.value,
		searchable: field.searchable.value,
		relation: field.relation?.value ?? null,
	}
}

function resourceDraft(resource: ProposedResource, include: boolean): ResourceDraft {
	return {
		relation: resource.relation,
		include,
		tableView: resource.tableView.value,
		writable: resource.writable.value,
		label: resource.label.value,
		title: resource.title.value,
		fields: resource.fields.map(fieldDraft),
	}
}

/** The proposal as it stands, every proposed relation in and every question unanswered. */
export function draftFromProposal(proposal: MappingProposal): MappingDraft {
	const asked = proposal.open
		.filter((item) => item.kind === 'purpose' && item.resource)
		.map((item) => resourceDraft(item.resource!, false))
	return {
		connection: proposal.connection,
		module: proposal.module,
		resources: [
			...proposal.resources.map((resource) => resourceDraft(resource, true)),
			...asked,
		],
		answers: {},
		excluded: {},
	}
}

export function resourceIn(
	draft: MappingDraft,
	relation: string | undefined,
): ResourceDraft | undefined {
	return draft.resources.find((resource) => resource.relation === relation)
}

const PURPOSE_ANSWERS: Record<string, (resource: ResourceDraft, draft: MappingDraft) => void> = {
	tableView: (resource, draft) => {
		resource.include = true
		resource.tableView = true
		delete draft.excluded[resource.relation]
	},
	statsOnly: (resource, draft) => {
		resource.include = true
		resource.tableView = false
		delete draft.excluded[resource.relation]
	},
	excluded: (resource, draft) => {
		resource.include = false
		draft.excluded[resource.relation] = 'decided against in the builder'
	},
}

/** Answers an open item in the draft: the relation, label or reference it asks about follows. */
export function answerItem(draft: MappingDraft, item: OpenItem, value: unknown): void {
	draft.answers[item.id] = value
	const resource = resourceIn(draft, item.relation)
	if (!resource) {
		return
	}
	if (item.kind === 'purpose') {
		PURPOSE_ANSWERS[String(value)]?.(resource, draft)
	} else if (item.kind === 'label') {
		resource.label = typeof value === 'string' ? value : null
	} else if (item.kind === 'reference') {
		const field = resource.fields.find((candidate) => candidate.column === item.column)
		if (field) {
			field.relation = typeof value === 'string' ? value : null
		}
	}
}

/** Checks a relation in or out of the mapping; out, it is recorded as decided against. */
export function includeResource(draft: MappingDraft, relation: string, include: boolean): void {
	const resource = resourceIn(draft, relation)
	if (!resource) {
		return
	}
	resource.include = include
	if (include) {
		delete draft.excluded[relation]
	} else {
		draft.excluded[relation] = 'decided against in the builder'
	}
}

/** A relation column survives only onto a relation this mapping keeps as a TableView, or one outside it. */
function relationKept(draft: MappingDraft, relation: string | null): string | undefined {
	if (!relation) {
		return undefined
	}
	const target = resourceIn(draft, relation)
	return !target || (target.include && target.tableView) ? relation : undefined
}

function mappedField(draft: MappingDraft, field: FieldDraft): MappedField {
	const mapped: MappedField = {
		column: field.column,
		label: field.label,
		listable: field.listable,
		filterable: field.filterable,
		sortable: field.sortable,
		searchable: field.searchable,
	}
	const relation = relationKept(draft, field.relation)
	if (relation) {
		mapped.relation = relation
	} else {
		mapped.declared = field.declared
	}
	return mapped
}

function mappedResource(draft: MappingDraft, resource: ResourceDraft): MappedResource {
	const mapped: MappedResource = {
		relation: resource.relation,
		title: resource.title,
		tableView: resource.tableView,
		writable: resource.writable,
		fields: resource.fields
			.filter((field) => field.include)
			.map((field) => mappedField(draft, field)),
	}
	if (resource.label) {
		mapped.label = resource.label
	}
	return mapped
}

/**
 * The one `MapResources` call Apply sends: the relations kept, and the ones
 * decided against — the analysis's exclusions the integrator let stand, and
 * their own — so the next analysis does not propose them again. A question left
 * unanswered is not recorded, and comes back next time.
 */
export function settledInput(proposal: MappingProposal, draft: MappingDraft): MapResourcesInput {
	const excluded = new Map<string, string>(
		proposal.excluded.map((entry) => [entry.relation, entry.reason]),
	)
	for (const [relation, reason] of Object.entries(draft.excluded)) {
		excluded.set(relation, reason)
	}
	return {
		module: draft.module,
		connection: draft.connection,
		resources: draft.resources
			.filter((resource) => resource.include)
			.map((resource) => mappedResource(draft, resource)),
		excluded: [...excluded].map(([relation, reason]) => ({ relation, reason })),
	}
}

/** The open items the draft has not answered yet. */
export function unanswered(proposal: MappingProposal, draft: MappingDraft): OpenItem[] {
	return proposal.open.filter((item) => !(item.id in draft.answers))
}

/** What the *Connect a database* form asks for. */
export interface ConnectForm {
	connection: string
	providerModule: string
	generatedModule: string
	variable: string
	postgresVersion: string
	/** Whether the DMS modules are pinned to their database already, so mongodb needs no priority. */
	dmsPinned: boolean
	/** Whether the project has dms-ai, which then gets its own connection. */
	withDmsAi: boolean
}

function catalogConnection(form: ConnectForm): ModuleEntryInput {
	return {
		importOverrides: [
			{ interface: CATALOG_INTERFACE, source: form.providerModule, id: form.connection },
		],
	}
}

/** The `ConfigureProject` batch that wires the database into the project, as design §1 lists it. */
export function connectSteps(form: ConnectForm): ProjectConfigStep[] {
	const steps: ProjectConfigStep[] = [
		{
			op: 'AddModule',
			id: form.providerModule,
			entry: {
				source: { type: 'package', package: POSTGRES_PACKAGE, version: form.postgresVersion },
				config: { mode: 'external', statementTimeoutMs: STATEMENT_TIMEOUT_MS },
				env: { url: form.variable },
			},
		},
		{
			op: 'CreateLocalModule',
			id: form.generatedModule,
			path: `modules/${form.generatedModule}`,
			entry: {
				importOverrides: [{ interface: DATABASE_INTERFACE, source: form.providerModule }],
			},
		},
	]
	if (!form.dmsPinned) {
		steps.push({
			op: 'ConfigureModule',
			id: 'mongodb',
			entry: { exportPriority: { [DATABASE_INTERFACE]: 1 } },
		})
	}
	steps.push({ op: 'ConfigureModule', id: 'dms-builder', entry: catalogConnection(form) })
	if (form.withDmsAi) {
		steps.push({ op: 'ConfigureModule', id: 'dms-ai', entry: catalogConnection(form) })
	}
	return steps
}

interface StoredMapping {
	draft: MappingDraft
	at: number
}

function storage(): Storage | undefined {
	try {
		return globalThis.localStorage ?? undefined
	} catch {
		return undefined
	}
}

export function storeMappingDraft(draft: MappingDraft, now = Date.now()): void {
	try {
		const value: StoredMapping = { draft, at: now }
		storage()?.setItem(`${DRAFT_PREFIX}${draft.connection}`, JSON.stringify(value))
	} catch {
		// Storage refused: the draft lives in the workspace until it closes.
	}
}

export function forgetMappingDraft(connection: string): void {
	try {
		storage()?.removeItem(`${DRAFT_PREFIX}${connection}`)
	} catch {
		// Nothing kept, nothing to forget.
	}
}

/** The draft kept for a connection, unless there is none, it is for another module, or it is too old. */
export function storedMappingDraft(
	connection: string,
	module: string,
	now = Date.now(),
): MappingDraft | undefined {
	let raw: string | null | undefined
	try {
		raw = storage()?.getItem(`${DRAFT_PREFIX}${connection}`)
	} catch {
		return undefined
	}
	if (!raw) {
		return undefined
	}
	try {
		const value = JSON.parse(raw) as StoredMapping
		if (value.draft?.module !== module || now - value.at > KEEP_MAPPING_DRAFT_MS) {
			forgetMappingDraft(connection)
			return undefined
		}
		return value.draft
	} catch {
		forgetMappingDraft(connection)
		return undefined
	}
}

/**
 * A kept draft laid over a fresh proposal: its choices for the relations both
 * know, the proposal's for the rest. The analysis is deterministic, so a draft
 * made on the last run fits the next one.
 */
export function mergedDraft(proposal: MappingProposal, kept: MappingDraft | undefined): MappingDraft {
	const fresh = draftFromProposal(proposal)
	if (!kept) {
		return fresh
	}
	return {
		...fresh,
		resources: fresh.resources.map(
			(resource) => resourceIn(kept, resource.relation) ?? resource,
		),
		answers: { ...kept.answers },
		excluded: { ...kept.excluded },
	}
}

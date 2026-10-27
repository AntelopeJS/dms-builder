/**
 * The builder's decision code for a database mapping: the proposal the analysis
 * answered, turned into a draft the integrator edits, and the draft turned into
 * the `MapResources` call Apply sends. The draft holds choices only, never a
 * profile or a sampled row, so it is safe to keep in the browser.
 */
import type {
	MapResourcesInput,
	MappedField,
	MappedRelation,
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

/**
 * A column of several native types, declared as the answer says or left out: it was left out of
 * the proposal, so a declaration adds it as a plain field nobody lists, filters or sorts yet.
 */
function answerFieldType(resource: ResourceDraft, item: OpenItem, value: unknown): void {
	const column = item.column ?? ''
	resource.fields = resource.fields.filter((field) => field.column !== column)
	if (typeof value !== 'string') {
		return
	}
	resource.fields.push({
		column,
		include: true,
		declared: value,
		label: column,
		listable: false,
		filterable: false,
		sortable: false,
		searchable: false,
		relation: null,
	})
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
	} else if (item.kind === 'field-type') {
		answerFieldType(resource, item, value)
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

/**
 * A relation column survives only onto a TableView: one this mapping keeps as
 * such, or one the module maps already.
 */
function relationKept(
	draft: MappingDraft,
	relation: string | null,
	mappedTableViews: ReadonlySet<string>,
): string | undefined {
	if (!relation) {
		return undefined
	}
	const target = resourceIn(draft, relation)
	if (target) {
		return target.include && target.tableView ? relation : undefined
	}
	return mappedTableViews.has(relation) ? relation : undefined
}

function mappedField(
	draft: MappingDraft,
	field: FieldDraft,
	mappedTableViews: ReadonlySet<string>,
): MappedField {
	const mapped: MappedField = {
		column: field.column,
		label: field.label,
		listable: field.listable,
		filterable: field.filterable,
		sortable: field.sortable,
		searchable: field.searchable,
	}
	const relation = relationKept(draft, field.relation, mappedTableViews)
	if (relation) {
		mapped.relation = relation
	} else {
		mapped.declared = field.declared
	}
	return mapped
}

function mappedResource(
	draft: MappingDraft,
	resource: ResourceDraft,
	mappedTableViews: ReadonlySet<string>,
): MappedResource {
	const mapped: MappedResource = {
		relation: resource.relation,
		tableView: resource.tableView,
		writable: resource.tableView && resource.writable,
		fields: resource.fields
			.filter((field) => field.include)
			.map((field) => mappedField(draft, field, mappedTableViews)),
	}
	if (resource.title.trim()) {
		mapped.title = resource.title.trim()
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
export function settledInput(
	proposal: MappingProposal,
	draft: MappingDraft,
	mappedTableViews: ReadonlySet<string> = new Set(),
): MapResourcesInput {
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
			.map((resource) => mappedResource(draft, resource, mappedTableViews)),
		excluded: [...excluded].map(([relation, reason]) => ({ relation, reason })),
	}
}

/**
 * The open items the draft has not answered yet: a purpose item's own questions count once the
 * answer maps its relation.
 */
export function unanswered(proposal: MappingProposal, draft: MappingDraft): OpenItem[] {
	const asked = proposal.open.flatMap((item) =>
		item.kind === 'purpose' && resourceIn(draft, item.relation)?.include ? [item, ...(item.open ?? [])] : [item],
	)
	return asked.filter((item) => !(item.id in draft.answers))
}

/** The engines an external database can be served by. */
export type DatabaseEngine = 'postgres' | 'mongodb' | 'rethinkdb'

/** What wiring one engine's provider takes, beside the names the form asks for. */
export interface EngineWiring {
	title: string
	package: string
	providerModule: string
	urlExample: string
	/** A version range of the provider package that serves an external database. */
	versionExample: string
	/** The account to connect with, in the engine's own words. */
	accountAdvice: string
	/** The raw-client interface the provider implements, which core must never offer from it. */
	rawInterface?: string
	/** Whether the database is a config value of its own, rather than part of the URL. */
	separateDatabase: boolean
}

export const ENGINES: Record<DatabaseEngine, EngineWiring> = {
	postgres: {
		title: 'PostgreSQL',
		package: '@antelopejs/postgres',
		providerModule: 'postgres-erp',
		urlExample: 'postgres://reader:…@host:5432/erp',
		versionExample: '^0.2.2',
		accountAdvice: 'A role with SELECT on the schemas to map, and writes only where pages edit.',
		separateDatabase: false,
	},
	mongodb: {
		title: 'MongoDB',
		package: '@antelopejs/mongodb',
		providerModule: 'mongodb-erp',
		urlExample: 'mongodb://reader:…@host:27017/?authSource=erp',
		versionExample: '^1.6.0',
		accountAdvice: 'A user with the built-in read role, and writes only on the collections pages edit.',
		rawInterface: '@antelopejs/interface-mongodb',
		separateDatabase: true,
	},
	rethinkdb: {
		title: 'RethinkDB',
		package: '@antelopejs/rethinkdb',
		providerModule: 'rethinkdb-erp',
		urlExample: 'rethinkdb://reader:…@host:28015/erp',
		versionExample: '^1.6.0',
		accountAdvice: 'A user with read permission on the database, and write only on the tables pages edit.',
		rawInterface: '@antelopejs/interface-rethinkdb',
		separateDatabase: false,
	},
}

/** What the *Connect a database* form asks for. */
export interface ConnectForm {
	engine: DatabaseEngine
	connection: string
	providerModule: string
	generatedModule: string
	variable: string
	/** MongoDB only: the variable holding the database name. */
	databaseVariable: string
	version: string
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

/** The provider's entry: its package, external mode, and its secrets by variable name only. */
function providerEntry(form: ConnectForm): ModuleEntryInput {
	const wiring = ENGINES[form.engine]
	const entry: ModuleEntryInput = {
		source: { type: 'package', package: wiring.package, version: form.version },
		config: { mode: 'external', statementTimeoutMs: STATEMENT_TIMEOUT_MS },
		env: wiring.separateDatabase
			? { url: form.variable, database: form.databaseVariable }
			: { url: form.variable },
	}
	if (wiring.rawInterface) {
		entry.disabledExports = [wiring.rawInterface]
	}
	return entry
}

/** The `ConfigureProject` batch that wires the database into the project, as design §1 lists it. */
export function connectSteps(form: ConnectForm): ProjectConfigStep[] {
	const steps: ProjectConfigStep[] = [
		{ op: 'AddModule', id: form.providerModule, entry: providerEntry(form) },
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

function draftKey(connection: string, module: string): string {
	return `${DRAFT_PREFIX}${connection}:${module}`
}

export function storeMappingDraft(draft: MappingDraft, now = Date.now()): void {
	try {
		const value: StoredMapping = { draft, at: now }
		storage()?.setItem(draftKey(draft.connection, draft.module), JSON.stringify(value))
	} catch {
		// Storage refused: the draft lives in the workspace until it closes.
	}
}

export function forgetMappingDraft(connection: string, module: string): void {
	try {
		storage()?.removeItem(draftKey(connection, module))
	} catch {
		// Nothing kept, nothing to forget.
	}
}

/** The draft kept for a connection and module, unless there is none or it is too old. */
export function storedMappingDraft(
	connection: string,
	module: string,
	now = Date.now(),
): MappingDraft | undefined {
	let raw: string | null | undefined
	try {
		raw = storage()?.getItem(draftKey(connection, module))
	} catch {
		return undefined
	}
	if (!raw) {
		return undefined
	}
	try {
		const value = JSON.parse(raw) as StoredMapping
		if (!Array.isArray(value.draft?.resources) || now - value.at > KEEP_MAPPING_DRAFT_MS) {
			forgetMappingDraft(connection, module)
			return undefined
		}
		return value.draft
	} catch {
		forgetMappingDraft(connection, module)
		return undefined
	}
}

function mergedField(fresh: FieldDraft, kept: FieldDraft | undefined, accepts: string[]): FieldDraft {
	if (!kept) {
		return fresh
	}
	return {
		...kept,
		column: fresh.column,
		declared: accepts.includes(kept.declared) ? kept.declared : fresh.declared,
	}
}

function proposedFieldsOf(proposal: MappingProposal, relation: string): ProposedField[] {
	const resource =
		proposal.resources.find((entry) => entry.relation === relation) ??
		proposal.open.find((item) => item.resource?.relation === relation)?.resource
	return resource?.fields ?? []
}

function mergedResource(
	proposal: MappingProposal,
	fresh: ResourceDraft,
	kept: ResourceDraft | undefined,
): ResourceDraft {
	if (!kept) {
		return fresh
	}
	const accepts = new Map(
		proposedFieldsOf(proposal, fresh.relation).map((field) => [field.column, field.accepts]),
	)
	const columns = new Set(fresh.fields.map((field) => field.column))
	return {
		...fresh,
		include: kept.include,
		tableView: kept.tableView,
		writable: kept.writable,
		title: kept.title,
		label: kept.label && columns.has(kept.label) ? kept.label : fresh.label,
		fields: fresh.fields.map((field) =>
			mergedField(
				field,
				kept.fields.find((candidate) => candidate.column === field.column),
				accepts.get(field.column) ?? [],
			),
		),
	}
}

/**
 * A kept draft laid over a fresh proposal, field by field: the integrator's
 * choices where the relation and column still exist and the type is still
 * accepted, the proposal's for everything else, new columns included. Answers
 * and exclusions are kept only for what the proposal still asks or lists, a
 * purpose item's own questions included; a field-type answer still declares its
 * column.
 */
export function mergedDraft(proposal: MappingProposal, kept: MappingDraft | undefined): MappingDraft {
	const fresh = draftFromProposal(proposal)
	if (!kept) {
		return fresh
	}
	const relations = new Set(fresh.resources.map((resource) => resource.relation))
	const items = proposal.open.flatMap((item) => [item, ...(item.open ?? [])])
	const asked = new Set(items.map((item) => item.id))
	const merged: MappingDraft = {
		...fresh,
		resources: fresh.resources.map((resource) =>
			mergedResource(proposal, resource, resourceIn(kept, resource.relation)),
		),
		answers: Object.fromEntries(Object.entries(kept.answers).filter(([id]) => asked.has(id))),
		excluded: Object.fromEntries(
			Object.entries(kept.excluded).filter(([relation]) => relations.has(relation)),
		),
	}
	for (const item of items.filter((entry) => entry.kind === 'field-type' && entry.id in merged.answers)) {
		replayFieldType(merged, kept, item)
	}
	return merged
}

/** A kept field-type answer laid over the merged draft, with the integrator's choices for that field. */
function replayFieldType(merged: MappingDraft, kept: MappingDraft, item: OpenItem): void {
	const resource = resourceIn(merged, item.relation)
	if (!resource) {
		return
	}
	answerFieldType(resource, item, merged.answers[item.id])
	const keptField = resourceIn(kept, item.relation)?.fields.find((field) => field.column === item.column)
	const index = resource.fields.findIndex((field) => field.column === item.column)
	if (keptField && index >= 0) {
		resource.fields[index] = { ...keptField, declared: resource.fields[index].declared }
	}
}

/** A relation the module maps, as a draft to change: its current choices, its declared columns in. */
export function draftFromMapped(entry: MappedRelation): ResourceDraft {
	const draft = resourceDraft(entry.resource, true)
	for (const field of draft.fields) {
		field.include = entry.included.includes(field.column)
	}
	return draft
}

/** The `MapResources` that maps one relation again from its changed draft. */
export function remapInput(
	connection: string,
	module: string,
	resource: ResourceDraft,
	mappedTableViews: ReadonlySet<string>,
): MapResourcesInput {
	const draft: MappingDraft = { connection, module, resources: [resource], answers: {}, excluded: {} }
	return {
		module,
		connection,
		resources: [mappedResource(draft, resource, mappedTableViews)],
	}
}

/** The relations the module maps as TableViews, which relation columns may point at. */
export function mappedTableViewsOf(mapped: MappedRelation[]): Set<string> {
	return new Set(
		mapped
			.filter((entry) => entry.resource.tableView.value)
			.map((entry) => entry.resource.relation),
	)
}

/** What each rule decides, as the workspace says it beside a choice. */
export const RULE_SENTENCES: Record<string, string> = {
	R1: 'The catalog says this relation cannot be mapped.',
	R2: 'No key: it can feed stats pages, not a TableView.',
	R3: 'It has no rows.',
	R4: "A framework's or a migration tool's table.",
	R5: 'Keyed by its two references: a link table, for stats only.',
	R6: 'Keyed, with rows and a column that names a row: a TableView.',
	R7: 'Referenced by others but nothing names a row: a TableView labelled by its key.',
	R8: 'Keyed, with a time axis and nothing that names a row: events or a log, for stats only.',
	R9: 'No rule decides what it holds.',
	L1: 'The label candidate preferred by its name, then the first by order.',
	L2: "From the catalog's comment when it is short, otherwise from the name.",
	F1: 'No field type reads this column.',
	F2: 'Named like a secret.',
	F3: 'The first declaration the column accepts.',
	F4: 'A reference the database declares, onto a TableView.',
	F5: "Every value is found in the target's key, though the database declares no reference.",
	FL: 'From what the profile says the column is.',
	W1: 'Read-only until you choose otherwise.',
	mapped: 'What the module maps now.',
}

export function ruleSentence(rule: string): string {
	return RULE_SENTENCES[rule] ?? rule
}

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
	OpenItem,
	ProposedField,
	ProposedResource,
} from './database-types'

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

/** What an open item holds in the draft for now, as Apply would write it. */
export function currentAnswer(draft: MappingDraft, item: OpenItem): string {
	const resource = resourceIn(draft, item.relation)
	if (item.kind === 'label') {
		return resource?.label ? `labelled by ${resource.label}` : 'no label'
	}
	if (item.kind === 'reference') {
		const field = resource?.fields.find((candidate) => candidate.column === item.column)
		return field?.relation ? `a reference to ${field.relation}` : 'a plain column'
	}
	if (item.kind === 'purpose') {
		return 'left out'
	}
	return 'not analysed'
}

/** The relation columns of the draft and the module that point at a relation, as `relation.column`. */
export function pointingAt(
	draft: MappingDraft | null,
	mapped: MappedRelation[],
	relation: string,
): string[] {
	const fromDraft = (draft?.resources ?? [])
		.filter((resource) => resource.include)
		.flatMap((resource) =>
			resource.fields
				.filter((field) => field.include && field.relation === relation)
				.map((field) => `${resource.relation}.${field.column}`),
		)
	const drafted = new Set((draft?.resources ?? []).map((resource) => resource.relation))
	const fromMapped = mapped
		.filter((entry) => !drafted.has(entry.resource.relation))
		.flatMap((entry) =>
			entry.resource.fields
				.filter(
					(field) => field.relation?.value === relation && entry.included.includes(field.column),
				)
				.map((field) => `${entry.resource.relation}.${field.column}`),
		)
	return [...fromDraft, ...fromMapped]
}

/** The open items the draft has not answered yet. */
export function unanswered(proposal: MappingProposal, draft: MappingDraft): OpenItem[] {
	return proposal.open.filter((item) => !(item.id in draft.answers))
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
 * and exclusions are kept only for what the proposal still asks or lists.
 */
export function mergedDraft(proposal: MappingProposal, kept: MappingDraft | undefined): MappingDraft {
	const fresh = draftFromProposal(proposal)
	if (!kept) {
		return fresh
	}
	const relations = new Set(fresh.resources.map((resource) => resource.relation))
	const asked = new Set(proposal.open.map((item) => item.id))
	return {
		...fresh,
		resources: fresh.resources.map((resource) =>
			mergedResource(proposal, resource, resourceIn(kept, resource.relation)),
		),
		answers: Object.fromEntries(Object.entries(kept.answers).filter(([id]) => asked.has(id))),
		excluded: Object.fromEntries(
			Object.entries(kept.excluded).filter(([relation]) => relations.has(relation)),
		),
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
	R1: 'The database reports this table cannot be read.',
	R2: 'No key: it can feed stats, not a page.',
	R3: 'It has no rows.',
	R4: "A framework's or a migration tool's table.",
	R5: 'It only links two other tables: for stats only.',
	R6: 'It has a key, rows and a column that names a row: a page.',
	R7: 'Other tables point at it but no column names a row: a page, its rows named by their key.',
	R8: 'Dated rows and nothing that names a row: events or a log, for stats only.',
	R9: 'Nothing in the data says what it holds.',
	L1: 'The column whose name best fits a row name, then the first such column.',
	L2: "From the database's comment when it is short, otherwise from the name.",
	F1: 'No column type can read it.',
	F2: 'Named like a secret.',
	F3: 'The first type the column can be read as.',
	F4: 'The database declares it points at a table with a page.',
	F5: 'Every value matches a row of the other table, though the database does not declare it.',
	FL: 'From what the data looks like.',
	W1: 'Read-only until you choose otherwise.',
	mapped: 'As it is saved now.',
}

export function ruleSentence(rule: string): string {
	return RULE_SENTENCES[rule] ?? rule
}

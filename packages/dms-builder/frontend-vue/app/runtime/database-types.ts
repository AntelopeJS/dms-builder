// A local mirror of the database shapes of `@antelopejs/interface-dms-builder`
// and `@antelopejs/interface-database-catalog`, as the module's HTTP API
// answers them.

export type ProposedKind = 'fact' | 'default'

export interface Proposed<T> {
	value: T
	rule: string
	kind: ProposedKind
}

export interface ProposedColumnProfile {
	traits: string[]
	nulls?: number
	distinct?: number
	range?: { min: number | string; max: number | string }
	categories?: { value: string | number | boolean; rows: number }[]
}

export interface ProposedField {
	column: string
	native: string
	accepts: string[]
	declared: Proposed<string> & { lossy?: string }
	label: Proposed<string>
	listable: Proposed<boolean>
	filterable: Proposed<boolean>
	sortable: Proposed<boolean>
	searchable: Proposed<boolean>
	relation?: Proposed<string> & { implied: boolean }
	profile?: ProposedColumnProfile
}

export interface ProposedLeftOut {
	column: string
	reason: string
	rule: string
}

export interface ProposedWrites {
	insert: boolean
	update: boolean
	delete: boolean
}

export interface ProposedResource {
	relation: string
	tableView: Proposed<boolean>
	writable: Proposed<boolean>
	label: Proposed<string | null>
	title: Proposed<string>
	fields: ProposedField[]
	leftOut: ProposedLeftOut[]
	writes: ProposedWrites
}

export interface ProposedExclusion {
	relation: string
	reason: string
	rule: string
}

export type OpenItemKind = 'schemas' | 'purpose' | 'label' | 'reference'

export interface OpenItemOption {
	value: unknown
	title: string
}

export interface OpenItem {
	id: string
	kind: OpenItemKind
	relation?: string
	column?: string
	question: string
	options: OpenItemOption[]
	proposed: unknown
	resource?: ProposedResource
}

export interface MappingProposal {
	connection: string
	module: string
	database: { engine: string; role: string; writes: 'none' | 'some' | 'all' }
	resources: ProposedResource[]
	excluded: ProposedExclusion[]
	open: OpenItem[]
}

export interface AnalysisProgress {
	relations: number
	described: number
	toProfile: number
	profiled: number
	timeouts: number
}

export interface AnalysisState {
	id: string
	connection: string
	status: 'running' | 'done' | 'failed'
	progress: AnalysisProgress
	proposal?: MappingProposal
	error?: string
}

/** A relation the module maps, read back as its current choices. */
export interface MappedRelation {
	ref: string
	resource: ProposedResource
	/** The columns the module declares; the rest are the catalog's others. */
	included: string[]
}

export interface MappedField {
	column: string
	declared?: string
	label?: string
	listable?: boolean
	filterable?: boolean
	sortable?: boolean
	searchable?: boolean
	relation?: string
}

export interface MappedResource {
	relation: string
	label?: string
	title?: string
	tableView: boolean
	writable: boolean
	fields: MappedField[]
}

export interface MapResourcesInput {
	module: string
	connection: string
	resources: MappedResource[]
	excluded?: { relation: string; reason: string }[]
}

export interface MapResourcesResult {
	resources: { relation: string; ref: string; page?: string; files: string[] }[]
	leftOut: { relation: string; column: string; reason: string }[]
	category?: string
}

/** One of the builder's catalog connections, or why its provider did not answer. */
export interface DatabaseConnection {
	id: string
	engine?: string
	version?: string
	database?: string
	role?: string
	error?: string
}

export interface SampledText {
	text: string
	truncated: boolean
}

export interface SampledBinary {
	bytes: number
}

export type SampledValue = SampledText | SampledBinary | null

export interface RowSample {
	relation: string
	columns: string[]
	rows: SampledValue[][]
	sample: { percent: number; rows: number } | null
}

export interface ModuleEntryInput {
	source?: Record<string, unknown>
	config?: Record<string, unknown>
	env?: Record<string, string>
	importOverrides?: { interface: string; source: string; id?: string }[]
	exportPriority?: Record<string, number>
}

export type ProjectConfigStep =
	| { op: 'AddModule'; id: string; entry: ModuleEntryInput }
	| { op: 'ConfigureModule'; id: string; entry: ModuleEntryInput }
	| { op: 'CreateLocalModule'; id: string; path: string; entry?: ModuleEntryInput }

export interface ProjectConfigResult {
	files: string[]
}

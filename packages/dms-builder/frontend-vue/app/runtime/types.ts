// A local mirror of the `@antelopejs/interface-dms-builder` interface shapes. The
// layer talks to the module over HTTP, so it carries its own view of the wire
// format rather than a build-time dependency on the module's types.

export interface OptionUi {
	label?: string
	widget?: string
	group?: string
	order?: number
	hidden?: boolean
	placeholder?: string
	min?: number
	max?: number
	step?: number
	scope?: string
	blockTypes?: string[]
	/** The options of the held block that the block holding it supplies. */
	supplies?: string[]
	flatten?: boolean
	// One option may need several: a Kanban groups by a field it both reads
	// off the listed row and filters each column with.
	fieldAspect?: FieldAspect | FieldAspect[]
	/**
	 * What the block does with what it fetches, for a `dataSource` option: one
	 * number, one point per group, a ranked list, or a number and its series.
	 */
	responseShape?: string
	/** The block's own period option, written alongside a bound source. */
	periodOption?: string
	/** What to call each value of an enum, keyed by the value. */
	valueLabels?: Record<string, string>
	/** The sibling option this one's value is derived from: a key from a label. */
	derivedFrom?: string
	/** The switch this option sits behind, by its label. */
	optIn?: string
	/** The sibling option holding the data type this value is one of. */
	typedBy?: string
	/** Offered in the advanced view only: an address, a method, a key. */
	advanced?: boolean
	/** What a new block is placed with, when not the option's default. */
	initial?: unknown
}

export type FieldAspect = 'listable' | 'searchable' | 'sortable' | 'filterable'

/** A yes or no a table's field carries, each set on its own. */
export type FieldFlag = FieldAspect | 'selectable' | 'required' | 'exported'

export interface OptionSchema {
	type: string
	optional?: boolean
	nullable?: boolean
	description?: string
	default?: unknown
	enum?: Array<string | number | boolean>
	properties?: Record<string, OptionSchema>
	items?: OptionSchema
	values?: OptionSchema
	/** A record's key shape; a closed set of keys carries it as `enum`. */
	keys?: OptionSchema
	oneOf?: OptionSchema[]
	discriminator?: string
	prefixItems?: OptionSchema[]
	allOf?: OptionSchema[]
	truncated?: boolean
	ui?: OptionUi
	'x-dataType'?: boolean
	'x-component'?: boolean
	'x-controller'?: boolean
}

export interface SlotDescriptor {
	id: string
	label?: string
	description?: string
}

export interface DynamicSlots {
	optionPath: string
	idKey: string
	labelKey?: string
}

export interface BlockTypeDescriptor {
	type: string
	componentName?: string
	label?: string
	icon?: string
	group?: string
	container: boolean
	allowedChildren?: string[]
	slots?: SlotDescriptor[]
	dynamicSlots?: DynamicSlots
	config: Record<string, OptionSchema>
	defaults?: Record<string, unknown>
	fixedOptions?: Record<string, unknown>
	childMeta?: Record<string, OptionSchema>
	shapeSource: string
	description?: string
	controllerArg?: boolean
}

export interface DataTypeDescriptor {
	id: string
	config: Record<string, OptionSchema>
	description?: string
}

export interface BlockCatalog {
	blocks: BlockTypeDescriptor[]
	dataTypes: DataTypeDescriptor[]
	reservedFieldNames: string[]
	generatedAt: string
}

export interface BlockNode {
	path: string
	name: string
	type: string | null
	editable: boolean
	opaqueReason?: string
	slot?: string
	meta?: Record<string, unknown>
	config?: Record<string, unknown>
	controller?: string
	children?: BlockNode[]
}

export interface PageMeta {
	ref: string
	id: string
	displayName: string
	icon?: string
	category: string
	order?: number
	description?: string
	hidden?: boolean
	permission?: Record<string, unknown>
	filepath: string
}

export interface PageStructure {
	page: PageMeta
	blocks: BlockNode[]
	queries: QueryStructure[]
	version: string
}

export interface BlockDraft {
	name: string
	type?: string
	config?: Record<string, unknown>
	slot?: string
	meta?: Record<string, unknown>
	controller?: string
	children?: BlockDraft[]
	preserve?: boolean
	/**
	 * Why the engine reported the block as one it cannot rewrite, carried over
	 * from the structure so the canvas can say so where the block is. Read only:
	 * the module writes a preserved block back from its own source and ignores
	 * this.
	 */
	opaqueReason?: string
}

export interface PageDraft {
	page?: Record<string, unknown>
	blocks: BlockDraft[]
	/**
	 * The queries the page should serve, saved with the blocks in one write.
	 *
	 * Omitted while the editor has not touched them, which leaves whatever the
	 * page already serves alone.
	 */
	queries?: AddQueryInput[]
}

/** How a query's answer is arranged for the block that reads it. */
export type QueryResponseShape = 'series' | 'card' | 'value' | 'items'

/** One measured group, as a route answers it and a chart reads it. */
export interface QueryPoint {
	x: number | string
	y: number
}

/**
 * What a preview of an unsaved query answers: the body its route would serve,
 * arranged the same way, and how it was arranged.
 *
 * The arranged shapes belong to the DMS — `ChartCardData` and friends — so the
 * body travels as the JSON the route serves it as.
 */
export interface QueryPreview {
	output: string
	response?: QueryResponseShape
	body: Record<string, unknown>
	truncated: boolean
}

export interface ComponentPreviewChild {
	id: string
	slot?: string
	component: ComponentPreview
	[key: string]: unknown
}

export interface ComponentPreview {
	componentName: string
	options?: Record<string, unknown>
	children?: ComponentPreviewChild[]
}

/** What `GET /dms/pagelayout` answers with. */
export interface PageLayoutPayload {
	layout?: ComponentPreview
	components: Record<string, ComponentPreview>
}

export interface PageLayoutPreview {
	components: Record<string, ComponentPreview>
	degraded: string[]
}

/**
 * What the module last answered about the draft as it now stands: `pending`
 * while an edit is waiting on the debounced preview, `refused` once the module
 * has declined to build it.
 */
export type PreviewState = 'pending' | 'valid' | 'refused'

export interface ValidationIssue {
	pointer: string
	message: string
}

export interface TypecheckError {
	file: string
	line: number
	message: string
}

export type BuilderError =
	| { code: 'not_found'; ref: string }
	| { code: 'duplicate_name'; name: string; scope: string }
	| { code: 'invalid_config'; issues: ValidationIssue[] }
	| { code: 'opaque_target'; path: string }
	| { code: 'unsupported'; detail: string }
	| { code: 'referential_integrity'; blockedBy: string[] }
	| { code: 'stale'; ref: string; currentVersion: string }
	| { code: 'typecheck_failed'; diagnostics: TypecheckError[] }

export interface FileChange {
	path: string
	kind: string
	diff: string
}

/**
 * Something an operation that went through still wants said: a column stored
 * as a string, a query kept because a block reads it, a route that moved.
 */
export interface OpWarning {
	code: string
	message: string
}

export type OpResult<T> =
	| { ok: true; data: T; changes: FileChange[]; warnings?: OpWarning[] }
	| { ok: false; error: BuilderError }

export interface PageSummary {
	ref: string
	id: string
	displayName: string
	category: string
	filepath: string
	icon?: string
	order?: number
	hidden?: boolean
}

export interface CategorySummary {
	ref: string
	displayName: string
	parent?: string
}

export interface CreatePageInput {
	name: string
	displayName: string
	category: string
	icon?: string
	order?: number
	description?: string
}

export interface EditableCategoryMeta {
	displayName?: string
	icon?: string
	order?: number
}

export interface CreateCategoryInput {
	name: string
	displayName: string
	parent?: string
	icon?: string
	order?: number
}

export interface ResourceSummary {
	ref: string
	className: string
	tableName: string
	route: string
	fieldCount: number
}

export interface FieldAspects {
	dataType: { $dataType: string; config?: Record<string, unknown> }
	label?: string
	listable?: boolean
	/** Offered to relation pickers by the select route (`@Select`). */
	selectable?: boolean
	searchable?: boolean
	sortable?: boolean
	filterable?: boolean
	access?: 'read' | 'readwrite'
	required?: boolean
	indexed?: boolean
	order?: number
	exported?: boolean
	archiveField?: boolean
	mandatory?: string[]
}

export interface ResourceFieldStructure extends Partial<FieldAspects> {
	name: string
	opaque?: boolean
	opaqueReason?: string
}

export interface FieldSpec extends FieldAspects {
	name: string
}

export interface ResourceStructure {
	ref: string
	className: string
	tableName: string
	route: string
	fields: ResourceFieldStructure[]
	routes?: string[]
	version: string
}

export interface QueryTemplateDescriptor {
	id: string
	resourceType: string
	title: string
	description?: string
	output: string
	params: Record<string, OptionSchema>
}

export interface QueryStructure {
	name: string
	endpoint: string
	resource?: string
	template?: string
	params?: Record<string, unknown>
	/** How the route arranges its answer, read off what it returns. */
	response?: QueryResponseShape
	/** Whether the route answers the preceding period too. */
	compare?: boolean
	opaque?: boolean
	opaqueReason?: string
}

export interface AddQueryInput {
	name: string
	resource: string
	template: string
	params?: Record<string, unknown>
	/**
	 * How the route arranges its answer. Left out, a grouped calculation answers
	 * its bare points, which only a chart can read.
	 */
	response?: QueryResponseShape
	/**
	 * Answer the preceding period beside the current one, so a card can show
	 * how far it moved. Only a query bound to the page's period can.
	 */
	compare?: boolean
	endpoint?: string
}

export interface CreateResourceInput {
	name: string
	displayName?: string
	fields: FieldSpec[]
}

/** A route a developer declared as something a block may be pointed at. */
export interface DataSourceDescriptor {
	id: string
	title: string
	description?: string
	responseShape: string
	path: string
	method?: string
	params?: Record<string, OptionSchema>
	period?: { from: string; to: string }
}

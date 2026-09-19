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
}

export type FieldAspect = 'listable' | 'searchable' | 'sortable' | 'filterable'

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
	oneOf?: OptionSchema[]
	discriminator?: string
	prefixItems?: OptionSchema[]
	allOf?: OptionSchema[]
	truncated?: boolean
	ui?: OptionUi
	'x-dataType'?: boolean
	'x-component'?: boolean
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

/** What a preview of an unsaved query answers. */
export type QueryPreview =
	| { output: string; value: number; truncated?: false }
	| {
			output: string
			series: { x: number | string; y: number }[]
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

export type OpResult<T> =
	| { ok: true; data: T; changes: FileChange[]; warnings?: unknown[] }
	| { ok: false; error: BuilderError }

export interface PageSummary {
	ref: string
	id: string
	displayName: string
	category: string
	filepath: string
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
	opaque?: boolean
	opaqueReason?: string
}

export interface AddQueryInput {
	name: string
	resource: string
	template: string
	params?: Record<string, unknown>
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

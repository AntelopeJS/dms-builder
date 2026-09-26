<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
	COMPARED_SHAPES,
	DATE_TYPES,
	describeSource,
	FILTER_WORDS,
	isBound,
	MEASURE_WORDS,
	sourceQuery,
} from '../runtime/data-source'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import type {
	AddQueryInput,
	QueryPoint,
	QueryPreview,
	QueryResponseShape,
} from '../runtime/types'

const props = defineProps<{
	/** The URL currently written on the block, if any. */
	modelValue: unknown
	/** What the block does with the answer, from its own declaration. */
	responseShape?: string
	/** The block's period option, written alongside when a period is bound. */
	periodOption?: string
	/** The block being configured, used to name the query it reads. */
	blockName: string
	/** How the preview draws the points: along a line, or as columns. */
	draw?: 'columns' | 'line'
}>()

const emit = defineEmits<{
	/** The URL to write on the block, plus any sibling option it implies. */
	patch: [Record<string, unknown>]
}>()

const builder = useBuilder()
const session = builder.session
// The route the source is served at is for whoever reads the code.
const { advanced } = useBuilderMode()

/** Measures a source can take, in the order someone reaches for them. */
const MEASURES = Object.entries(MEASURE_WORDS).map(([value, label]) => ({
	label,
	value,
}))

const BUCKETS = [
	{ label: 'by Day', value: 'day' },
	{ label: 'by Month', value: 'month' },
	{ label: 'by Quarter', value: 'quarter' },
	{ label: 'by Year', value: 'year' },
]

const FILTER_OPS = Object.entries(FILTER_WORDS).map(([value, label]) => ({
	label,
	value,
}))

/** A preview is narrow: its labels lie flat, the ones that would overlap left out. */
const PREVIEW_X_AXIS = { rotate: 0, hideOverlappingLabels: true }

/** The most groups a series keeps, as the engine bounds it. */
const MAX_LIMIT = 1000

/**
 * The scope a card bound to a period follows: the one a period selector drives
 * when nobody named another, so a page with one selector needs no wiring.
 */
const PAGE_PERIOD_SCOPE = 'page'

/**
 * What a source may be refined by beyond what it measures. Each is off until
 * ticked, and unticking one puts it back as the source is without it.
 */
type Refinement = 'sort' | 'top' | 'conditions' | 'period'

const REFINEMENTS: { kind: Refinement; label: string }[] = [
	{ kind: 'sort', label: 'Sort' },
	{ kind: 'top', label: 'Top groups' },
	{ kind: 'conditions', label: 'Conditions' },
	{ kind: 'period', label: 'Period' },
]

interface DraftFilter {
	field: string
	op: string
	value: string
}

/**
 * A filter as the engine takes it. The value is not a string: a period bound is
 * written as a parameter the route supplies, not as a literal.
 */
interface QueryFilter {
	field: string
	op: string
	value: unknown
}

/** The block option this editor writes the URL into. */
const PROP = 'fetchUrl'

const resource = ref<string | undefined>(undefined)
const measure = ref('count')
const measureField = ref<string | undefined>(undefined)
const groupBy = ref<string | undefined>(undefined)
const bucket = ref<string | undefined>('month')
const filters = ref<DraftFilter[]>([])
const orderBy = ref<'group' | 'measure'>('group')
const direction = ref<'asc' | 'desc'>('asc')
const limit = ref<number | undefined>(undefined)
const followPeriod = ref(false)
/** The date column a period bounds, when the groups are not dates themselves. */
const periodField = ref<string | undefined>(undefined)
const compare = ref(false)
const preview = ref<QueryPreview | null>(null)
const previewing = ref(false)
/** The refinements ticked and not set yet, which keep their row open. */
const opened = ref(new Set<Refinement>())
/** Whether someone chose to build here a source the page's code answered. */
const building = ref(false)

/** One number, or one point per group: what the block declared it reads. */
const wantsSeries = computed(() => props.responseShape !== 'value')

/** The arrangements the engine knows how to build a route for. */
const RESPONSE_SHAPES: QueryResponseShape[] = [
	'series',
	'card',
	'value',
	'items',
]

/**
 * The arrangement the query is created with, taken from the block's own
 * declaration: the block knows one envelope and reads nothing else, so asking the
 * engine for anything but that one leaves it fetching what it cannot display.
 *
 * Narrowed rather than forwarded as it arrives: the declaration crosses the wire
 * as a string, and an arrangement this engine has no helper for would be written
 * into the page and then quietly served as bare points.
 */
const responseShape = computed(() =>
	RESPONSE_SHAPES.find((shape) => shape === props.responseShape),
)

/** Whether the block's arrangement has somewhere to put the period before. */
const comparable = computed(
	() => !!responseShape.value && COMPARED_SHAPES.includes(responseShape.value),
)

/** A query named after the block that reads it, so the two stay recognizable. */
const queryName = computed(() => props.blockName)

/**
 * A block pointed at a route this editor did not write — one in the page's
 * code, or one it cannot read back — until someone chooses to build it here.
 */
const coded = computed(
	() =>
		!building.value &&
		typeof props.modelValue === 'string' &&
		props.modelValue !== '' &&
		!sourceQuery(session.value.draft, session.value.structure, queryName.value),
)

const fields = computed(
	() => session.value.resourceStructures[resource.value ?? '']?.fields ?? [],
)

function fieldsOfType(types: string[]) {
	return fields.value
		.filter((field) => types.includes(field.dataType?.$dataType ?? ''))
		.map((field) => ({ label: field.label || field.name, value: field.name }))
}

const numericFields = computed(() =>
	fieldsOfType(['number', 'price', 'percentage']),
)
const dateFields = computed(() => fieldsOfType(DATE_TYPES))
const groupableFields = computed(() => [
	...fieldsOfType(['string', 'select', 'number', 'price', 'percentage']),
	...dateFields.value,
])
const filterableFields = computed(() =>
	fields.value.map((field) => ({
		label: field.label || field.name,
		value: field.name,
	})),
)

/** Whether the chosen grouping is a date, which is what a period bucket needs. */
const groupsByDate = computed(() =>
	dateFields.value.some((field) => field.value === groupBy.value),
)

/** The column the page's period bounds: the dates grouped by, or the one picked. */
const boundField = computed(() =>
	groupsByDate.value
		? groupBy.value
		: (periodField.value ?? dateFields.value[0]?.value),
)

const groupLabel = computed(
	() =>
		groupableFields.value.find((field) => field.value === groupBy.value)?.label ??
		'Group',
)

/**
 * How the groups come, as one choice: along their own axis — dates oldest or
 * newest first, names from A or from Z — or by what was measured.
 */
const sortItems = computed(() => [
	...(groupsByDate.value
		? [
				{ label: 'Oldest first', value: 'group:asc' },
				{ label: 'Newest first', value: 'group:desc' },
			]
		: [
				{ label: `${groupLabel.value}, A to Z`, value: 'group:asc' },
				{ label: `${groupLabel.value}, Z to A`, value: 'group:desc' },
			]),
	{ label: 'Largest first', value: 'measure:desc' },
	{ label: 'Smallest first', value: 'measure:asc' },
])

function setSort(value: unknown): void {
	const [by, way] = String(value).split(':')
	orderBy.value = by === 'measure' ? 'measure' : 'group'
	direction.value = way === 'desc' ? 'desc' : 'asc'
}

/** A whole number of groups the engine accepts, or none: keep every group. */
function setLimit(value: string | number): void {
	const count = Math.round(Number(value))
	limit.value =
		value === '' || !Number.isFinite(count) || count < 1
			? undefined
			: Math.min(count, MAX_LIMIT)
}

const needsMeasureField = computed(() => measure.value !== 'count')

const ready = computed(() => {
	if (!resource.value) {
		return false
	}
	if (needsMeasureField.value && !measureField.value) {
		return false
	}
	return !wantsSeries.value || Boolean(groupBy.value)
})

/* ---- refining it -------------------------------------------------------- */

const refinements = computed(() =>
	REFINEMENTS.filter((entry) => {
		if (entry.kind === 'sort' || entry.kind === 'top') {
			return wantsSeries.value && !!groupBy.value
		}
		if (entry.kind === 'period') {
			return !!props.periodOption && dateFields.value.length > 0
		}
		return filterableFields.value.length > 0
	}),
)

/** Ticked while its row is open, or while what it sets differs from without it. */
function refined(kind: Refinement): boolean {
	if (opened.value.has(kind)) {
		return true
	}
	switch (kind) {
		case 'sort':
			return orderBy.value !== 'group' || direction.value !== 'asc'
		case 'top':
			return limit.value !== undefined
		case 'conditions':
			return filters.value.length > 0
		case 'period':
			return followPeriod.value
	}
}

function refine(kind: Refinement, on: boolean): void {
	const next = new Set(opened.value)
	if (on) {
		next.add(kind)
	} else {
		next.delete(kind)
	}
	opened.value = next
	if (kind === 'sort' && !on) {
		orderBy.value = 'group'
		direction.value = 'asc'
	}
	if (kind === 'top' && !on) {
		limit.value = undefined
	}
	if (kind === 'conditions') {
		if (on && !filters.value.length) {
			addFilter()
		}
		if (!on) {
			filters.value = []
		}
	}
	if (kind === 'period') {
		followPeriod.value = on
		if (!on) {
			compare.value = false
		}
	}
}

const shownRefinements = computed(() =>
	refinements.value.filter((entry) => refined(entry.kind)),
)

/* ---- the query ---------------------------------------------------------- */

/** The parameters the engine compiles, assembled from the choices above. */
function queryParams(): Record<string, unknown> {
	const where: QueryFilter[] = filters.value
		.filter((filter) => filter.field && filter.value !== '')
		.map((filter) => ({
			field: filter.field,
			op: filter.op,
			value: filter.value,
		}))
	if (followPeriod.value && boundField.value) {
		// A period is two bounds the route reads per request, which is what the
		// page's period selector already sends.
		where.push(
			{ field: boundField.value, op: 'ge', value: { $param: { name: 'from' } } },
			{ field: boundField.value, op: 'le', value: { $param: { name: 'to' } } },
		)
	}
	const params: Record<string, unknown> = {}
	if (where.length > 0) {
		params.where = where
	}
	if (needsMeasureField.value) {
		params.op = measure.value
		params.field = measureField.value
	}
	if (!wantsSeries.value) {
		return params
	}
	params.groupBy = groupBy.value
	if (groupsByDate.value && bucket.value) {
		params.bucket = bucket.value
		params.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
	}
	if (measure.value === 'count') {
		params.op = 'count'
	}
	// Written even when they are the defaults, the way the engine reads a series
	// back: sent again, the same parameters have to build the same chain.
	params.orderBy = orderBy.value
	params.direction = direction.value
	if (limit.value !== undefined) {
		params.limit = limit.value
	}
	return params
}

/** Whether the route answers the period before too: bound, and asked to. */
const compares = computed(
	() => comparable.value && followPeriod.value && compare.value,
)

function queryInput(): AddQueryInput {
	return {
		name: queryName.value,
		resource: resource.value as string,
		template: wantsSeries.value
			? 'series'
			: measure.value === 'count'
				? 'count'
				: 'aggregate',
		params: queryParams(),
		response: responseShape.value,
		...(compares.value ? { compare: true } : {}),
	}
}

/** What the source measures, in the words the block's panel folds it under. */
const summary = computed(() =>
	describeSource(
		{
			name: queryName.value,
			resource: resource.value,
			params: queryParams(),
			compare: compares.value,
		},
		fields.value,
	),
)

/** The URL the generated route will answer at, which is what the block reads. */
const endpoint = computed(
	() =>
		`${session.value.pageRef ?? ''}/stats/${queryName.value
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.toLowerCase()}`,
)

async function apply(): Promise<void> {
	if (!ready.value) {
		return
	}
	const input = queryInput()
	builder.setDraftQuery(input)
	const patch: Record<string, unknown> = { [PROP]: endpoint.value }
	if (props.periodOption) {
		// Binding a period means two options: the source, and the scope the block
		// follows. Writing one without the other leaves a chart asking for bounds
		// nobody sends.
		patch[props.periodOption] = followPeriod.value ? PAGE_PERIOD_SCOPE : undefined
	}
	emit('patch', patch)
	await readPreview()
}

async function readPreview(): Promise<void> {
	previewing.value = true
	try {
		preview.value = await builder.previewQuery(queryInput(), periodArgs())
	} finally {
		previewing.value = false
	}
}

/**
 * Stand-in bounds for the preview, since no period selector is running here:
 * the last twelve months, and the twelve before them for a comparison.
 */
function periodArgs(): Record<string, unknown> {
	if (!followPeriod.value) {
		return {}
	}
	const to = new Date()
	const from = new Date(to)
	from.setFullYear(from.getFullYear() - 1)
	const args: Record<string, unknown> = {
		from: from.toISOString(),
		to: to.toISOString(),
	}
	if (compares.value) {
		const before = new Date(from)
		before.setFullYear(before.getFullYear() - 1)
		args.compareFrom = before.toISOString()
		args.compareTo = from.toISOString()
	}
	return args
}

function addFilter(): void {
	filters.value = [
		...filters.value,
		{ field: filterableFields.value[0]?.value ?? '', op: 'eq', value: '' },
	]
}

function removeFilter(index: number): void {
	filters.value = filters.value.filter((_, at) => at !== index)
	if (!filters.value.length) {
		refine('conditions', false)
	}
}

function pickResource(value: string): void {
	resource.value = value
	measureField.value = undefined
	groupBy.value = undefined
	periodField.value = undefined
	filters.value = []
	void builder.loadResource(value)
}

/* ---- what it answers ---------------------------------------------------- */

/** A point as either arrangement writes one; a card's `y` may be unmeasured. */
function asPoint(entry: unknown): QueryPoint | undefined {
	const point = entry as { x?: unknown; y?: unknown }
	if (point === null || typeof point !== 'object' || !('x' in point)) {
		return undefined
	}
	return {
		x: point.x as number | string,
		y: typeof point.y === 'number' ? point.y : 0,
	}
}

/** The points of a series, whether handed bare or inside a named chart series. */
function pointsOf(series: unknown): QueryPoint[] {
	if (!Array.isArray(series)) {
		return []
	}
	const direct = series.map(asPoint).filter((point) => point !== undefined)
	if (direct.length === series.length) {
		return direct as QueryPoint[]
	}
	const data = (series[0] as { data?: unknown })?.data
	return Array.isArray(data)
		? (data.map(asPoint).filter((point) => point !== undefined) as QueryPoint[])
		: []
}

/** The headline figure the body carries, for the arrangements that have one. */
const previewValue = computed(() => {
	const value = preview.value?.body?.value
	return typeof value === 'number' ? value : undefined
})

const previewDelta = computed(() => {
	const delta = preview.value?.body?.delta
	return typeof delta === 'number' ? delta : undefined
})

/**
 * The points behind the body, wherever its arrangement put them: a plain route
 * answers them directly, a card hands them over inside a chart series.
 */
const previewPoints = computed(() => pointsOf(preview.value?.body?.series))
const previousPoints = computed(() =>
	pointsOf(preview.value?.body?.comparisonSeries),
)

/** What the preview draws: the points, and the period before dashed beside them. */
const previewSeries = computed(() => {
	const series: Array<{ name: string; data: QueryPoint[]; strokeDashArray?: number }> =
		[{ name: 'This period', data: previewPoints.value }]
	if (previousPoints.value.length) {
		series.push({
			name: 'Previous period',
			data: previousPoints.value,
			strokeDashArray: 4,
		})
	}
	return series
})

/* ---- reopened ----------------------------------------------------------- */

/**
 * Fill the editor from the source the block already reads, so reopening a page
 * shows what was configured rather than an empty form that would overwrite it.
 */
function hydrate(): void {
	const written = sourceQuery(
		session.value.draft,
		session.value.structure,
		queryName.value,
	)
	if (!written?.resource) {
		return
	}
	resource.value = written.resource
	void builder.loadResource(written.resource)
	const params = (written.params ?? {}) as Record<string, unknown>
	measure.value = (params.op as string) ?? 'count'
	measureField.value = params.field as string | undefined
	groupBy.value = params.groupBy as string | undefined
	bucket.value = (params.bucket as string | undefined) ?? bucket.value
	orderBy.value = params.orderBy === 'measure' ? 'measure' : 'group'
	direction.value = params.direction === 'desc' ? 'desc' : 'asc'
	limit.value = typeof params.limit === 'number' ? params.limit : undefined
	const where = Array.isArray(params.where)
		? (params.where as QueryFilter[])
		: []
	filters.value = where
		.filter((entry) => !isBound(entry.value))
		.map((entry) => ({
			field: entry.field,
			op: entry.op,
			value: String(entry.value),
		}))
	// A bound value is how a period is written, so finding one is how the editor
	// knows the source follows the page's period — and on which column.
	const bound = where.find((entry) => isBound(entry.value))
	followPeriod.value = bound !== undefined
	periodField.value = bound && bound.field !== groupBy.value ? bound.field : undefined
	compare.value = written.compare === true
}

hydrate()
// Read what the source already answers: reopened, the editor otherwise said "No
// rows match." over a table it had not asked anything yet. Only read — the
// source is what the block holds, and writing it back would be an edit.
if (ready.value && !coded.value) {
	void readPreview()
}

// Re-read whenever the choices settle, so the numbers on screen are the ones the
// saved page would show rather than the ones a previous choice produced.
watch(
	[
		resource,
		measure,
		measureField,
		groupBy,
		bucket,
		orderBy,
		direction,
		limit,
		followPeriod,
		periodField,
		compare,
		filters,
	],
	() => {
		void apply()
	},
	{ deep: true },
)

</script>

<template>
	<div class="flex flex-col gap-3">
		<div
			v-if="coded"
			class="flex flex-col gap-2.5 rounded-lg border border-accented bg-elevated p-2.5"
		>
			<div class="flex items-center gap-2.5">
				<span
					class="flex size-8 shrink-0 items-center justify-center rounded-md bg-accented text-muted"
				>
					<UIcon name="i-ph-code" class="size-4" />
				</span>
				<span class="flex min-w-0 flex-1 flex-col">
					<code class="truncate font-mono text-xs text-highlighted">
						GET {{ modelValue }}
					</code>
					<span class="text-xs text-muted">Answered by the page's code</span>
				</span>
			</div>
			<UButton
				icon="i-ph-table"
				size="xs"
				color="neutral"
				variant="outline"
				label="Build it here instead"
				class="self-start"
				@click="building = true"
			/>
			<p class="text-xs leading-relaxed text-dimmed">
				Its figures come as the code computes them. Built here instead, it
				reads a table you pick, and the route in the code is left as it is.
			</p>
		</div>

		<template v-else>
			<div
				v-if="resource"
				class="flex flex-col gap-2.5 rounded-lg border border-default bg-elevated/60 p-3"
			>
				<div class="flex items-start justify-between gap-2">
					<p class="text-sm text-default">{{ summary }}</p>
					<span class="shrink-0 text-xs text-dimmed">
						{{ previewing ? 'Reading…' : 'Preview' }}
					</span>
				</div>
				<div
					v-if="previewValue !== undefined"
					class="flex items-baseline gap-2"
				>
					<span class="text-2xl font-semibold tabular-nums text-highlighted">
						{{ previewValue.toLocaleString() }}
					</span>
					<DmsTrendBadge v-if="previewDelta !== undefined" :delta="previewDelta" />
				</div>

				<DmsChart
					v-if="previewPoints.length"
					:type="draw === 'line' ? 'line' : 'column'"
					:static-dataset="previewSeries"
					height="180px"
					:show-legend="false"
					:x-axis="PREVIEW_X_AXIS"
				/>
				<p
					v-else-if="previewValue === undefined && !previewing"
					class="text-xs text-dimmed"
				>
					{{ ready ? 'No rows match.' : 'Choose what to measure.' }}
				</p>
			</div>

			<div class="divide-y divide-default overflow-hidden rounded-lg border border-default">
				<div class="flex items-center gap-2 px-2.5 py-1.5">
					<span class="w-18 shrink-0 text-xs text-muted">From</span>
					<USelectMenu
						:model-value="resource"
						:items="
							session.resources.map((entry) => ({
								label: entry.ref,
								value: entry.ref,
								icon: 'i-ph-table',
							}))
						"
						value-key="value"
						placeholder="Which table?"
						aria-label="From"
						class="min-w-0 flex-1"
						@update:model-value="pickResource($event)"
					/>
				</div>
				<template v-if="resource">
					<div class="flex items-center gap-2 px-2.5 py-1.5">
						<span class="w-18 shrink-0 text-xs text-muted">Measure</span>
						<USelectMenu
							v-model="measure"
							:items="MEASURES"
							value-key="value"
							aria-label="Measure"
							class="min-w-0 flex-1"
						/>
						<USelectMenu
							v-if="needsMeasureField"
							:model-value="measureField"
							:items="numericFields"
							value-key="value"
							placeholder="of…"
							aria-label="Measured column"
							class="min-w-0 flex-1"
							@update:model-value="measureField = $event"
						/>
					</div>
					<div v-if="wantsSeries" class="flex items-center gap-2 px-2.5 py-1.5">
						<span class="w-18 shrink-0 text-xs text-muted">Split by</span>
						<USelectMenu
							:model-value="groupBy"
							:items="groupableFields"
							value-key="value"
							placeholder="Grouped by…"
							aria-label="Split by"
							class="min-w-0 flex-1"
							@update:model-value="groupBy = $event"
						/>
						<USelectMenu
							v-if="groupsByDate"
							v-model="bucket"
							:items="BUCKETS"
							value-key="value"
							aria-label="Period of each group"
							class="w-28 shrink-0"
						/>
					</div>
				</template>
			</div>

			<div v-if="resource && refinements.length" class="flex flex-col gap-1.5">
				<p class="text-xs text-muted">Refine it</p>
				<div role="group" aria-label="Refine it" class="flex flex-wrap gap-x-4 gap-y-1.5">
					<UCheckbox
						v-for="entry in refinements"
						:key="entry.kind"
						:model-value="refined(entry.kind)"
						:label="entry.label"
						size="sm"
						@update:model-value="refine(entry.kind, $event === true)"
					/>
				</div>
			</div>

			<div
				v-if="resource && shownRefinements.length"
				class="divide-y divide-default overflow-hidden rounded-lg border border-default"
			>
				<template v-for="entry in shownRefinements" :key="entry.kind">
					<div
						v-if="entry.kind === 'sort'"
						class="flex items-center gap-2 px-2.5 py-1.5"
					>
						<span class="w-18 shrink-0 text-xs text-muted">Sorted</span>
						<USelectMenu
							:model-value="`${orderBy}:${direction}`"
							:items="sortItems"
							value-key="value"
							aria-label="Sorted"
							class="min-w-0 flex-1"
							@update:model-value="setSort($event)"
						/>
					</div>

					<div
						v-else-if="entry.kind === 'top'"
						class="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted"
					>
						<span class="w-18 shrink-0">Keep</span>
						<span>the first</span>
						<UInput
							type="number"
							size="sm"
							class="w-20"
							:min="1"
							:max="MAX_LIMIT"
							placeholder="all"
							aria-label="How many groups to keep"
							:model-value="limit"
							@update:model-value="setLimit($event)"
						/>
						<span>{{ groupsByDate ? 'periods' : 'groups' }}</span>
					</div>

					<div
						v-else-if="entry.kind === 'conditions'"
						class="flex flex-col gap-1.5 px-2.5 py-1.5"
					>
						<div
							v-for="(filter, at) in filters"
							:key="at"
							class="flex items-center gap-1.5"
						>
							<span class="w-18 shrink-0 text-xs text-muted">
								{{ at ? 'and' : 'Where' }}
							</span>
							<USelectMenu
								v-model="filter.field"
								:items="filterableFields"
								value-key="value"
								aria-label="Condition column"
								class="min-w-0 flex-1"
							/>
							<USelectMenu
								v-model="filter.op"
								:items="FILTER_OPS"
								value-key="value"
								aria-label="Condition test"
								class="w-24 shrink-0"
							/>
							<UInput
								v-model="filter.value"
								size="sm"
								aria-label="Condition value"
								class="min-w-0 flex-1"
							/>
							<UButton
								icon="i-ph-x"
								size="xs"
								color="neutral"
								variant="ghost"
								aria-label="Remove this condition"
								@click="removeFilter(at)"
							/>
						</div>
						<UButton
							icon="i-ph-plus"
							size="xs"
							variant="link"
							label="Add a condition"
							class="self-start px-0"
							@click="addFilter"
						/>
					</div>

					<div
						v-else-if="entry.kind === 'period'"
						class="flex items-baseline gap-2 px-2.5 py-2"
					>
						<span class="w-18 shrink-0 text-xs text-muted">Period</span>
						<div class="flex min-w-0 flex-1 flex-col gap-2">
							<div class="flex items-center gap-2">
								<span class="text-sm text-default">The page's period</span>
								<template v-if="!groupsByDate">
									<span class="text-xs text-muted">on</span>
									<USelectMenu
										:model-value="boundField"
										:items="dateFields"
										value-key="value"
										aria-label="Column the period bounds"
										class="min-w-0 flex-1"
										@update:model-value="periodField = $event"
									/>
								</template>
							</div>
							<p class="text-xs leading-relaxed text-dimmed">
								Its figures change with the period chosen on the page.
							</p>
							<USwitch
								v-if="comparable"
								v-model="compare"
								label="Compare with the previous period"
								description="Drawn dashed beside it, and gives the variation."
							/>
						</div>
					</div>
				</template>
			</div>

			<p v-if="advanced" class="truncate font-mono text-xs text-dimmed">
				{{ endpoint }}
			</p>
		</template>
	</div>
</template>

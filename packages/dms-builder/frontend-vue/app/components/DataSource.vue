<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
}>()

const emit = defineEmits<{
	/** The URL to write on the block, plus any sibling option it implies. */
	patch: [Record<string, unknown>]
}>()

const builder = useBuilder()
const session = builder.session

/** Measures a source can take, in the order someone reaches for them. */
const MEASURES = [
	{ label: 'Count of rows', value: 'count' },
	{ label: 'Sum', value: 'sum' },
	{ label: 'Average', value: 'avg' },
	{ label: 'Minimum', value: 'min' },
	{ label: 'Maximum', value: 'max' },
]

const BUCKETS = [
	{ label: 'Day', value: 'day' },
	{ label: 'Month', value: 'month' },
	{ label: 'Quarter', value: 'quarter' },
	{ label: 'Year', value: 'year' },
]

/** How the groups are ranked: along their own axis, or by what was measured. */
const DIRECTIONS = [
	{ label: 'Ascending', value: 'asc' },
	{ label: 'Descending', value: 'desc' },
]

/** The most groups a series keeps, as the engine bounds it. */
const MAX_LIMIT = 1000

/**
 * The scope a card bound to a period follows: the one a period selector drives
 * when nobody named another, so a page with one selector needs no wiring.
 */
const PAGE_PERIOD_SCOPE = 'page'

const FILTER_OPS = [
	{ label: 'is', value: 'eq' },
	{ label: 'is not', value: 'ne' },
	{ label: 'is more than', value: 'gt' },
	{ label: 'is at least', value: 'ge' },
	{ label: 'is less than', value: 'lt' },
	{ label: 'is at most', value: 'le' },
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
const preview = ref<QueryPreview | null>(null)
const previewing = ref(false)

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

/** A query named after the block that reads it, so the two stay recognizable. */
const queryName = computed(() => props.blockName)

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
const dateFields = computed(() => fieldsOfType(['date']))
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

/** A timeline reads along its dates; a ranking reads by what was measured. */
const orderItems = computed(() => [
	{ label: groupsByDate.value ? 'Sorted by date' : 'Sorted by group', value: 'group' },
	{ label: 'Sorted by value', value: 'measure' },
])

/** A whole number of groups the engine accepts, or none: keep every group. */
function setLimit(value: string | number): void {
	const count = Math.round(Number(value))
	limit.value =
		value === '' || !Number.isFinite(count) || count < 1
			? undefined
			: Math.min(count, MAX_LIMIT)
}

/** Whether the chosen grouping is a date, which is what a period bucket needs. */
const groupsByDate = computed(() =>
	dateFields.value.some((field) => field.value === groupBy.value),
)

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

/** The parameters the engine compiles, assembled from the choices above. */
function queryParams(): Record<string, unknown> {
	const where: QueryFilter[] = filters.value
		.filter((filter) => filter.field && filter.value !== '')
		.map((filter) => ({
			field: filter.field,
			op: filter.op,
			value: filter.value,
		}))
	if (followPeriod.value && groupsByDate.value && groupBy.value) {
		// A period is two bounds the route reads per request, which is what the
		// page's period selector already sends.
		where.push(
			{ field: groupBy.value, op: 'ge', value: { $param: { name: 'from' } } },
			{ field: groupBy.value, op: 'le', value: { $param: { name: 'to' } } },
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
	}
}

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
	previewing.value = true
	try {
		preview.value = await builder.previewQuery(input, periodArgs())
	} finally {
		previewing.value = false
	}
}

/** Stand-in bounds for the preview, since no period selector is running here. */
function periodArgs(): Record<string, unknown> {
	if (!followPeriod.value) {
		return {}
	}
	const to = new Date()
	const from = new Date(to)
	from.setFullYear(from.getFullYear() - 1)
	return { from: from.toISOString(), to: to.toISOString() }
}


function addFilter(): void {
	filters.value = [
		...filters.value,
		{ field: filterableFields.value[0]?.value ?? '', op: 'eq', value: '' },
	]
}

function removeFilter(index: number): void {
	filters.value = filters.value.filter((_, at) => at !== index)
}

function pickResource(value: string): void {
	resource.value = value
	measureField.value = undefined
	groupBy.value = undefined
	filters.value = []
	void builder.loadResource(value)
}

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

/** The headline figure the body carries, for the arrangements that have one. */
const previewValue = computed(() => {
	const value = preview.value?.body.value
	return typeof value === 'number' ? value : undefined
})

/**
 * The points behind the body, wherever its arrangement put them: a plain route
 * answers them directly, a card hands them over inside a chart series.
 */
const previewPoints = computed<QueryPoint[]>(() => {
	const series = preview.value?.body.series
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
})

/**
 * Fill the editor from the source the block already reads, so reopening a page
 * shows what was configured rather than an empty form that would overwrite it.
 *
 * Read from the draft first, then from what the page serves: the draft is where
 * an unsaved edit lives.
 */
function hydrate(): void {
	const written =
		session.value.draft?.queries?.find((query) => query.name === queryName.value) ??
		session.value.structure?.queries?.find(
			(query) => query.name === queryName.value && !query.opaque,
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
	const where = Array.isArray(params.where) ? params.where : []
	filters.value = where
		.filter(
			(entry) =>
				typeof (entry as { value?: unknown }).value !== 'object' ||
				(entry as { value?: unknown }).value === null,
		)
		.map((entry) => {
			const filter = entry as { field: string; op: string; value: unknown }
			return { field: filter.field, op: filter.op, value: String(filter.value) }
		})
	// A bound value is how a period is written, so finding one is how the editor
	// knows the source follows the page's period.
	followPeriod.value = where.some(
		(entry) =>
			typeof (entry as { value?: unknown }).value === 'object' &&
			(entry as { value?: { $param?: unknown } }).value?.$param !== undefined,
	)
}

hydrate()

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
		<USelectMenu
			:model-value="resource"
			:items="
				session.resources.map((entry) => ({
					label: entry.ref,
					value: entry.ref,
				}))
			"
			value-key="value"
			placeholder="Which data?"
			@update:model-value="pickResource($event)"
		/>

		<template v-if="resource">
			<div class="flex items-center gap-2">
				<USelectMenu
					v-model="measure"
					:items="MEASURES"
					value-key="value"
					class="flex-1"
				/>
				<USelectMenu
					v-if="needsMeasureField"
					:model-value="measureField"
					:items="numericFields"
					value-key="value"
					placeholder="of…"
					class="flex-1"
					@update:model-value="measureField = $event"
				/>
			</div>

			<div v-if="wantsSeries" class="flex items-center gap-2">
				<USelectMenu
					:model-value="groupBy"
					:items="groupableFields"
					value-key="value"
					placeholder="Grouped by…"
					class="flex-1"
					@update:model-value="groupBy = $event"
				/>
				<USelectMenu
					v-if="groupsByDate"
					v-model="bucket"
					:items="BUCKETS"
					value-key="value"
					class="w-32"
				/>
			</div>

			<!-- What makes a top N: the groups ranked by what was measured, and only
			the first few of them kept. -->
			<template v-if="wantsSeries && groupBy">
				<div class="flex items-center gap-2">
					<USelectMenu
						v-model="orderBy"
						:items="orderItems"
						value-key="value"
						class="flex-1"
					/>
					<USelectMenu
						v-model="direction"
						:items="DIRECTIONS"
						value-key="value"
						class="w-32"
					/>
				</div>
				<div class="flex items-center gap-2 text-xs text-dimmed">
					<span>Keep the first</span>
					<UInput
						type="number"
						size="sm"
						class="w-20"
						:min="1"
						:max="MAX_LIMIT"
						placeholder="all"
						:model-value="limit"
						@update:model-value="setLimit($event)"
					/>
					<span>{{ groupsByDate ? 'periods' : 'groups' }}</span>
				</div>
			</template>

			<div class="flex flex-col gap-2">
				<div
					v-for="(filter, index) in filters"
					:key="index"
					class="flex items-center gap-1.5"
				>
					<USelectMenu
						v-model="filter.field"
						:items="filterableFields"
						value-key="value"
						class="flex-1"
					/>
					<USelectMenu
						v-model="filter.op"
						:items="FILTER_OPS"
						value-key="value"
						class="w-32"
					/>
					<UInput v-model="filter.value" size="sm" class="flex-1" />
					<UButton
						icon="i-ph-x"
						size="xs"
						color="neutral"
						variant="ghost"
						aria-label="Remove this filter"
						@click="removeFilter(index)"
					/>
				</div>
				<UButton
					icon="i-ph-funnel"
					size="xs"
					color="neutral"
					variant="link"
					class="self-start"
					label="Add a filter"
					@click="addFilter"
				/>
			</div>

			<USwitch
				v-if="groupsByDate && periodOption"
				v-model="followPeriod"
				label="Follow the page's period"
			/>

			<div class="rounded-md border border-default p-2.5">
				<p class="text-xs font-semibold text-highlighted">Preview</p>
				<p v-if="previewing" class="text-xs text-dimmed">Reading…</p>
				<template v-else>
					<!-- A card answers a figure and its points; laid out the way the
					     block lays them out, so this reads as what the page will show. -->
					<p
						v-if="previewValue !== undefined"
						class="font-mono text-sm tabular-nums"
					>
						{{ previewValue }}
					</p>
					<div v-if="previewPoints.length" class="flex flex-col gap-0.5">
						<p
							v-for="point in previewPoints.slice(0, 5)"
							:key="String(point.x)"
							class="flex justify-between font-mono text-xs tabular-nums"
						>
							<span class="text-dimmed">{{ point.x }}</span>
							<span>{{ point.y }}</span>
						</p>
						<p v-if="previewPoints.length > 5" class="text-xs text-dimmed">
							and {{ previewPoints.length - 5 }} more
						</p>
					</div>
					<p
						v-else-if="previewValue === undefined"
						class="text-xs text-dimmed"
					>
						{{ ready ? 'No rows match.' : 'Choose what to measure.' }}
					</p>
				</template>
			</div>

			<p class="truncate font-mono text-xs text-dimmed">{{ endpoint }}</p>
		</template>
	</div>
</template>

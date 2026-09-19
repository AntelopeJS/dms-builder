<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBuilder } from '../runtime/session'
import type { AddQueryInput, QueryPreview } from '../runtime/types'

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
const followPeriod = ref(false)
const preview = ref<QueryPreview | null>(null)
const previewing = ref(false)

/** One number, or one point per group: what the block declared it reads. */
const wantsSeries = computed(() => props.responseShape !== 'value')

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
		patch[props.periodOption] = followPeriod.value ? 'page' : undefined
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

const previewPoints = computed(() =>
	preview.value && 'series' in preview.value ? preview.value.series : [],
)

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
	[resource, measure, measureField, groupBy, bucket, followPeriod, filters],
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
				<p
					v-else-if="preview && 'value' in preview"
					class="font-mono text-sm tabular-nums"
				>
					{{ preview.value }}
				</p>
				<div v-else-if="previewPoints.length" class="flex flex-col gap-0.5">
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
				<p v-else class="text-xs text-dimmed">
					{{ ready ? 'No rows match.' : 'Choose what to measure.' }}
				</p>
			</div>

			<p class="truncate font-mono text-xs text-dimmed">{{ endpoint }}</p>
		</template>
	</div>
</template>

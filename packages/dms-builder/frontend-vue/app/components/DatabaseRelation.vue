<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import type { FieldDraft, ResourceDraft } from '../runtime/database'
import type {
	ProposedColumnProfile,
	ProposedResource,
	RowSample,
	SampledValue,
} from '../runtime/database-types'

/**
 * One relation of the mapping, as the integrator settles it: TableView or
 * stats only, editable or not, its label, and each column with its type, title
 * and flags beside what the profile measured. *Sample rows* shows a few of its
 * rows here, held in this panel only and dropped when it closes.
 */

const props = defineProps<{
	connection: string
	proposed?: ProposedResource
}>()
/** The relation's draft, edited in place: the proposal panel keeps it and stores it. */
const resource = defineModel<ResourceDraft>('resource', { required: true })

const SAMPLE_LIMIT = 20
const FLAGS: { key: keyof Pick<FieldDraft, 'listable' | 'filterable' | 'sortable' | 'searchable'>; label: string }[] = [
	{ key: 'listable', label: 'List' },
	{ key: 'filterable', label: 'Filter' },
	{ key: 'sortable', label: 'Sort' },
	{ key: 'searchable', label: 'Search' },
]

const api = useBuilderApi()
const sample = ref<RowSample | null>(null)
const sampling = ref(false)
const sampleProblem = ref('')

watch(
	() => resource.value.relation,
	() => {
		sample.value = null
		sampleProblem.value = ''
	},
)

const proposedFields = computed(
	() => new Map((props.proposed?.fields ?? []).map((field) => [field.column, field])),
)

const labelOptions = computed(() =>
	resource.value.fields.map((field) => ({ label: field.column, value: field.column })),
)

const writes = computed(() => {
	const proposed = props.proposed?.writes
	if (!proposed) return ''
	const allowed = (['insert', 'update', 'delete'] as const).filter((kind) => proposed[kind])
	return allowed.length ? `the role may ${allowed.join(', ')}` : 'the role here writes nothing'
})

function accepts(column: string): { label: string; value: string }[] {
	return (proposedFields.value.get(column)?.accepts ?? []).map((declared) => ({
		label: declared,
		value: declared,
	}))
}

function measured(profile: ProposedColumnProfile | undefined): string {
	if (!profile) return ''
	const parts = [...profile.traits]
	if (profile.nulls !== undefined) parts.push(`${profile.nulls} null`)
	if (profile.distinct !== undefined) parts.push(`${profile.distinct} distinct`)
	if (profile.range) parts.push(`${profile.range.min} → ${profile.range.max}`)
	if (profile.categories?.length) {
		parts.push(profile.categories.map((category) => `${category.value} (${category.rows})`).join(', '))
	}
	return parts.join(' · ')
}

function shown(value: SampledValue): string {
	if (value === null) return '∅'
	if ('bytes' in value) return `${value.bytes} bytes`
	return value.truncated ? `${value.text}…` : value.text
}

async function sampleRows(): Promise<void> {
	sampling.value = true
	sampleProblem.value = ''
	try {
		sample.value = await api.sampleRows(props.connection, resource.value.relation, SAMPLE_LIMIT)
	} catch (error) {
		sampleProblem.value = error instanceof Error ? error.message : String(error)
	} finally {
		sampling.value = false
	}
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<header class="flex flex-wrap items-center gap-3">
			<UInput v-model="resource.title" aria-label="Title" class="min-w-60" />
			<span class="font-mono text-xs text-muted">{{ resource.relation }}</span>
			<USwitch v-model="resource.tableView" label="TableView" />
			<USwitch v-model="resource.writable" :disabled="!resource.tableView" label="Editable" />
			<span class="text-xs text-muted">{{ writes }}</span>
		</header>

		<UFormField label="Label" help="The column a row is named by, in lists and in the relation columns pointing here.">
			<USelect
				:model-value="resource.label ?? undefined"
				:items="labelOptions"
				placeholder="No label"
				class="w-60"
				@update:model-value="resource.label = ($event as string) ?? null"
			/>
		</UFormField>

		<table class="w-full text-left text-xs">
			<thead class="text-muted">
				<tr>
					<th class="py-1 pr-2">Column</th>
					<th class="py-1 pr-2">Type</th>
					<th class="py-1 pr-2">Title</th>
					<th v-for="flag in FLAGS" :key="flag.key" class="py-1 pr-2">{{ flag.label }}</th>
					<th class="py-1">Measured</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="field in resource.fields" :key="field.column" class="border-t border-default">
					<td class="py-1.5 pr-2">
						<UCheckbox v-model="field.include" :label="field.column" />
						<span v-if="field.relation" class="block font-mono text-[11px] text-muted">
							→ {{ field.relation }}<template v-if="proposedFields.get(field.column)?.relation?.implied"> (implied)</template>
						</span>
					</td>
					<td class="py-1.5 pr-2">
						<USelect v-model="field.declared" :items="accepts(field.column)" size="xs" class="w-24" :disabled="!!field.relation" />
						<span class="block font-mono text-[10.5px] text-muted">{{ proposedFields.get(field.column)?.native }}</span>
					</td>
					<td class="py-1.5 pr-2"><UInput v-model="field.label" size="xs" /></td>
					<td v-for="flag in FLAGS" :key="flag.key" class="py-1.5 pr-2">
						<UCheckbox v-model="field[flag.key]" :aria-label="`${flag.label} ${field.column}`" />
					</td>
					<td class="py-1.5 text-[11px] text-muted">{{ measured(proposedFields.get(field.column)?.profile) }}</td>
				</tr>
			</tbody>
		</table>

		<p v-for="entry in proposed?.leftOut ?? []" :key="entry.column" class="text-xs text-muted">
			<span class="font-mono">{{ entry.column }}</span> is left out: {{ entry.reason }} ({{ entry.rule }}).
		</p>

		<section class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<UButton
					icon="i-ph-rows-light"
					:label="sample ? 'Sample again' : 'Sample rows'"
					size="sm"
					variant="soft"
					:loading="sampling"
					@click="sampleRows"
				/>
				<span class="text-xs text-muted">
					Up to {{ SAMPLE_LIMIT }} rows, shown here only and never passed on.
				</span>
			</div>
			<p v-if="sampleProblem" class="text-xs text-error">{{ sampleProblem }}</p>
			<div v-if="sample" class="overflow-x-auto rounded-md border border-default">
				<table class="w-full text-left font-mono text-[11px]">
					<thead class="bg-elevated text-muted">
						<tr><th v-for="column in sample.columns" :key="column" class="px-2 py-1">{{ column }}</th></tr>
					</thead>
					<tbody>
						<tr v-for="(row, index) in sample.rows" :key="index" class="border-t border-default">
							<td v-for="(value, column) in row" :key="column" class="px-2 py-1 text-toned">{{ shown(value) }}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>
	</div>
</template>

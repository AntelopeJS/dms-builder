<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { ruleSentence, type FieldDraft, type ResourceDraft } from '../runtime/database'
import type {
	OpenItem,
	Proposed,
	ProposedColumnProfile,
	ProposedResource,
	RowSample,
	SampledValue,
} from '../runtime/database-types'

/**
 * One relation of the mapping, as the integrator settles it: TableView or
 * stats only, editable or not, its label, and each column with its type, title
 * and flags beside what the profile measured. A question the analysis left
 * open is asked at the control it decides; changing that control, or keeping
 * it, answers it. A few of the relation's rows are sampled when it opens, for
 * the integrator to see how its label reads: they are held in this panel only,
 * dropped when it closes, and passed to nothing else.
 */

const props = defineProps<{
	connection: string
	proposed?: ProposedResource
	/** The questions still open about this relation. */
	open?: OpenItem[]
	/** The relation columns pointing here, as `relation.column`. */
	pointing?: string[]
}>()
const emit = defineEmits<{ answer: [item: OpenItem, value: unknown] }>()
/** The relation's draft, edited in place: the proposal panel keeps it and stores it. */
const resource = defineModel<ResourceDraft>('resource', { required: true })

const SAMPLE_LIMIT = 20
const PREVIEW_ROWS = 5
const PERCENT = 100
const PURPOSE_CHOICES: { value: string; label: string; help: string }[] = [
	{ value: 'tableView', label: 'A page to list and edit its rows', help: 'A TableView page, listed in the menu.' },
	{ value: 'statsOnly', label: 'Counted in stats, no page', help: 'Stats pages can count and chart it.' },
	{ value: 'excluded', label: 'Left out', help: 'Not mapped, and not proposed again.' },
]
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
		void sampleRows()
	},
	{ immediate: true },
)

const proposedFields = computed(
	() => new Map((props.proposed?.fields ?? []).map((field) => [field.column, field])),
)

const labelItem = computed(() => props.open?.find((item) => item.kind === 'label'))
const purposeItem = computed(() => props.open?.find((item) => item.kind === 'purpose'))
const referenceItems = computed(
	() =>
		new Map(
			(props.open ?? [])
				.filter((item) => item.kind === 'reference' && item.column)
				.map((item) => [item.column!, item]),
		),
)

const keyColumns = computed(
	() =>
		new Set(
			(labelItem.value?.options ?? [])
				.filter((option) => option.title.endsWith('(the key)'))
				.map((option) => String(option.value)),
		),
)

/** Counts only, never a value: how full the column is and how many values it has. */
function counts(column: string): string {
	const profile = proposedFields.value.get(column)?.profile
	const rows = props.proposed?.rows
	const parts: string[] = []
	if (keyColumns.value.has(column)) parts.push('the key')
	if (profile?.nulls !== undefined && rows) {
		parts.push(`${Math.round(((rows - profile.nulls) / rows) * PERCENT)}% filled`)
	}
	if (profile?.distinct !== undefined) parts.push(`${profile.distinct} values`)
	return parts.join(' · ')
}

const labelOptions = computed(() =>
	resource.value.fields.map((field) => {
		const measured = counts(field.column)
		return { label: measured ? `${field.column} · ${measured}` : field.column, value: field.column }
	}),
)

const labelHelp = computed(() => {
	const where = ['first in its list', ...(props.pointing ?? [])]
	return `The column a row is named by. It shows ${where.join(', ')}.`
})

const labelPreview = computed(() => {
	const column = resource.value.label
	const index = column && sample.value ? sample.value.columns.indexOf(column) : -1
	if (!sample.value || index < 0) return undefined
	const values = sample.value.rows.map((row) => row[index] ?? null)
	const empty = values.filter((value) => value === null || ('text' in value && !value.text.trim())).length
	return { values: values.slice(0, PREVIEW_ROWS).map(shown), empty, rows: values.length }
})

function chooseLabel(value: string | undefined): void {
	resource.value.label = value ?? null
	if (labelItem.value) emit('answer', labelItem.value, resource.value.label)
}

function referenceOptions(item: OpenItem): { label: string; value: string }[] {
	return item.options.map((option) => ({ label: option.title, value: JSON.stringify(option.value) }))
}

function chooseReference(item: OpenItem, value: string): void {
	emit('answer', item, JSON.parse(value))
}

function keepReference(item: OpenItem, column: string): void {
	emit('answer', item, resource.value.fields.find((field) => field.column === column)?.relation ?? null)
}

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

function shown(value: SampledValue | undefined): string {
	if (value === null || value === undefined) return '∅'
	if ('bytes' in value) return `${value.bytes} bytes`
	return value.truncated ? `${value.text}…` : value.text
}

/** Why a choice is what it is, as the badge beside it says on hover. */
function why(choice: Proposed<unknown> | undefined): string {
	return choice ? `${choice.kind === 'fact' ? 'Fact' : 'Default'}: ${ruleSentence(choice.rule)}` : ''
}

async function sampleRows(): Promise<void> {
	const relation = resource.value.relation
	sampling.value = true
	sampleProblem.value = ''
	try {
		const rows = await api.sampleRows(props.connection, relation, SAMPLE_LIMIT)
		if (resource.value.relation === relation) sample.value = rows
	} catch (error) {
		if (resource.value.relation === relation) {
			sampleProblem.value = error instanceof Error ? error.message : String(error)
		}
	} finally {
		sampling.value = false
	}
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<header class="flex flex-wrap items-center gap-3">
			<UTooltip :text="why(proposed?.title)">
				<UInput v-model="resource.title" aria-label="Title" class="min-w-60" />
			</UTooltip>
			<span class="font-mono text-xs text-muted">{{ resource.relation }}</span>
			<template v-if="!purposeItem">
				<UTooltip :text="why(proposed?.tableView)">
					<USwitch v-model="resource.tableView" label="TableView" />
				</UTooltip>
				<UTooltip :text="why(proposed?.writable)">
					<USwitch v-model="resource.writable" :disabled="!resource.tableView" label="Editable" />
				</UTooltip>
			</template>
			<span class="text-xs text-muted">{{ writes }}</span>
		</header>

		<section
			v-if="purposeItem"
			class="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
		>
			<p class="text-toned"><UBadge color="warning" variant="subtle" size="sm">To decide</UBadge> {{ purposeItem.question }}</p>
			<div class="flex flex-wrap gap-2">
				<UTooltip v-for="choice in PURPOSE_CHOICES" :key="choice.value" :text="choice.help">
					<UButton
						:label="choice.label"
						size="xs"
						color="neutral"
						variant="outline"
						@click="emit('answer', purposeItem, choice.value)"
					/>
				</UTooltip>
			</div>
		</section>

		<UFormField label="Label" :help="`${labelHelp} ${why(proposed?.label)}`">
			<div class="flex flex-col gap-2">
				<p v-if="labelItem" class="text-xs text-toned">
					<UBadge color="warning" variant="subtle" size="sm">To decide</UBadge> {{ labelItem.question }}
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<USelect
						:model-value="resource.label ?? undefined"
						:items="labelOptions"
						placeholder="No label"
						class="w-80"
						@update:model-value="chooseLabel($event as string | undefined)"
					/>
					<UButton
						v-if="labelItem"
						:label="resource.label ? `Keep ${resource.label}` : 'Keep no label'"
						size="xs"
						variant="soft"
						@click="emit('answer', labelItem, resource.label)"
					/>
				</div>
				<div v-if="labelPreview" class="text-xs text-muted">
					<p>
						Sampled rows read:
						<span v-for="(value, index) in labelPreview.values" :key="index" class="mr-2 font-mono text-toned">{{ value }}</span>
					</p>
					<p v-if="labelPreview.empty" class="text-warning">
						{{ labelPreview.empty }} of {{ labelPreview.rows }} sampled rows have nothing to show here.
					</p>
				</div>
			</div>
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
						<div v-if="referenceItems.get(field.column)" class="mt-1 flex flex-col gap-1 text-[11px]">
							<p class="text-toned">
								<UBadge color="warning" variant="subtle" size="sm">To decide</UBadge>
								{{ referenceItems.get(field.column)!.question }}
							</p>
							<div class="flex items-center gap-1">
								<USelect
									:model-value="JSON.stringify(field.relation)"
									:items="referenceOptions(referenceItems.get(field.column)!)"
									size="xs"
									class="w-64"
									@update:model-value="chooseReference(referenceItems.get(field.column)!, $event as string)"
								/>
								<UButton
									label="Keep"
									size="xs"
									variant="soft"
									@click="keepReference(referenceItems.get(field.column)!, field.column)"
								/>
							</div>
						</div>
						<span v-else-if="field.relation" class="block font-mono text-[11px] text-muted">
							→ {{ field.relation }}<template v-if="proposedFields.get(field.column)?.relation?.implied"> (implied: {{ ruleSentence('F5') }})</template>
						</span>
					</td>
					<td class="py-1.5 pr-2">
						<UTooltip :text="why(proposedFields.get(field.column)?.declared)">
							<USelect v-model="field.declared" :items="accepts(field.column)" size="xs" class="w-24" :disabled="!!field.relation" />
						</UTooltip>
						<span class="block font-mono text-[10.5px] text-muted">{{ proposedFields.get(field.column)?.native }}</span>
						<span
							v-if="proposedFields.get(field.column)?.declared.lossy && field.declared === proposedFields.get(field.column)?.declared.value"
							class="block text-[10.5px] text-warning"
						>{{ proposedFields.get(field.column)?.declared.lossy }}</span>
					</td>
					<td class="py-1.5 pr-2">
						<UTooltip :text="why(proposedFields.get(field.column)?.label)">
							<UInput v-model="field.label" size="xs" />
						</UTooltip>
					</td>
					<td v-for="flag in FLAGS" :key="flag.key" class="py-1.5 pr-2">
						<UTooltip :text="why(proposedFields.get(field.column)?.[flag.key])">
							<UCheckbox v-model="field[flag.key]" :aria-label="`${flag.label} ${field.column}`" />
						</UTooltip>
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
					label="Sample again"
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

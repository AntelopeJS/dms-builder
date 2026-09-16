<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBuilder } from '../runtime/session'
import type { FieldSpec } from '../runtime/types'

const ASPECTS = [
	{ key: 'listable', label: 'Listed' },
	{ key: 'selectable', label: 'In option lists' },
	{ key: 'searchable', label: 'Searchable' },
	{ key: 'sortable', label: 'Sortable' },
	{ key: 'filterable', label: 'Filterable' },
	{ key: 'required', label: 'Required' },
	{ key: 'exported', label: 'In export' },
] as const

const props = defineProps<{ resource?: string }>()
const emit = defineEmits<{ submit: [FieldSpec]; cancel: [] }>()

const builder = useBuilder()
const session = builder.session

const name = ref('')
const label = ref('')
const dataType = ref('string')
const aspects = ref<Record<string, boolean>>({
	listable: true,
	selectable: true,
})
const target = ref<string | undefined>(undefined)
const labelKey = ref('')

const dataTypes = computed(() =>
	(session.value.catalog?.dataTypes ?? []).map((entry) => ({
		label: entry.id,
		value: entry.id,
	})),
)
const reserved = computed(
	() => session.value.catalog?.reservedFieldNames ?? [],
)
// A relation stores the DataAPI of the resource it points at, so it is built
// from a resource plus the field that labels a row — not typed as raw JSON.
const isRelation = computed(
	() => dataType.value === 'relation' || dataType.value === 'cascader_relation',
)
const targetFields = computed(() =>
	(session.value.resourceFields[target.value ?? ''] ?? []).map((field) => ({
		label: field,
		value: field,
	})),
)
const taken = computed(() =>
	reserved.value.includes(name.value.trim()) ? 'reserved by the DataAPI' : '',
)
const valid = computed(
	() =>
		!!name.value.trim() &&
		!taken.value &&
		(!isRelation.value || (!!target.value && !!labelKey.value)),
)

function pickTarget(value: string): void {
	target.value = value
	void builder.loadResourceFields(value)
}

function submit(): void {
	if (!valid.value) {
		return
	}
	const config = isRelation.value
		? {
				dataApiController: { $ref: { resource: target.value } },
				keyMapping: { label: labelKey.value },
			}
		: undefined
	emit('submit', {
		name: name.value.trim(),
		label: label.value.trim() || undefined,
		dataType: { $dataType: dataType.value, ...(config ? { config } : {}) },
		...aspects.value,
	} as FieldSpec)
	name.value = ''
	label.value = ''
}
</script>

<template>
	<div class="flex flex-col gap-3 rounded-lg border border-default p-3">
		<p class="text-sm font-semibold text-highlighted">New field</p>

		<div class="grid grid-cols-2 gap-3">
			<div class="flex flex-col gap-1.5">
				<label class="text-xs font-medium text-default">Key</label>
				<UInput v-model="name" size="sm" placeholder="price" class="font-mono" />
				<p v-if="taken" class="text-xs text-error">{{ taken }}</p>
			</div>
			<div class="flex flex-col gap-1.5">
				<label class="text-xs font-medium text-default">Type</label>
				<USelectMenu
					v-model="dataType"
					:items="dataTypes"
					value-key="value"
					size="sm"
				/>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<label class="text-xs font-medium text-default">Displayed label</label>
			<UInput v-model="label" size="sm" :placeholder="name || 'Price'" />
		</div>

		<template v-if="isRelation">
			<div class="flex flex-col gap-1.5">
				<label class="text-xs font-medium text-default">Points at</label>
				<USelectMenu
					:model-value="target"
					:items="
						session.resources
							.filter((entry) => entry.ref !== props.resource)
							.map((entry) => ({ label: entry.ref, value: entry.ref }))
					"
					value-key="value"
					size="sm"
					placeholder="Choose a resource…"
					@update:model-value="pickTarget($event)"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label class="text-xs font-medium text-default">Label field</label>
				<USelectMenu
					v-model="labelKey"
					:items="targetFields"
					value-key="value"
					size="sm"
					:disabled="!target"
					placeholder="Which field names a row"
				/>
			</div>
		</template>

		<div class="flex flex-wrap gap-1">
			<UButton
				v-for="entry in ASPECTS"
				:key="entry.key"
				:label="entry.label"
				size="xs"
				:color="aspects[entry.key] ? 'primary' : 'neutral'"
				:variant="aspects[entry.key] ? 'soft' : 'outline'"
				@click="aspects[entry.key] = !aspects[entry.key]"
			/>
		</div>

		<div class="flex gap-2">
			<UButton
				size="xs"
				color="primary"
				label="Add the field"
				:disabled="!valid"
				@click="submit"
			/>
			<UButton
				size="xs"
				color="neutral"
				variant="ghost"
				label="Cancel"
				@click="emit('cancel')"
			/>
		</div>
	</div>
</template>

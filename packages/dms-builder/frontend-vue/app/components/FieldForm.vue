<script setup lang="ts">
import { computed, ref } from 'vue'
import { dataTypeGroups, dataTypeItem } from '../runtime/catalog'
import { DEFAULT_DATA_TYPE } from '../runtime/constants'
import { keyFrom } from '../runtime/keys'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import type { FieldSpec } from '../runtime/types'

/** What a new field starts as; every one of them is a tick in the grid later. */
const ASPECTS = [
	{ key: 'listable', label: 'Shown' },
	{ key: 'selectable', label: 'In option lists' },
	{ key: 'searchable', label: 'Search' },
	{ key: 'sortable', label: 'Sort' },
	{ key: 'filterable', label: 'Filter' },
	{ key: 'required', label: 'Required' },
	{ key: 'exported', label: 'In export' },
] as const

/** `busy` while the field the form handed over is being written. */
const props = defineProps<{ resource?: string; busy?: boolean }>()
const emit = defineEmits<{ submit: [FieldSpec]; cancel: [] }>()

const builder = useBuilder()
const { advanced } = useBuilderMode()
const session = builder.session

const label = ref('')
/** A key typed in the advanced view; until then, the key follows the label. */
const typedKey = ref<string | null>(null)
const dataType = ref(DEFAULT_DATA_TYPE)
const aspects = ref<Record<string, boolean>>({
	listable: true,
	selectable: true,
})
const target = ref<string | undefined>(undefined)
const labelKey = ref('')

const groups = computed(() => dataTypeGroups(session.value.catalog))
const picked = computed(() => dataTypeItem(dataType.value))
const structure = computed(
	() => session.value.resourceStructures[props.resource ?? ''],
)
const name = computed(() =>
	typedKey.value !== null ? typedKey.value.trim() : (keyFrom(label.value) ?? ''),
)
const problem = computed(() => {
	if (!name.value) {
		return label.value.trim() ? 'Use at least one letter or digit.' : ''
	}
	if ((session.value.catalog?.reservedFieldNames ?? []).includes(name.value)) {
		return `${name.value} is reserved by the DataAPI.`
	}
	if (structure.value?.fields.some((field) => field.name === name.value)) {
		return `This table already has a ${name.value} field.`
	}
	return ''
})
// A relation stores the DataAPI of the resource it points at, so it is built
// from a resource plus the field that labels a row — not typed as raw JSON.
const isRelation = computed(
	() => dataType.value === 'relation' || dataType.value === 'cascader_relation',
)
const targets = computed(() =>
	session.value.resources
		.filter((entry) => entry.ref !== props.resource)
		.map((entry) => ({ label: entry.ref, value: entry.ref })),
)
const targetFields = computed(() =>
	(session.value.resourceFields[target.value ?? ''] ?? []).map((field) => ({
		label: field,
		value: field,
	})),
)
const valid = computed(
	() =>
		!!name.value &&
		!problem.value &&
		(!isRelation.value || (!!target.value && !!labelKey.value)),
)

function typeKey(value: string): void {
	// Emptied, the key goes back to following the label.
	typedKey.value = value.trim() ? value : null
}

function pickTarget(value: string): void {
	target.value = value
	labelKey.value = ''
	void builder.loadResourceFields(value)
}

function submit(): void {
	if (!valid.value || props.busy) {
		return
	}
	const config = isRelation.value
		? {
				dataApiController: { $ref: { resource: target.value } },
				keyMapping: { label: labelKey.value },
			}
		: undefined
	emit('submit', {
		name: name.value,
		label: label.value.trim() || undefined,
		dataType: { $dataType: dataType.value, ...(config ? { config } : {}) },
		...aspects.value,
	} as FieldSpec)
}
</script>

<template>
	<div class="flex min-h-full flex-col">
		<div class="flex flex-1 flex-col gap-5">
			<div
				class="grid gap-3"
				:class="advanced ? 'grid-cols-2' : 'grid-cols-1'"
			>
				<div class="flex flex-col gap-1.5">
					<label for="new-field-label" class="text-xs font-medium text-toned">
						Label
					</label>
					<UInput
						id="new-field-label"
						v-model="label"
						placeholder="Price"
						autofocus
						@keydown.enter="submit"
					/>
					<p v-if="problem && !advanced" class="text-xs text-error">
						{{ problem }}
					</p>
					<p v-else class="text-xs text-muted">
						What forms and the table show.
					</p>
				</div>
				<div v-if="advanced" class="flex flex-col gap-1.5">
					<label
						for="new-field-key"
						class="flex items-center gap-1.5 text-xs font-medium text-toned"
					>
						Key
						<span
							v-if="typedKey === null"
							class="rounded bg-accented px-1.5 text-[11px] font-normal text-muted"
						>
							from the label
						</span>
					</label>
					<UInput
						id="new-field-key"
						:model-value="name"
						placeholder="price"
						class="font-mono"
						@update:model-value="typeKey(String($event))"
					/>
					<p v-if="problem" class="text-xs text-error">{{ problem }}</p>
					<p v-else class="text-xs text-muted">
						The column's name. Fixed once created.
					</p>
				</div>
			</div>

			<div class="flex flex-col gap-3">
				<div class="flex items-baseline justify-between">
					<p class="text-xs font-semibold text-toned">Type</p>
					<p class="text-xs text-muted">{{ picked.label }}</p>
				</div>
				<div
					v-for="group in groups"
					:key="group.label"
					class="flex flex-col gap-1.5"
				>
					<p
						class="text-[11px] font-semibold uppercase tracking-wider text-muted"
					>
						{{ group.label }}
					</p>
					<div class="grid grid-cols-3 gap-1.5">
						<button
							v-for="item in group.items"
							:key="item.value"
							type="button"
							class="flex h-9 min-w-0 items-center gap-2 rounded-md border px-2.5 text-left text-[13px] transition-colors"
							:class="
								dataType === item.value
									? 'border-primary bg-primary/10 font-medium text-primary'
									: 'border-default text-toned hover:border-accented hover:bg-elevated'
							"
							:aria-pressed="dataType === item.value"
							@click="dataType = item.value"
						>
							<UIcon
								:name="item.icon"
								class="size-4 shrink-0"
								:class="dataType === item.value ? '' : 'text-muted'"
							/>
							<span class="truncate">{{ item.label }}</span>
						</button>
					</div>
				</div>
			</div>

			<div
				v-if="isRelation"
				class="flex flex-col gap-3 rounded-lg border border-default bg-elevated p-3"
			>
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1.5">
						<label class="text-xs font-medium text-toned">Points at</label>
						<USelectMenu
							:model-value="target"
							:items="targets"
							icon="i-ph-database"
							value-key="value"
							placeholder="Choose a table…"
							@update:model-value="pickTarget($event)"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<label class="text-xs font-medium text-toned">Shown as</label>
						<USelectMenu
							v-model="labelKey"
							:items="targetFields"
							value-key="value"
							:disabled="!target"
							placeholder="Which field names a row"
						/>
					</div>
				</div>
				<p v-if="target && labelKey" class="text-xs leading-relaxed text-muted">
					Each row of <b class="font-medium text-toned">{{ resource }}</b> picks
					one row of <b class="font-medium text-toned">{{ target }}</b>, listed by
					its {{ labelKey }}.
				</p>
			</div>

			<div class="flex flex-col gap-2">
				<p class="text-xs font-semibold text-toned">Starts as</p>
				<div class="flex flex-wrap gap-1.5">
					<UButton
						v-for="entry in ASPECTS"
						:key="entry.key"
						:label="entry.label"
						:icon="aspects[entry.key] ? 'i-ph-check-bold' : undefined"
						size="xs"
						:color="aspects[entry.key] ? 'primary' : 'neutral'"
						:variant="aspects[entry.key] ? 'soft' : 'outline'"
						:aria-pressed="aspects[entry.key] === true"
						class="rounded-full"
						@click="aspects[entry.key] = !aspects[entry.key]"
					/>
				</div>
				<p class="text-xs text-muted">
					All of these can be changed later from the fields grid.
				</p>
			</div>
		</div>

		<div
			class="sticky bottom-0 -mx-4 -mb-4 mt-5 flex items-center gap-2 border-t border-default bg-default px-4 py-3"
		>
			<p class="flex-1 text-xs text-muted">
				<template v-if="structure">
					Added to
					<span class="font-mono">{{ structure.tableName }}</span> straight
					away.
				</template>
			</p>
			<UButton
				label="Cancel"
				color="neutral"
				variant="ghost"
				@click="emit('cancel')"
			/>
			<UButton
				label="Add field"
				:disabled="!valid"
				:loading="busy"
				@click="submit"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dataTypeItem } from '../runtime/catalog'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import type { ResourceFieldStructure } from '../runtime/types'

type Column = 'listable' | 'searchable' | 'sortable' | 'filterable' | 'required'

/**
 * The aspects worth seeing for every field at once, one column each. The rest
 * of a field — its label, type and form rules — is a click away, under it.
 */
const COLUMNS: { key: Column; label: string; help: string }[] = [
	{ key: 'listable', label: 'Shown', help: 'Shown in the table on first load.' },
	{ key: 'searchable', label: 'Search', help: "Read by the table's search bar." },
	{ key: 'sortable', label: 'Sort', help: 'Usable to sort the table.' },
	{ key: 'filterable', label: 'Filter', help: "Usable in the table's filters." },
	{ key: 'required', label: 'Required', help: 'A row cannot be saved without it.' },
]

const props = defineProps<{ resource: string }>()
const emit = defineEmits<{ add: [] }>()

const builder = useBuilder()
const { advanced } = useBuilderMode()
const session = builder.session

const open = ref<string | null>(null)

const fields = computed(
	() => session.value.resourceStructures[props.resource]?.fields ?? [],
)

watch(
	() => props.resource,
	() => {
		open.value = null
	},
)

function on(field: ResourceFieldStructure, key: Column): boolean {
	return field[key] === true
}

function writing(name: string): boolean {
	return session.value.pending.includes(`${props.resource}#${name}`)
}

function typeOf(field: ResourceFieldStructure) {
	return dataTypeItem(field.dataType?.$dataType ?? 'string')
}

function toggle(field: ResourceFieldStructure, key: Column): void {
	void builder.configureField(`${props.resource}#${field.name}`, {
		[key]: !on(field, key),
	})
}
</script>

<template>
	<div class="flex flex-col gap-2.5">
		<div class="overflow-hidden rounded-lg border border-default">
			<div
				class="flex h-9 items-center bg-elevated text-xs font-medium text-muted"
			>
				<div class="flex-1 pl-3">Field</div>
				<div
					v-for="column in COLUMNS"
					:key="column.key"
					class="w-15 text-center"
					:title="column.help"
				>
					{{ column.label }}
				</div>
				<div class="w-9" />
			</div>

			<div
				v-for="field in fields"
				:key="field.name"
				class="border-t border-default"
				:class="open === field.name ? 'bg-elevated' : ''"
			>
				<div class="flex h-13 items-center">
					<button
						type="button"
						class="flex h-full min-w-0 flex-1 items-center gap-2.5 px-3 text-left"
						:aria-expanded="open === field.name"
						@click="open = open === field.name ? null : field.name"
					>
						<span
							class="flex size-7 shrink-0 items-center justify-center rounded-md border"
							:class="
								open === field.name
									? 'border-primary/35 bg-primary/10 text-primary'
									: 'border-default bg-accented text-muted'
							"
						>
							<UIcon :name="typeOf(field).icon" class="size-4" />
						</span>
						<span class="flex min-w-0 flex-col">
							<span
								class="flex min-w-0 items-center gap-2 text-sm"
								:class="
									open === field.name
										? 'font-medium text-highlighted'
										: 'text-default'
								"
							>
								<span class="truncate">{{ field.label || field.name }}</span>
								<UIcon
									v-if="field.opaque"
									name="i-ph-lock-simple"
									class="size-3.5 shrink-0 text-muted"
									title="Set up in code"
								/>
								<span
									v-if="writing(field.name)"
									class="inline-flex shrink-0 items-center gap-1 text-[11px] font-normal text-primary"
								>
									<UIcon name="i-ph-circle-notch" class="size-3 animate-spin" />
									Saving
								</span>
							</span>
							<span class="truncate text-xs text-muted">
								<span v-if="advanced" class="font-mono">{{ field.name }} · </span
								>{{ typeOf(field).label }}
							</span>
						</span>
					</button>
					<div
						v-for="column in COLUMNS"
						:key="column.key"
						class="flex w-15 justify-center"
					>
						<button
							type="button"
							class="flex size-5 items-center justify-center rounded-[5px] border transition-colors disabled:opacity-50"
							:class="[
								on(field, column.key)
									? 'border-primary/45 bg-primary/15 text-primary'
									: 'border-accented',
								field.opaque
									? 'cursor-not-allowed'
									: writing(field.name)
										? 'cursor-progress'
										: 'hover:border-primary/60',
							]"
							:aria-pressed="on(field, column.key)"
							:aria-label="`${field.label || field.name}: ${column.label}`"
							:title="field.opaque ? 'Set up in code' : column.help"
							:disabled="field.opaque || writing(field.name)"
							@click="toggle(field, column.key)"
						>
							<UIcon
								v-if="on(field, column.key)"
								name="i-ph-check-bold"
								class="size-3"
							/>
						</button>
					</div>
					<div class="flex w-9 justify-center text-muted">
						<UIcon
							:name="open === field.name ? 'i-ph-caret-down' : 'i-ph-caret-right'"
							class="size-4"
						/>
					</div>
				</div>

				<DmsBuilderFieldDetail
					v-if="open === field.name"
					:resource="resource"
					:field="field"
				/>
			</div>

			<p
				v-if="!fields.length"
				class="border-t border-default px-3 py-3 text-sm text-muted"
			>
				This table has no field yet.
			</p>

			<UButton
				icon="i-ph-plus"
				label="Add field"
				variant="ghost"
				block
				class="h-10 justify-start rounded-none border-t border-default px-3"
				@click="emit('add')"
			/>
		</div>
		<p class="text-xs text-muted">
			A tick applies straight away. Open a field for its label, type and form
			rules.
		</p>
	</div>
</template>

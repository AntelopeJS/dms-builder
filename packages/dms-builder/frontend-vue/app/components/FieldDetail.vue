<script setup lang="ts">
import { computed } from 'vue'
import { dataTypeItem, dataTypeItems } from '../runtime/catalog'
import { fieldFlags } from '../runtime/constants'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import type { ResourceFieldStructure } from '../runtime/types'

/** The routes a field can be demanded on, as the API names them. */
const CHECKED_ON = [
	{ value: 'new', label: 'Create' },
	{ value: 'edit', label: 'Update' },
]

/** Where else a field shows up than the table and its forms. */
const ELSEWHERE = fieldFlags('selectable', 'exported')

const props = defineProps<{
	resource: string
	field: ResourceFieldStructure
}>()

const builder = useBuilder()
const { advanced } = useBuilderMode()
const { confirm } = useConfirm()
const session = builder.session

const path = computed(() => `${props.resource}#${props.field.name}`)
const writing = computed(() => session.value.pending.includes(path.value))
const dataTypes = computed(() => dataTypeItems(session.value.catalog))
const type = computed(() =>
	dataTypeItem(props.field.dataType?.$dataType),
)

function patch(value: Record<string, unknown>): void {
	void builder.configureField(path.value, value)
}

/** A removal drops the column and the value every row holds in it: it asks first. */
async function remove(): Promise<void> {
	const name = props.field.label || props.field.name
	const confirmed = await confirm({
		title: `Remove ${name}?`,
		description: `Removing ${name} drops its column and the value every row holds in it. This is written straight away, not on Save.`,
		confirmLabel: 'Remove the field and its data',
		confirmColor: 'error',
	})
	if (confirmed) void builder.removeField(path.value)
}
</script>

<template>
	<div v-if="field.opaque" class="flex flex-col gap-1.5 text-xs text-muted">
		<p>This field is set up in code, so it can't be changed here.</p>
		<p v-if="advanced">
			The builder can read this field but not rewrite it:
			{{ field.opaqueReason }}.
		</p>
	</div>

	<div v-else class="flex flex-col gap-5">
		<div class="grid grid-cols-2 gap-3">
			<UFormField label="Label">
				<UInput
					:model-value="field.label ?? ''"
					:placeholder="field.name"
					:disabled="writing"
					class="w-full"
					@change="
						patch({
							label: ($event.target as HTMLInputElement).value || undefined,
						})
					"
				/>
			</UFormField>
			<UFormField label="Type">
				<USelectMenu
					:model-value="field.dataType?.$dataType"
					:items="dataTypes"
					:icon="type.icon"
					value-key="value"
					:disabled="writing"
					class="w-full"
					@update:model-value="patch({ dataType: { $dataType: $event } })"
				/>
			</UFormField>
		</div>

		<div
			v-if="advanced"
			class="flex items-start gap-2 text-xs leading-relaxed text-muted"
		>
			<UIcon name="i-ph-lock-simple" class="mt-0.5 size-3.5 shrink-0" />
			<p>
				Key
				<code class="rounded bg-accented px-1.5 py-px font-mono text-toned">{{
					field.name
				}}</code>
				is fixed once created — to rename it, add a new field and remove this
				one.
			</p>
		</div>

		<div class="flex flex-col gap-3">
			<p class="text-xs font-semibold text-toned">Form rules</p>
			<USwitch
				:model-value="field.required === true"
				label="Required"
				description="Forms won't save a row without it."
				:disabled="writing"
				@update:model-value="patch({ required: $event })"
			/>
			<UFormField
				label="Also checked by the API on"
				description="Requests missing it on these routes are refused."
			>
				<UCheckboxGroup
					:model-value="field.mandatory ?? []"
					:items="CHECKED_ON"
					orientation="horizontal"
					:disabled="writing"
					@update:model-value="patch({ mandatory: $event })"
				/>
			</UFormField>
		</div>

		<div class="flex flex-col gap-3">
			<p class="text-xs font-semibold text-toned">Elsewhere</p>
			<USwitch
				v-for="entry in ELSEWHERE"
				:key="entry.key"
				:model-value="field[entry.key] === true"
				:label="entry.label"
				:description="entry.help"
				:disabled="writing"
				@update:model-value="patch({ [entry.key]: $event })"
			/>
		</div>

		<div
			class="flex items-center justify-between gap-3 border-t border-default pt-3.5"
		>
			<UButton
				icon="i-ph-trash"
				size="xs"
				color="error"
				variant="ghost"
				label="Remove field"
				class="-ml-2"
				@click="remove"
			/>
			<p class="text-xs text-muted">Drops the column and the data it holds.</p>
		</div>
	</div>
</template>

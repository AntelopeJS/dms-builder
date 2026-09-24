<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dataTypeItem, dataTypeItems } from '../runtime/catalog'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import type { ResourceFieldStructure } from '../runtime/types'

/** The routes a field can be demanded on, as the API names them. */
const CHECKED_ON = [
	{ route: 'new', label: 'Create' },
	{ route: 'edit', label: 'Update' },
] as const

/** Where else a field shows up than the table and its forms. */
const ELSEWHERE = [
	{
		key: 'selectable',
		label: 'In option lists',
		help: 'Offered when another table points at a row of this one.',
	},
	{
		key: 'exported',
		label: 'In CSV export',
		help: "Carried by the table's export.",
	},
] as const

const props = defineProps<{
	resource: string
	field: ResourceFieldStructure
}>()

const builder = useBuilder()
const { advanced } = useBuilderMode()
const session = builder.session

/**
 * Whether the removal waits on its second click. It drops the column and the
 * value every row holds in it, so it never goes on the first.
 */
const confirming = ref(false)

const path = computed(() => `${props.resource}#${props.field.name}`)
const writing = computed(() => session.value.pending.includes(path.value))
const dataTypes = computed(() => dataTypeItems(session.value.catalog))
const type = computed(() =>
	dataTypeItem(props.field.dataType?.$dataType ?? 'string'),
)
const id = computed(() => `field-${props.resource}-${props.field.name}`)

watch(
	() => props.field.name,
	() => {
		confirming.value = false
	},
)

function patch(value: Record<string, unknown>): void {
	void builder.configureField(path.value, value)
}

function checkedOn(route: string): boolean {
	return (props.field.mandatory ?? []).includes(route)
}

function toggleCheckedOn(route: string): void {
	const current = props.field.mandatory ?? []
	patch({
		mandatory: current.includes(route)
			? current.filter((entry) => entry !== route)
			: [...current, route],
	})
}

function remove(): void {
	confirming.value = false
	void builder.removeField(path.value)
}
</script>

<template>
	<div class="pb-4 pl-[50px] pr-4 pt-1">
		<div v-if="field.opaque" class="flex flex-col gap-1.5 text-xs text-muted">
			<p>This field is set up in code, so it can't be changed here.</p>
			<p v-if="advanced">
				The builder can read this field but not rewrite it:
				{{ field.opaqueReason }}.
			</p>
		</div>

		<div v-else class="flex flex-col gap-5">
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1.5">
					<label :for="`${id}-label`" class="text-xs font-medium text-toned">
						Label
					</label>
					<UInput
						:id="`${id}-label`"
						:model-value="field.label ?? ''"
						:placeholder="field.name"
						:disabled="writing"
						@change="
							patch({
								label: ($event.target as HTMLInputElement).value || undefined,
							})
						"
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<label :for="`${id}-type`" class="text-xs font-medium text-toned">
						Type
					</label>
					<USelectMenu
						:id="`${id}-type`"
						:model-value="field.dataType?.$dataType"
						:items="dataTypes"
						:icon="type.icon"
						value-key="value"
						:disabled="writing"
						@update:model-value="patch({ dataType: { $dataType: $event } })"
					/>
				</div>
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
					is fixed once created — to rename it, add a new field and remove
					this one.
				</p>
			</div>

			<div class="flex flex-col gap-3">
				<p class="text-xs font-semibold text-toned">Form rules</p>
				<div class="flex items-center gap-4">
					<div class="min-w-0 flex-1">
						<p class="text-[13px] text-default">Required</p>
						<p class="text-xs text-muted">Forms won't save a row without it.</p>
					</div>
					<USwitch
						:model-value="field.required === true"
						:disabled="writing"
						aria-label="Required"
						@update:model-value="patch({ required: $event })"
					/>
				</div>
				<div class="flex items-center gap-4">
					<div class="min-w-0 flex-1">
						<p class="text-[13px] text-default">Also checked by the API on</p>
						<p class="text-xs text-muted">
							Requests missing it on these routes are refused.
						</p>
					</div>
					<div
						role="group"
						aria-label="Checked by the API on"
						class="flex gap-0.5 rounded-md border border-accented p-0.5"
					>
						<UButton
							v-for="entry in CHECKED_ON"
							:key="entry.route"
							:label="entry.label"
							:icon="checkedOn(entry.route) ? 'i-ph-check-bold' : undefined"
							size="xs"
							:color="checkedOn(entry.route) ? 'primary' : 'neutral'"
							:variant="checkedOn(entry.route) ? 'soft' : 'ghost'"
							:aria-pressed="checkedOn(entry.route)"
							:disabled="writing"
							@click="toggleCheckedOn(entry.route)"
						/>
					</div>
				</div>
			</div>

			<div class="flex flex-col gap-3">
				<p class="text-xs font-semibold text-toned">Elsewhere</p>
				<div
					v-for="entry in ELSEWHERE"
					:key="entry.key"
					class="flex items-center gap-4"
				>
					<div class="min-w-0 flex-1">
						<p class="text-[13px] text-default">{{ entry.label }}</p>
						<p class="text-xs text-muted">{{ entry.help }}</p>
					</div>
					<USwitch
						:model-value="field[entry.key] === true"
						:disabled="writing"
						:aria-label="entry.label"
						@update:model-value="patch({ [entry.key]: $event })"
					/>
				</div>
			</div>

			<div class="border-t border-default pt-3.5">
				<div
					v-if="confirming"
					class="flex flex-col gap-2.5 rounded-md border border-error/40 bg-error/5 p-3"
				>
					<p class="text-xs text-toned">
						Removing <b>{{ field.label || field.name }}</b> drops its column and
						<b>the value every row holds in it</b>. This is written straight away,
						not on Save.
					</p>
					<div class="flex gap-2">
						<UButton
							size="xs"
							color="error"
							label="Remove the field and its data"
							@click="remove"
						/>
						<UButton
							size="xs"
							color="neutral"
							variant="ghost"
							label="Keep it"
							@click="confirming = false"
						/>
					</div>
				</div>
				<div v-else class="flex items-center justify-between gap-3">
					<UButton
						icon="i-ph-trash"
						size="xs"
						color="error"
						variant="ghost"
						label="Remove field"
						class="-ml-2"
						@click="confirming = true"
					/>
					<p class="text-xs text-muted">Drops the column and the data it holds.</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFormBlock } from '../runtime/form-panel'
import { fillableColumns } from '../runtime/form-table'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import { servedWith, serves } from '../runtime/table-routes'
import type { ResourceStructure } from '../runtime/types'

/**
 * Where a form's values go: a row of the table picked, or an address someone
 * typed in the advanced view. A form placed a moment ago goes nowhere yet, and
 * the tables to pick from are the first thing it shows.
 */
const props = defineProps<{ path: string }>()

const builder = useBuilder()
const session = builder.session
const { setMode } = useBuilderMode()
const form = useFormBlock(() => props.path)

const destination = form.destination
const table = form.table
/** Whether the list of tables is open over a destination already chosen. */
const choosing = ref(false)

const listing = computed(
	() => destination.value.kind === 'none' || choosing.value,
)

function refusal(structure: ResourceStructure): string | undefined {
	return serves(structure, 'create') ? undefined : 'Takes no new rows'
}

function fillable(structure: ResourceStructure): number {
	return fillableColumns(structure).length
}

/** The table picked, when its API no longer creates rows. */
const refuses = computed(
	() => !!form.structure.value && !serves(form.structure.value, 'create'),
)
const writing = computed(
	() => !!table.value && session.value.pending.includes(table.value.ref),
)

const askedCount = computed(
	() => form.columns.value.filter((column) => form.asked.value.has(column.name)).length,
)

async function choose(ref: string): Promise<void> {
	await form.bindTo(ref)
	choosing.value = false
}

/** Written straight to the table, as its API tab would. */
function turnCreateOn(): void {
	const current = table.value
	if (!current) return
	void builder.configureResource(current.ref, servedWith(form.structure.value, 'create'))
}

function columnsLabel(count: number | undefined): string {
	if (count === undefined) return ''
	return `${count} column${count === 1 ? '' : 's'}`
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<p class="text-xs font-semibold text-toned">
			{{ destination.kind === 'address' ? 'Sends to' : 'Saves into' }}
		</p>

		<template v-if="destination.kind === 'table'">
			<UButton
				:color="refuses ? 'warning' : 'neutral'"
				variant="outline"
				block
				:trailing-icon="choosing ? 'i-ph-caret-up' : 'i-ph-caret-down'"
				:aria-expanded="choosing"
				:aria-label="`Table the form saves into: ${destination.table.ref}`"
				@click="choosing = !choosing"
			>
				<template #leading>
					<span
						class="flex size-8 shrink-0 items-center justify-center rounded-md"
						:class="refuses ? 'bg-warning/10' : 'bg-primary/10 text-primary'"
					>
						<UIcon name="i-ph-table" class="size-4" />
					</span>
				</template>
				<span class="flex min-w-0 flex-1 flex-col text-left">
					<span class="truncate text-highlighted">{{ destination.table.ref }}</span>
					<span class="text-xs font-normal" :class="refuses ? '' : 'text-muted'">
						{{ refuses ? 'Takes no new rows' : 'Each submit adds a row' }}
					</span>
				</span>
			</UButton>

			<UAlert
				v-if="refuses && !choosing"
				role="alert"
				color="warning"
				variant="subtle"
				icon="i-ph-warning"
			>
				<template #description>
					The API of {{ destination.table.ref }} has Create turned off, so every
					submit will be refused.
				</template>
				<template #actions>
					<UButton
						size="xs"
						color="warning"
						label="Turn Create on"
						:loading="writing"
						:disabled="writing"
						@click="turnCreateOn"
					/>
					<UBadge
						color="primary"
						variant="soft"
						size="sm"
						icon="i-ph-lightning-fill"
						label="Now"
						title="Applies now"
						class="self-center"
					/>
					<UButton
						size="xs"
						color="neutral"
						variant="link"
						label="Pick another table"
						class="ml-auto"
						@click="choosing = true"
					/>
				</template>
			</UAlert>
			<div
				v-else-if="!choosing && form.structure.value"
				class="flex items-center justify-between gap-2 text-xs text-muted"
			>
				<span>
					{{ askedCount }} of its {{ columnsLabel(form.columns.value.length) }} in
					the form
				</span>
				<UButton
					size="xs"
					variant="link"
					trailing-icon="i-ph-arrow-square-out"
					label="Open the table"
					class="px-0"
					@click="builder.openTable(destination.table.ref)"
				/>
			</div>
		</template>

		<div
			v-else-if="destination.kind === 'address'"
			class="flex flex-col gap-2.5 rounded-lg border border-accented bg-elevated p-2.5"
		>
			<div class="flex items-center gap-2.5">
				<span
					class="flex size-8 shrink-0 items-center justify-center rounded-md bg-accented text-muted"
				>
					<UIcon name="i-ph-globe-simple" class="size-4" />
				</span>
				<span class="flex min-w-0 flex-1 flex-col">
					<code class="truncate font-mono text-sm text-highlighted">
						{{ destination.method ?? 'POST' }} {{ destination.url }}
					</code>
					<span class="text-xs text-muted">An address set in the Advanced view</span>
				</span>
			</div>
			<UButton
				v-if="!choosing"
				icon="i-ph-table"
				size="xs"
				color="neutral"
				variant="outline"
				label="Save into a table instead"
				class="self-start"
				@click="choosing = true"
			/>
		</div>

		<div
			v-if="listing"
			class="flex flex-col gap-2.5 rounded-lg border bg-elevated p-3"
			:class="destination.kind === 'none' ? 'border-primary/35' : 'border-accented'"
		>
			<div v-if="destination.kind === 'none'" class="flex flex-col gap-1">
				<p class="text-sm font-semibold text-highlighted">
					Pick the table it fills
				</p>
				<p class="text-xs leading-relaxed text-muted">
					Each submit adds a row to it. Its columns become the fields — leave out
					any it shouldn't ask.
				</p>
			</div>
			<DmsBuilderTablePicker
				:model-value="table?.ref"
				:refusal="refusal"
				:columns="fillable"
				@update:model-value="choose"
			/>
			<UButton
				v-if="choosing"
				size="xs"
				color="neutral"
				variant="ghost"
				label="Cancel"
				class="self-start"
				@click="choosing = false"
			/>
		</div>

		<p v-if="destination.kind === 'none'" class="text-xs leading-relaxed text-dimmed">
			Sending somewhere else than a table? Type the address in the
			<UButton
				size="xs"
				variant="link"
				label="Advanced"
				class="p-0 align-baseline"
				@click="setMode('advanced')"
			/>
			view.
		</p>
	</div>
</template>

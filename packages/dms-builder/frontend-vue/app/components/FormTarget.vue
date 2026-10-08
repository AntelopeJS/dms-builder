<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFormBlock } from '../runtime/form-panel'
import { fillableColumns } from '../runtime/form-table'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import { columnsTaken, SHARED_TABLE_WARNING } from '../runtime/table-panel'
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
	choosing.value = false
	await form.bindTo(ref)
}

/** Written straight to the table, as its API tab would. */
function turnCreateOn(): void {
	const current = table.value
	if (!current) return
	void builder.configureResource(current.ref, servedWith(form.structure.value, 'create'))
}

</script>

<template>
	<div class="flex flex-col gap-2">
		<!-- A table picked, or none yet: the same choice every panel shows. -->
		<template v-if="destination.kind !== 'address'">
			<DmsBuilderTableChoice
				v-model:open="choosing"
				:model-value="table?.ref"
				note="Each submit adds a row"
				label="Table the form saves into"
				empty-title="Pick the table it fills"
				empty-hint="Each submit adds a row to it, with a field for each of its columns."
				:warning="refuses ? 'Takes no new rows' : undefined"
				:refusal="refusal"
				:columns="fillable"
				@update:model-value="choose"
			>
				<template #footer>
					<p
						v-if="destination.kind === 'none'"
						class="text-xs leading-relaxed text-dimmed"
					>
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
				</template>
			</DmsBuilderTableChoice>

			<template v-if="destination.kind === 'table' && !choosing">
				<UAlert
					v-if="refuses"
					role="alert"
					color="warning"
					variant="subtle"
					icon="i-ph-warning-light"
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
				<DmsBuilderTableLink
					v-else-if="form.structure.value"
					:table="destination.table.ref"
					:summary="`${columnsTaken(askedCount, form.columns.value.length)} in the form`"
					:warning="`Fields belong to the table: ${SHARED_TABLE_WARNING}`"
				/>
				<!-- The one mistake that makes every submit fail: a column the
				table will not take a row without, which the form does not ask
				for. Caught here, and by Save, before anyone fills the form in. -->
				<div
					v-for="column in form.unasked.value"
					:key="column.name"
					role="alert"
					class="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs leading-relaxed text-toned"
				>
					<span class="flex gap-2">
						<UIcon name="i-ph-warning-light" class="mt-px size-4 shrink-0 text-warning" />
						<span>
							<b class="font-semibold text-highlighted">{{ column.label ?? column.name }}</b>
							is required by {{ destination.table.ref }}: every submit fails until the
							form asks for it.
						</span>
					</span>
					<UButton
						icon="i-ph-plus-light"
						size="xs"
						color="warning"
						variant="soft"
						:label="`Add ${column.label ?? column.name}`"
						class="self-start"
						@click="form.askFor(column)"
					/>
				</div>
			</template>
		</template>

		<template v-else>
			<p class="text-sm text-muted">Sends to</p>
			<div
				class="flex flex-col gap-2.5 rounded-lg border border-accented bg-default p-2.5"
			>
				<div class="flex items-center gap-2.5">
					<span
						class="flex size-8 shrink-0 items-center justify-center rounded-md bg-accented text-muted"
					>
						<UIcon name="i-ph-globe-simple-light" class="size-4" />
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
					icon="i-ph-table-light"
					size="xs"
					color="neutral"
					variant="outline"
					label="Save into a table instead"
					class="self-start"
					@click="choosing = true"
				/>
			</div>
			<div
				v-if="choosing"
				class="flex flex-col gap-2.5 rounded-lg border border-accented bg-default p-3"
			>
				<DmsBuilderTablePicker
					:refusal="refusal"
					:columns="fillable"
					@update:model-value="choose"
				/>
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					label="Cancel"
					class="self-start"
					@click="choosing = false"
				/>
			</div>
		</template>
	</div>
</template>

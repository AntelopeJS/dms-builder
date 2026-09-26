<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBuilder } from '../runtime/session'
import { useTableBlock } from '../runtime/table-panel'
import { serves } from '../runtime/table-routes'
import type { ResourceStructure } from '../runtime/types'

/**
 * The table a table block lists. One placed a moment ago lists none yet, and
 * the tables to pick from are the first thing it shows.
 */
const props = defineProps<{ path: string }>()

const builder = useBuilder()
const session = builder.session
const table = useTableBlock(() => props.path)

/** Whether the list of tables is open over the table already listed. */
const choosing = ref(false)

const listing = computed(() => !table.table.value || choosing.value)

function refusal(structure: ResourceStructure): string | undefined {
	return serves(structure, 'list') ? undefined : "Can't list its rows"
}

async function choose(ref: string): Promise<void> {
	choosing.value = false
	await table.list(ref)
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<UButton
			v-if="table.table.value"
			color="neutral"
			variant="subtle"
			size="lg"
			block
			:trailing-icon="choosing ? 'i-ph-caret-up' : 'i-ph-caret-down'"
			:aria-expanded="choosing"
			:aria-label="`Table it lists: ${table.table.value}`"
			class="text-left aria-expanded:ring-primary"
			@click="choosing = !choosing"
		>
			<template #leading>
				<span
					class="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary"
				>
					<UIcon name="i-ph-table" class="size-4" />
				</span>
			</template>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate font-medium text-highlighted">{{ table.table.value }}</span>
				<span class="text-xs text-muted">The table it lists, a page at a time</span>
			</span>
		</UButton>

		<div
			v-if="listing"
			class="flex flex-col gap-2.5 rounded-lg border bg-elevated p-3"
			:class="table.table.value ? 'border-accented' : 'border-primary/35'"
		>
			<div v-if="!table.table.value" class="flex flex-col gap-1">
				<p class="text-sm font-semibold text-highlighted">
					Pick the table it lists
				</p>
				<p class="text-xs leading-relaxed text-muted">
					Its rows show here, a page at a time. Choose next which columns show
					and what people can do with a row.
				</p>
			</div>
			<DmsBuilderTablePicker
				:model-value="table.table.value"
				:refusal="refusal"
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

		<p v-if="!table.table.value" class="text-xs leading-relaxed text-dimmed">
			{{ session.resources.length ? 'No table fits?' : 'None to pick?' }}
			<UButton
				size="xs"
				variant="link"
				label="Create one in Tables"
				class="p-0 align-baseline"
				@click="builder.setView('resource')"
			/>
		</p>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useBuilder } from '../runtime/session'
import type { ResourceStructure } from '../runtime/types'

/**
 * The tables a block can be pointed at, to pick one from. Each is read as the
 * list opens — its columns, the routes its API serves — so one that cannot do
 * what the block needs is shown with why, rather than left out.
 */
const props = defineProps<{
	/** The table picked already, if any. */
	modelValue?: string
	/** Why a table will not do for the block, or nothing when it will. */
	refusal: (table: ResourceStructure) => string | undefined
	/** The columns a table offers the block, by default all of them. */
	columns?: (table: ResourceStructure) => number
}>()
const emit = defineEmits<{ 'update:modelValue': [ref: string] }>()

/** Past this many tables, the list takes a search. */
const SEARCH_FROM = 7

const builder = useBuilder()
const session = builder.session

onMounted(() => {
	for (const entry of session.value.resources) {
		void builder.loadResource(entry.ref)
	}
})

const items = computed(() =>
	[...session.value.resources]
		.sort((a, b) => a.ref.localeCompare(b.ref))
		.map((entry) => {
			const table = session.value.resourceStructures[entry.ref]
			const refused = table ? props.refusal(table) : undefined
			const count = table ? (props.columns?.(table) ?? table.fields.length) : undefined
			return {
				label: entry.ref,
				value: entry.ref,
				icon: 'i-ph-table',
				disabled: refused !== undefined,
				note:
					refused ??
					(count === undefined ? '' : `${count} column${count === 1 ? '' : 's'}`),
			}
		}),
)

/**
 * A click on the table already picked unselects it in the list, and still
 * means that table: the block keeps it, and whoever opened the list can close it.
 */
function pick(ref: unknown): void {
	const picked = typeof ref === 'string' ? ref : props.modelValue
	if (picked) {
		emit('update:modelValue', picked)
	}
}
</script>

<template>
	<UListbox
		:model-value="modelValue"
		:items="items"
		value-key="value"
		:filter="
			items.length >= SEARCH_FROM
				? { placeholder: 'Find a table', icon: 'i-ph-magnifying-glass' }
				: false
		"
		aria-label="Tables"
		@update:model-value="pick"
	>
		<template #item-trailing="{ item }">
			<span class="shrink-0 text-xs text-dimmed">{{ item.note }}</span>
		</template>
		<template #empty="{ searchTerm }">
			<p v-if="searchTerm" class="text-xs text-muted">No table matches.</p>
			<p v-else class="text-xs text-muted">
				No table yet.
				<UButton
					size="xs"
					variant="link"
					label="Create one in Tables"
					class="p-0 align-baseline"
					@click="builder.setView('resource')"
				/>
			</p>
		</template>
	</UListbox>
</template>

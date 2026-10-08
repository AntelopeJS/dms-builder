<script setup lang="ts">
import { computed } from 'vue'
import { useBuilder } from '../runtime/session'

/**
 * What a block takes of the table it works on, in one line, the way to the
 * table beside it, and what editing the table there does: its columns are the
 * table's, and every page using the table changes with them, at once.
 */
const props = defineProps<{
	/** The table the block works on. */
	table: string
	/** What the block takes of it: `2 of its 3 columns in the form`. */
	summary: string
	/** What changing the table changes, beyond this block. */
	warning: string
}>()

const builder = useBuilder()

/**
 * The pages a change to the table reaches, named: the scope a table setting
 * carries wherever it is shown, once the module has said.
 */
const reach = computed(() => {
	const pages = builder.readersOf(props.table)
	if (!pages) {
		return undefined
	}
	return {
		label: `${props.table} · ${pages.length} page${pages.length === 1 ? '' : 's'}`,
		names: pages.map((page) => page.displayName).join(', '),
	}
})
</script>

<template>
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between gap-2 text-xs text-muted">
			<span>{{ summary }}</span>
			<UButton
				size="xs"
				variant="link"
				trailing-icon="i-ph-arrow-square-out-light"
				label="Open the table"
				class="shrink-0 px-0"
				@click="builder.openTable(table)"
			/>
		</div>
		<p
			class="flex flex-wrap items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-toned"
		>
			<UIcon name="i-ph-info-light" class="mt-px size-3.5 shrink-0 text-warning" />
			<span class="min-w-0 flex-1">{{ warning }}</span>
			<span
				v-if="reach"
				class="shrink-0 rounded-full border border-warning/40 px-1.5 font-mono text-[10px] text-warning"
				:title="reach.names || 'No page reads it yet'"
				data-scope
			>
				{{ reach.label }}
			</span>
		</p>
	</div>
</template>

<script setup lang="ts">
import { useBuilder } from '../runtime/session'

/**
 * What a block takes of the table it works on, in one line, the way to the
 * table beside it, and what editing the table there does: its columns are the
 * table's, and every page using the table changes with them, at once.
 */
defineProps<{
	/** The table the block works on. */
	table: string
	/** What the block takes of it: `2 of its 3 columns in the form`. */
	summary: string
	/** What changing the table changes, beyond this block. */
	warning: string
}>()

const builder = useBuilder()
</script>

<template>
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between gap-2 text-xs text-muted">
			<span>{{ summary }}</span>
			<UButton
				size="xs"
				variant="link"
				trailing-icon="i-ph-arrow-square-out"
				label="Open the table"
				class="shrink-0 px-0"
				@click="builder.openTable(table)"
			/>
		</div>
		<p class="flex gap-2 rounded-md bg-warning/10 px-2.5 py-2 text-xs text-warning">
			<UIcon name="i-ph-info" class="mt-px size-3.5 shrink-0" />
			{{ warning }}
		</p>
	</div>
</template>

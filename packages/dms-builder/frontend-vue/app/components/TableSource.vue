<script setup lang="ts">
import { useTableBlock } from '../runtime/table-panel'
import { serves } from '../runtime/table-routes'
import type { ResourceStructure } from '../runtime/types'

/**
 * The table a table block lists. One placed a moment ago lists none yet, and
 * the tables to pick from are the first thing it shows.
 */
const props = defineProps<{ path: string }>()

const table = useTableBlock(() => props.path)

function refusal(structure: ResourceStructure): string | undefined {
	return serves(structure, 'list') ? undefined : "Can't list its rows"
}
</script>

<template>
	<DmsBuilderTableChoice
		:model-value="table.table.value"
		note="The table it lists, a page at a time"
		label="Table it lists"
		empty-title="Pick the table it lists"
		empty-hint="Its rows show here, a page at a time. Choose next which columns show and what people can do with a row."
		:refusal="refusal"
		@update:model-value="table.list($event)"
	/>
</template>

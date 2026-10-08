<script setup lang="ts">
import { watch } from 'vue'
import { PANEL_CARD, useFormBlock } from '../runtime/form-panel'
import { useBuilder } from '../runtime/session'

/**
 * A form, as someone building a page sets one up, in three cards: the data it
 * works on — the table it saves into, whose columns are its fields, set where
 * the table is —, what it shows on the page, and what happens once it is sent.
 * Addresses, methods and fields typed by hand are the advanced view's.
 */
const props = defineProps<{
	path: string
	/** The inspector's tab on show; every section when the panel stands alone. */
	tab?: string
}>()

/** Whether a section belongs to the tab on show. */
function shows(tab: string): boolean {
	return !props.tab || props.tab === tab
}

const builder = useBuilder()
const form = useFormBlock(() => props.path)

watch(
	() => form.table.value?.ref,
	(ref) => {
		if (ref) void builder.loadResource(ref)
	},
	{ immediate: true },
)
</script>

<template>
	<div class="flex flex-col gap-3">
		<section v-show="shows('fields')" :class="PANEL_CARD" aria-label="Data">
			<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
				<UIcon name="i-ph-table-light" class="size-4 text-primary" />
				Data
			</p>
			<DmsBuilderFormTarget :path="path" />
		</section>

		<DmsBuilderOnThePage v-show="shows('fields')" :path="path" />
		<DmsBuilderSubmitSettings v-show="shows('after')" :path="path" />
	</div>
</template>

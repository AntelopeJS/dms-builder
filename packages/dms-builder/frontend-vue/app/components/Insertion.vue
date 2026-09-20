<script setup lang="ts">
import { computed } from 'vue'
import type { DropAxis, DropEdge } from '../runtime/dropping'

/**
 * The one line that says where the block would land.
 *
 * It is drawn on the edge of the block it would come before or after, out of
 * the flow and over whatever is there: nothing on the page moves aside to make
 * room for a drop that has not happened yet.
 */
const props = defineProps<{
	edge: DropEdge
	/** How the line runs; the same block answers both ways. */
	axis: DropAxis
}>()

// The line crosses the flow it divides: a rule across a block, a bar down its
// flank. The same block now answers both ways, a quarter of it apart, so each
// line runs a little past the side it marks — perpendicular is most of the
// distinction, and overrunning the corner is what finishes it.
const HORIZONTAL_EDGES: Record<DropEdge, string> = {
	before: '-inset-x-1 -top-1 h-1',
	after: '-inset-x-1 -bottom-1 h-1',
	inside: 'inset-x-3 top-1.5 h-1',
}
const VERTICAL_EDGES: Record<DropEdge, string> = {
	before: '-inset-y-1 -left-1 w-1',
	after: '-inset-y-1 -right-1 w-1',
	inside: 'inset-y-3 left-1.5 w-1',
}
const HORIZONTAL_CAPS = [
	'-left-1 top-1/2 -translate-y-1/2',
	'-right-1 top-1/2 -translate-y-1/2',
]
const VERTICAL_CAPS = [
	'-top-1 left-1/2 -translate-x-1/2',
	'-bottom-1 left-1/2 -translate-x-1/2',
]

const sideways = computed(() => props.axis === 'vertical')
const shape = computed(
	() => (sideways.value ? VERTICAL_EDGES : HORIZONTAL_EDGES)[props.edge],
)
const caps = computed(() => (sideways.value ? VERTICAL_CAPS : HORIZONTAL_CAPS))
</script>

<template>
	<div
		class="pointer-events-none absolute z-20 rounded-full bg-primary ring-2 ring-primary/20"
		:class="shape"
		:data-drop-line="edge"
		:data-drop-axis="axis"
	>
		<span
			v-for="cap in caps"
			:key="cap"
			class="absolute size-2 rounded-full bg-primary"
			:class="cap"
		/>
	</div>
</template>

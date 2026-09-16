<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBuilder } from '../runtime/session'

const props = defineProps<{
	parent: string | null
	index: number
	label?: string
}>()

const builder = useBuilder()
const over = ref(false)

const armed = computed(() => builder.session.value.dragging !== null)

function onDrop(event: DragEvent): void {
	event.preventDefault()
	event.stopPropagation()
	over.value = false
	builder.dropAt(props.parent, props.index)
}
</script>

<template>
	<div
		v-if="armed"
		class="my-1 flex h-9 items-center justify-center rounded-md border border-dashed text-xs transition-colors"
		:class="
			over
				? 'border-primary bg-primary/10 text-primary'
				: 'border-default text-dimmed'
		"
		@dragover.prevent.stop="over = true"
		@dragleave="over = false"
		@drop="onDrop"
	>
		{{ over ? (label ?? 'Drop here') : '' }}
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { paletteGroups } from '../runtime/catalog'
import { useBuilder } from '../runtime/session'
import type { BlockTypeDescriptor } from '../runtime/types'

const builder = useBuilder()
const query = ref('')

const groups = computed(() =>
	paletteGroups(builder.session.value.catalog, query.value),
)

/** Adding from the palette drops into the selected container when there is one. */
const target = computed(() => {
	const selection = builder.session.value.selection
	const descriptor = builder.selectedDescriptor.value
	return descriptor?.container ? selection : null
})

function onDragStart(event: DragEvent, block: BlockTypeDescriptor): void {
	event.dataTransfer?.setData('text/plain', block.type)
	builder.beginDrag({ type: block.type })
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<UInput
			v-model="query"
			icon="i-ph-magnifying-glass"
			placeholder="Search a component"
			size="sm"
		/>

		<div v-for="group in groups" :key="group.id" class="flex flex-col gap-2">
			<p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
				{{ group.label }}
			</p>
			<div class="grid grid-cols-2 gap-2">
				<button
					v-for="block in group.blocks"
					:key="block.type"
					type="button"
					draggable="true"
					class="flex cursor-grab flex-col gap-1.5 rounded-lg border border-default bg-default p-2.5 text-left transition-colors hover:border-primary"
					:title="block.description"
					@dragstart="onDragStart($event, block)"
					@dragend="builder.endDrag()"
					@click="builder.addBlock(block.type, target, null)"
				>
					<UIcon
						:name="block.icon ?? 'i-ph-square'"
						class="size-4 text-dimmed"
					/>
					<span class="text-xs font-medium text-default">
						{{ block.label ?? block.type }}
					</span>
				</button>
			</div>
		</div>

		<p v-if="!groups.length" class="text-sm text-dimmed">
			No component matches “{{ query }}”.
		</p>

		<p class="rounded-md border border-default p-3 text-xs text-dimmed">
			<b class="text-default">Drag</b> a component onto the page to place it, or
			<b class="text-default">click</b> to append it
			{{ target ? 'inside the selected container' : 'to the page' }}.
		</p>
	</div>
</template>

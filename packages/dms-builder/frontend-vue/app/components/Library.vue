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

/** Adding from the palette drops into the container being worked in. */
const target = builder.paletteTarget

/** Why that container would turn a component down, per component. */
const refusals = computed(() => {
	const answers = new Map<string, string | undefined>()
	for (const group of groups.value) {
		for (const block of group.blocks) {
			answers.set(block.type, builder.refusalAt(target.value, block.type))
		}
	}
	return answers
})

function onDragStart(event: DragEvent, block: BlockTypeDescriptor): void {
	event.dataTransfer?.setData('text/plain', block.type)
	// Left unset, `dropEffect` settles on "none" and the browser refuses every
	// drop and draws the no-entry cursor, whatever the page decided. Offering
	// only what this drag does — the palette copies a block in — is what lets
	// the target answer with the same effect.
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = 'copy'
	}
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
				<!-- A component the container turns down stays draggable: the rule is
				about where it would land, and elsewhere on the page it is welcome. -->
				<button
					v-for="block in group.blocks"
					:key="block.type"
					type="button"
					draggable="true"
					class="flex cursor-grab flex-col gap-1 rounded-lg border border-default bg-default p-2.5 text-left transition-colors"
					:class="
						refusals.get(block.type) ? 'opacity-50' : 'hover:border-primary'
					"
					:aria-disabled="refusals.get(block.type) !== undefined"
					:title="refusals.get(block.type) ?? block.description"
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
					<span
						v-if="block.description"
						class="line-clamp-2 text-xs leading-snug text-dimmed"
					>
						{{ block.description }}
					</span>
					<span v-if="refusals.get(block.type)" class="text-xs text-warning">
						{{ refusals.get(block.type) }}
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
			{{ target ? `inside ${target}` : 'to the page' }}.
		</p>
	</div>
</template>

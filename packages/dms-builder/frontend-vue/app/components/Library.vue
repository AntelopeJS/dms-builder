<script setup lang="ts">
import { computed, ref } from 'vue'
import { paletteGroups, paletteIcon } from '../runtime/catalog'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import type { BlockTypeDescriptor } from '../runtime/types'

const builder = useBuilder()
const { advanced } = useBuilderMode()
const query = ref('')

const groups = computed(() =>
	paletteGroups(builder.session.value.catalog, query.value, advanced.value),
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
			<div class="grid grid-cols-3 gap-2">
				<div
					v-for="block in group.blocks"
					:key="block.type"
					class="relative flex min-w-0"
				>
					<!-- A component the container turns down stays draggable: the rule is
					about where it would land, and elsewhere on the page it is welcome. -->
					<button
						type="button"
						draggable="true"
						class="flex min-w-0 flex-1 cursor-grab flex-col items-center gap-2 rounded-lg border border-default bg-default px-1.5 pt-3 pb-2.5 transition-colors"
						:class="
							refusals.get(block.type) ? 'opacity-50' : 'hover:border-primary'
						"
						:aria-disabled="refusals.get(block.type) !== undefined"
						:title="refusals.get(block.type)"
						@dragstart="onDragStart($event, block)"
						@dragend="builder.endDrag()"
						@click="builder.addBlock(block.type, target, null)"
					>
						<span
							class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
						>
							<UIcon :name="paletteIcon(block.icon)" class="size-6" />
						</span>
						<span
							class="text-center text-xs font-medium text-balance text-default"
						>
							{{ block.label ?? block.type }}
						</span>
					</button>
					<!-- What the component is waits behind its own button, beside the
					tile rather than in it: the tile's click adds the component. -->
					<UTooltip v-if="block.description" :text="block.description">
						<button
							type="button"
							:aria-label="`About ${block.label ?? block.type}: ${block.description}`"
							class="absolute top-1 right-1 flex size-3.5 cursor-help items-center justify-center text-[10px] leading-none font-medium text-dimmed opacity-60 transition-opacity hover:opacity-100"
						>
							?
						</button>
					</UTooltip>
				</div>
			</div>
		</div>

		<p v-if="!groups.length" class="text-sm text-dimmed">
			No component matches “{{ query }}”.
		</p>
	</div>
</template>

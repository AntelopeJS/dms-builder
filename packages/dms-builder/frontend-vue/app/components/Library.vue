<script setup lang="ts">
import { computed, ref } from 'vue'
import { findNode } from '../runtime/draft'
import { lineIcon, paletteGroups } from '../runtime/catalog'
import { useBuilderMode } from '../runtime/mode'
import { blockTitle } from '../runtime/naming'
import { useBuilder } from '../runtime/session'
import type { BlockTypeDescriptor } from '../runtime/types'

/**
 * The blocks there are to add, one line each with what it is for: dragged onto
 * the page, or clicked to land where the author is working. A block the
 * container would turn down stays listed, saying why.
 */

const builder = useBuilder()
const session = builder.session
const { advanced } = useBuilderMode()
const query = ref('')

const groups = computed(() =>
	paletteGroups(session.value.catalog, query.value, advanced.value),
)

/** Adding from the palette drops into the container being worked in. */
const target = builder.paletteTarget

/** The container a click adds into, named as the page shows it. */
const targetTitle = computed(() => {
	const draft = session.value.draft
	const block = target.value && draft ? findNode(draft, target.value) : undefined
	return block ? blockTitle(block, session.value.catalog) : undefined
})

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

/**
 * From the keyboard: Enter adds the first block found below the selection,
 * Alt+Enter beside it — placing a block without dragging one.
 */
function addFound(event: KeyboardEvent): void {
	const first = groups.value
		.flatMap((group) => group.blocks)
		.find((block) => !refusals.value.get(block.type))
	if (!first) {
		return
	}
	event.preventDefault()
	builder.addNextTo(first.type, event.altKey)
	query.value = ''
}

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
	<div class="flex flex-col gap-3">
		<UInput
			v-model="query"
			icon="i-ph-magnifying-glass-light"
			placeholder="Search blocks"
			aria-label="Search blocks"
			size="sm"
			data-builder-search
			@keydown.enter="addFound"
		>
			<template #trailing>
				<UKbd value="/" size="sm" />
			</template>
		</UInput>

		<!-- A click adds into the container being worked in: said before it
		happens, with the way back to the page. -->
		<div
			v-if="targetTitle"
			class="flex items-center gap-2 rounded-md border border-(--dms-accent-line) bg-(--dms-accent-tint) py-1 pr-1 pl-2.5 text-xs text-toned"
		>
			<UIcon name="i-ph-arrow-elbow-down-right-light" class="size-3.5 shrink-0 text-primary" />
			<span class="min-w-0 flex-1 truncate">
				Adding into <b class="font-semibold text-highlighted">{{ targetTitle }}</b>
			</span>
			<UButton
				label="Page"
				size="xs"
				color="neutral"
				variant="ghost"
				title="Add to the page instead"
				@click="builder.select(null)"
			/>
		</div>

		<section v-for="group in groups" :key="group.id" class="flex flex-col gap-0.5">
			<DmsEyebrow class="mb-1 px-1.5">{{ group.label }}</DmsEyebrow>
			<!-- A component the container turns down stays draggable: the rule is
			about where it would land, and elsewhere on the page it is welcome. -->
			<button
				v-for="block in group.blocks"
				:key="block.type"
				type="button"
				draggable="true"
				class="flex w-full cursor-grab items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-elevated"
				:class="refusals.get(block.type) ? 'opacity-55' : ''"
				:aria-disabled="refusals.get(block.type) !== undefined"
				:title="refusals.get(block.type)"
				:data-palette="block.type"
				@dragstart="onDragStart($event, block)"
				@dragend="builder.endDrag()"
				@click="builder.addBlock(block.type, target, null)"
				@keydown.enter.alt.prevent="builder.addNextTo(block.type, true)"
			>
				<span
					class="grid size-7.5 shrink-0 place-items-center rounded-md border border-default bg-default text-toned"
				>
					<UIcon :name="lineIcon(block.icon)" class="size-4" />
				</span>
				<span class="min-w-0 flex-1">
					<b class="block truncate text-[13px] font-semibold text-highlighted">
						{{ block.label ?? block.type }}
					</b>
					<span
						v-if="refusals.get(block.type) || block.description"
						class="line-clamp-2 block text-[11.5px] leading-snug"
						:class="refusals.get(block.type) ? 'text-warning' : 'text-muted'"
					>
						{{ refusals.get(block.type) ?? block.description }}
					</span>
				</span>
			</button>
		</section>

		<p v-if="!groups.length" class="px-1.5 text-sm text-dimmed">
			No block matches “{{ query }}”.
		</p>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { findNode } from '../runtime/draft'
import { effectOfDrag } from '../runtime/dropping'
import { useBuilder } from '../runtime/session'
import type { BlockDraft, ComponentPreview } from '../runtime/types'

/**
 * What a container holds on the canvas: its unslotted children, and the way in
 * it keeps while it holds nothing.
 *
 * A drag aimed into it opens the room for the block among them, so the
 * children move the way they will move once it lands. An empty container has
 * nowhere to open it but in place of the way in — which is the same surface,
 * saying the other of the two things it can say.
 *
 * And the way in answers the drag itself. A region holding nothing renders no
 * block to read a pointer against, so the only box under the pointer was the
 * container's own, whose ends aim beside it: an author reaching for an empty
 * tab kept being told they meant below the tab set. This is the surface that
 * means the region, so this is what says so.
 */
interface NodeChild {
	block: BlockDraft
	path: string
	preview?: ComponentPreview
}

const props = defineProps<{
	path: string
	children: NodeChild[]
	/** Whether it holds nothing at all, children in its own slots included. */
	empty?: boolean
	/** The container's own region this list shows, when it is one of them. */
	region?: string
}>()

const builder = useBuilder()
const session = builder.session

/**
 * Where among the children shown here the room opens, and the way it runs.
 *
 * The target counts in the container's own children, slotted ones included;
 * this list is what is left once the regions have taken theirs. Counting the
 * ones that made it this far is what turns the one index into the other.
 */
const gap = computed(() => {
	const aimed = session.value.dropTarget
	if (
		!aimed ||
		aimed.refusal ||
		aimed.wrap ||
		aimed.parent !== props.path ||
		props.region !== builder.regionOf(props.path)
	) {
		return undefined
	}
	const draft = session.value.draft
	const held = draft ? (findNode(draft, props.path)?.children ?? []) : []
	const shown = new Set(props.children.map((child) => child.block))
	return {
		at: held.slice(0, aimed.index).filter((child) => shown.has(child)).length,
		axis: aimed.axis,
	}
})

function onDragOver(event: DragEvent): void {
	builder.aimInto(props.path, props.region)
	answerCursor(event)
}

/** As everywhere else: the effect has to be the gesture's, and said on entry. */
function answerCursor(event: DragEvent): void {
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = session.value.dropTarget?.refusal
			? 'none'
			: effectOfDrag(session.value.dragging)
	}
}
</script>

<template>
	<template v-for="(child, at) in children" :key="child.path">
		<DmsBuilderPlaceholder v-if="gap && gap.at === at" :axis="gap.axis" />
		<DmsBuilderNode
			:block="child.block"
			:path="child.path"
			:preview="child.preview"
		/>
	</template>
	<DmsBuilderPlaceholder
		v-if="gap && gap.at === children.length"
		:axis="gap.axis"
	/>
	<button
		v-if="empty && !gap"
		type="button"
		class="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-default p-4 text-xs text-dimmed hover:border-primary hover:text-primary"
		:data-way-in="region ?? path"
		@click.stop="builder.select(path, 'library')"
		@dragenter.prevent.stop="answerCursor"
		@dragover.prevent.stop="onDragOver"
		@drop.prevent.stop="builder.drop()"
	>
		<UIcon name="i-ph-plus" class="size-4" />
		Empty container — add a block
	</button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBuilder } from '../runtime/session'
import type { BlockDraft, ComponentPreview } from '../runtime/types'

/**
 * What a container holds on the canvas: its unslotted children, and the way in
 * it keeps while it holds nothing.
 *
 * An empty container is a hairline with no surface to aim at, so the button that
 * stands in for it is also what a drag aims at — and it stays there during the
 * drag, since nothing on the page moves to make room for a drop.
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
}>()

const builder = useBuilder()
const session = builder.session

/** The line drawn in its own frame, when that is where the drop would land. */
const aimedInside = computed(() => {
	const target = session.value.dropTarget
	const anchor = target?.anchor
	if (!target || target.refusal || anchor?.path !== props.path) {
		return undefined
	}
	return anchor.edge === 'inside' ? anchor : undefined
})
</script>

<template>
	<DmsBuilderNode
		v-for="child in children"
		:key="child.path"
		:block="child.block"
		:path="child.path"
		:preview="child.preview"
	/>
	<button
		v-if="empty"
		type="button"
		class="relative flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-default p-4 text-xs text-dimmed hover:border-primary hover:text-primary"
		@click.stop="builder.select(path, 'library')"
	>
		<DmsBuilderInsertion
			v-if="aimedInside"
			edge="inside"
			:axis="aimedInside.axis"
		/>
		<UIcon name="i-ph-plus" class="size-4" />
		Empty container — add a block
	</button>
</template>

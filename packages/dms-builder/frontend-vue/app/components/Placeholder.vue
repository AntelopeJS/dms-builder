<script setup lang="ts">
import { computed } from 'vue'
import { descriptorOf } from '../runtime/catalog'
import { draggedType, effectOfDrag, type DropAxis } from '../runtime/dropping'
import { useBuilder } from '../runtime/session'

/**
 * The room the block would take, opened where it would land.
 *
 * It is a child of the container that would receive, sitting among that
 * container's own children — so the page answers the way it lays things out:
 * a stack pushes what comes after it down, a row gives up a column and makes
 * the others narrower. What the user is looking at mid-drag is the page the
 * drop will leave behind, which a line drawn over the old one could only
 * point at.
 *
 * It opens rather than appearing: see the animation below.
 *
 * It also takes the drag itself. Once the room is open under the pointer, the
 * block it was read off has moved aside, and letting the event fall through
 * would have the container beneath answer instead: the room would close, the
 * block would come back under the pointer, and the two would trade places for
 * as long as the user held still. Answering here is what holds the aim.
 */
const props = defineProps<{
	/** The way the container fills, and so the way this opening runs in it. */
	axis: DropAxis
}>()

/** What a block the page has never rendered asks for, in pixels. */
const UNRENDERED = 48

const builder = useBuilder()
const session = builder.session

const descriptor = computed(() =>
	descriptorOf(
		session.value.catalog,
		draggedType(session.value.draft, session.value.dragging ?? {}),
	),
)
const label = computed(() => descriptor.value?.label ?? 'Block')
const sideways = computed(() => props.axis === 'vertical')
/**
 * A block already on the page keeps its own height, so the room is the size of
 * the thing that will fill it. One off the palette has never been rendered and
 * has none to keep, so it gets a size of its own.
 *
 * A number of pixels either way, never a floor: the room grows to its height
 * from nothing, and `auto` is not a height anything can grow to. A column is
 * sized by the row it opens in — that is the whole of what "a column" means
 * here — so that one asks for a floor and nothing more.
 */
const size = computed(() =>
	sideways.value
		? undefined
		: { height: `${session.value.dragging?.height || UNRENDERED}px` },
)

function answerCursor(event: DragEvent): void {
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = effectOfDrag(session.value.dragging)
	}
}
</script>

<template>
	<div
		class="flex items-center justify-center gap-1.5 overflow-hidden rounded-lg border-2 border-dashed border-primary bg-primary/5 px-2 text-xs font-medium text-primary"
		:class="
			sideways
				? 'dms-builder-room-across min-h-12 min-w-24 self-stretch'
				: 'dms-builder-room-down w-full'
		"
		:style="size"
		:data-drop-gap="axis"
		@dragenter.prevent.stop="answerCursor"
		@dragover.prevent.stop="answerCursor"
		@drop.prevent.stop="builder.drop()"
	>
		<UIcon v-if="descriptor?.icon" :name="descriptor.icon" class="size-3.5" />
		<span class="truncate">{{ label }}</span>
	</div>
</template>

<style>
/*
 * The room opens rather than appearing.
 *
 * A drag crossing from one place to the next unmounts the opening here and
 * mounts another there in the same frame, which reads as a blink and not as a
 * move. Growing the new one out of nothing is what makes the two read as one
 * opening travelling — and a keyframe with no `to` grows it to whatever the
 * block being carried asked for, which no stylesheet could know.
 *
 * Vue's own transitions would be the obvious tool and are the wrong one here:
 * they reach for `classList` on a real DOM node, and the canvas is also
 * mounted against a renderer that has none.
 */
.dms-builder-room-down {
	animation: dms-builder-room-down 130ms ease-out;
}
.dms-builder-room-across {
	animation: dms-builder-room-across 130ms ease-out;
}

@keyframes dms-builder-room-down {
	from {
		height: 0;
		opacity: 0;
	}
}

/*
 * A column is as wide as the row gives it, which is not a width to grow from:
 * this one scales into place instead, the track opening under it.
 */
@keyframes dms-builder-room-across {
	from {
		transform: scaleX(0);
		opacity: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.dms-builder-room-down,
	.dms-builder-room-across {
		animation: none;
	}
}
</style>

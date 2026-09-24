<script setup lang="ts">
import { computed } from 'vue'
import { effectOfDrag, namedHost } from '../runtime/dropping'
import { useBuilder } from '../runtime/session'

const builder = useBuilder()
const session = builder.session

const blocks = computed(() => session.value.draft?.blocks ?? [])
const page = computed(() => {
	const meta = session.value.structure?.page
	const patch = session.value.draft?.page ?? {}
	return {
		displayName: (patch.displayName as string) ?? meta?.displayName ?? '',
		description: (patch.description as string) ?? meta?.description ?? '',
		icon: (patch.icon as string) ?? meta?.icon ?? 'i-ph-file',
	}
})

/** Whether the drop would land in the page itself rather than in a container. */
const receiving = computed(() => {
	const target = session.value.dropTarget
	if (target === null) {
		return false
	}
	return (
		namedHost(session.value.catalog, session.value.draft, target.parent) === null
	)
})
/**
 * Why the drop the page would receive is turned down, if it is.
 *
 * The page is what is named whenever the container really receiving is layout
 * the editor wrote, and that is most of the page: a refusal inside a row has
 * nowhere else to be said.
 */
const refusal = computed(() =>
	receiving.value ? session.value.dropTarget?.refusal : undefined,
)
/**
 * Where among the blocks the room for the drop opens.
 *
 * The page is a container like any other and it fills downwards, so the room
 * is a band across it: what is under it moves down by exactly what the block
 * will take, and the page mid-drag is the page after the drop.
 */
const gapAt = computed(() => {
	const target = session.value.dropTarget
	if (!target || target.refusal || target.wrap || target.parent !== null) {
		return undefined
	}
	return target.index
})

/**
 * The page answers for whatever the blocks let through. Its `dropEffect` has to
 * be set here too: left alone it falls back to "none", and the browser draws a
 * no-entry cursor over the one area that accepts everything.
 */
function onDragOver(event: DragEvent): void {
	builder.aimAtPage()
	answerCursor(event)
}

/**
 * The seams between the page's own blocks answer for nothing.
 *
 * They are a gap the page draws, not a place it is offering, and they are
 * wide enough to cross: left to the surface below, every one of them took the
 * aim off the block the user was reaching for and threw it to the end of the
 * page and back, which is the blink and not a move. What is aimed at stands
 * until something that means a place says otherwise.
 */
function onDragOverSeam(event: DragEvent): void {
	answerCursor(event)
}

/** As on a block: the effect has to be the gesture's, and said on entry too. */
function answerCursor(event: DragEvent): void {
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = session.value.dropTarget?.refusal
			? 'none'
			: effectOfDrag(session.value.dragging)
	}
}
</script>

<template>
	<div
		class="flex-1 overflow-auto bg-muted/40 p-8"
		@click="builder.select(null)"
		@dragenter.prevent="answerCursor"
		@dragover.prevent="onDragOver"
		@drop.prevent="builder.drop()"
	>
		<div class="mx-auto">
			<header class="mb-8 flex items-center gap-4">
				<div
					class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					<UIcon :name="page.icon" class="size-6" />
				</div>
				<div class="min-w-0 flex-1">
					<h1 class="truncate text-xl font-semibold text-highlighted">
						{{ page.displayName }}
					</h1>
					<p class="truncate text-sm text-muted">
						{{ page.description || 'No description' }}
					</p>
				</div>
				<UButton
					icon="i-ph-pencil-simple"
					color="neutral"
					variant="ghost"
					:aria-label="'Edit page metadata'"
					@click.stop="builder.setView('page')"
				/>
			</header>

			<div
				v-if="!blocks.length"
				class="relative flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center"
				:class="receiving ? 'border-primary' : 'border-default'"
			>
				<DmsBuilderPlaceholder v-if="gapAt !== undefined" axis="horizontal" />
				<UIcon name="i-ph-stack" class="size-8 text-dimmed" />
				<p class="text-base font-medium text-default">This page is empty</p>
				<p class="max-w-sm text-sm text-muted">
					Drop a component here, or open the library to add the first block.
				</p>
				<div class="flex gap-2">
					<UButton
						label="Add a block"
						color="primary"
						@click.stop="builder.setView('library')"
					/>
					<UButton
						label="Pages and categories"
						color="neutral"
						variant="outline"
						@click.stop="builder.setView('pages')"
					/>
				</div>
			</div>

			<div
				v-else
				class="relative flex flex-col gap-6"
				@dragenter.prevent.stop="answerCursor"
				@dragover.prevent.stop="onDragOverSeam"
			>
				<!-- The page is a container like any other: when it is the one
				receiving, it says so around everything it holds. -->
				<div
					v-if="receiving"
					class="pointer-events-none absolute -inset-3 rounded-xl outline outline-2"
					:class="refusal ? 'outline-dashed outline-error' : 'outline-primary'"
				>
					<span
						class="absolute -top-5 left-0 rounded-md px-2 py-0.5 text-xs font-medium text-inverted"
						:class="refusal ? 'bg-error' : 'bg-primary'"
						data-drop-into="page"
					>
						{{ page.displayName || 'Page' }} · Page
						<span v-if="refusal" class="font-normal">· {{ refusal }}</span>
					</span>
				</div>
				<template v-for="(block, at) in blocks" :key="block.name">
					<DmsBuilderPlaceholder v-if="gapAt === at" axis="horizontal" />
					<DmsBuilderNode
						:block="block"
						:path="block.name"
						:preview="session.preview[block.name]"
					/>
				</template>
				<DmsBuilderPlaceholder
					v-if="gapAt === blocks.length"
					axis="horizontal"
				/>
				<!-- The way in at the end of the page means the end of the page,
				the way a container's own does for the container. -->
				<button
					type="button"
					class="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-default p-4 text-sm text-dimmed hover:border-primary hover:text-primary"
					data-way-in="page"
					@click.stop="builder.setView('library')"
					@dragenter.prevent.stop="answerCursor"
					@dragover.prevent.stop="onDragOver"
					@drop.prevent.stop="builder.drop()"
				>
					<UIcon name="i-ph-plus" class="size-4" />
					Add a block
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { namedHost } from '../runtime/dropping'
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
/** The page holds nothing, so the line is drawn inside its empty frame. */
const aimedInside = computed(() => {
	const anchor = session.value.dropTarget?.anchor
	return anchor?.path === null ? anchor : undefined
})

/**
 * The page answers for whatever the blocks let through. Its `dropEffect` has to
 * be set here too: left alone it falls back to "none", and the browser draws a
 * no-entry cursor over the one area that accepts everything.
 */
function onDragOver(event: DragEvent): void {
	builder.aimAtPage()
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = session.value.dropTarget?.refusal
			? 'none'
			: 'copy'
	}
}
</script>

<template>
	<div
		class="flex-1 overflow-auto bg-muted/40 p-8"
		@click="builder.select(null)"
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
				<DmsBuilderInsertion
					v-if="receiving && aimedInside"
					edge="inside"
					:axis="aimedInside.axis"
				/>
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

			<div v-else class="relative flex flex-col gap-6">
				<!-- The page is a container like any other: when it is the one
				receiving, it says so around everything it holds. -->
				<div
					v-if="receiving"
					class="pointer-events-none absolute -inset-3 rounded-xl outline outline-2 outline-primary"
					data-drop-into="page"
				>
					<span
						class="absolute -top-5 left-0 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-inverted"
					>
						{{ page.displayName || 'Page' }} · Page
					</span>
				</div>
				<DmsBuilderNode
					v-for="block in blocks"
					:key="block.name"
					:block="block"
					:path="block.name"
					:preview="session.preview[block.name]"
				/>
				<button
					type="button"
					class="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-default p-4 text-sm text-dimmed hover:border-primary hover:text-primary"
					@click.stop="builder.setView('library')"
				>
					<UIcon name="i-ph-plus" class="size-4" />
					Add a block
				</button>
			</div>
		</div>
	</div>
</template>

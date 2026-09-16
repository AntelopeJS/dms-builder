<script setup lang="ts">
import { computed } from 'vue'
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
</script>

<template>
	<div
		class="flex-1 overflow-auto bg-muted/40 p-8"
		@click="builder.select(null)"
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
				class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-default p-16 text-center"
				@dragover.prevent
				@drop.prevent="builder.dropAt(null, 0)"
			>
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

			<div v-else class="flex flex-col gap-6">
				<template v-for="(block, index) in blocks" :key="block.name">
					<DmsBuilderDropZone :parent="null" :index="index" />
					<DmsBuilderNode
						:block="block"
						:path="block.name"
						:preview="session.preview[block.name]"
					/>
				</template>
				<DmsBuilderDropZone :parent="null" :index="blocks.length" />
				<button
					v-if="!session.dragging"
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

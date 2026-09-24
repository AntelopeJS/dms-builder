<script setup lang="ts">
import { computed } from 'vue'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'

const builder = useBuilder()
const session = builder.session
const { mode, setMode } = useBuilderMode()

const problems = builder.problems
const canUndo = computed(() => session.value.history.length > 0)
const canRedo = computed(() => session.value.future.length > 0)
</script>

<template>
	<div
		class="flex flex-wrap items-center gap-2 border-b border-default bg-default px-4 py-2"
	>
		<UButton
			icon="i-ph-tree-view"
			size="xs"
			:color="
				session.view === 'pages' || session.view === 'page'
					? 'primary'
					: 'neutral'
			"
			variant="ghost"
			label="Pages"
			title="Pages and categories of the project"
			@click="builder.setView('pages')"
		/>
		<!-- The tables a page reads live beside its pages, not under a block: a
		project with none yet has no block to reach them through. -->
		<UButton
			icon="i-ph-database"
			size="xs"
			:color="session.view === 'resource' ? 'primary' : 'neutral'"
			variant="ghost"
			label="Tables"
			title="Tables of the project, their fields and their API"
			@click="builder.setView('resource')"
		/>

		<span class="vsep h-4 w-px bg-default" />

		<span class="text-xs text-dimmed">
			{{ builder.blockCount.value }} block{{
				builder.blockCount.value === 1 ? '' : 's'
			}}
		</span>

		<UBadge
			v-if="problems.length"
			color="warning"
			variant="soft"
			class="cursor-pointer"
			:label="`${problems.length} to fix`"
			icon="i-ph-warning"
			@click="builder.select(problems[0] ?? null)"
		/>
		<UBadge
			v-else-if="session.previewState === 'valid'"
			color="success"
			variant="soft"
			label="All blocks configured"
			icon="i-ph-check"
		/>
		<!-- The green badge answers for the page the module last built; until it
		has answered for the page as it now stands, this says so rather than
		vouching for a draft nobody has checked. -->
		<UBadge
			v-else
			color="neutral"
			variant="soft"
			label="Checking…"
			icon="i-ph-circle-notch"
		/>

		<div class="ml-auto flex items-center gap-1">
			<!-- Who the panel speaks to: someone building the page, or whoever
			reads the code the builder writes. -->
			<div
				class="mr-1 flex items-center rounded-md border border-default p-0.5"
				role="group"
				aria-label="Builder mode"
			>
				<UButton
					label="Simple"
					size="xs"
					:color="mode === 'simple' ? 'primary' : 'neutral'"
					:variant="mode === 'simple' ? 'soft' : 'ghost'"
					title="Only what the page shows; the builder writes the rest"
					@click="setMode('simple')"
				/>
				<UButton
					label="Advanced"
					size="xs"
					:color="mode === 'advanced' ? 'primary' : 'neutral'"
					:variant="mode === 'advanced' ? 'soft' : 'ghost'"
					title="Every setting, keys and developer notes included"
					@click="setMode('advanced')"
				/>
			</div>
			<UButton
				icon="i-ph-arrow-counter-clockwise"
				size="xs"
				color="neutral"
				variant="ghost"
				:disabled="!canUndo"
				aria-label="Undo"
				@click="builder.undo()"
			/>
			<UButton
				icon="i-ph-arrow-clockwise"
				size="xs"
				color="neutral"
				variant="ghost"
				:disabled="!canRedo"
				aria-label="Redo"
				@click="builder.redo()"
			/>
			<span
				v-if="builder.dirty.value"
				class="flex items-center gap-1.5 px-2 text-xs text-warning"
			>
				<span class="size-1.5 rounded-full bg-warning" />
				Unsaved
			</span>
			<UButton
				label="Discard"
				size="xs"
				color="neutral"
				variant="ghost"
				:disabled="!builder.dirty.value"
				@click="builder.cancel()"
			/>
			<UButton
				label="Save"
				size="xs"
				color="primary"
				:loading="session.saving"
				:disabled="!builder.dirty.value"
				@click="builder.save()"
			/>
			<UButton
				icon="i-ph-sidebar-simple"
				size="xs"
				color="neutral"
				variant="ghost"
				aria-label="Toggle the panel"
				@click="session.railOpen = !session.railOpen"
			/>
			<UButton
				icon="i-ph-x"
				size="xs"
				color="neutral"
				variant="ghost"
				aria-label="Leave the builder"
				@click="builder.leave()"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
	CANVAS_ZOOMS,
	DEVICE_LABELS,
	useCanvasView,
	type CanvasDevice,
} from '../runtime/canvas-view'
import { useBuilderMode, type BuilderMode } from '../runtime/mode'
import { saveStatus, type SaveStatusKind } from '../runtime/save-status'
import { useBuilder, type Workspace } from '../runtime/session'

const MODES: { label: string; value: BuilderMode }[] = [
	{ label: 'Simple', value: 'simple' },
	{ label: 'Developer', value: 'advanced' },
]

/** What the editor works on: the page, or what every page draws from. */
const WORKSPACES: { label: string; value: Workspace; icon: string }[] = [
	{ label: 'Page', value: 'page', icon: 'i-ph-browser-light' },
	{ label: 'Tables', value: 'tables', icon: 'i-ph-database-light' },
	{ label: 'Data', value: 'data', icon: 'i-ph-function-light' },
]

const STATUS_CLASSES: Record<SaveStatusKind, string> = {
	clean: 'border-transparent text-muted hover:bg-elevated hover:text-default',
	saved: 'border-transparent text-muted hover:bg-elevated hover:text-default',
	dirty: 'border-transparent text-toned hover:bg-elevated hover:text-default',
	saving: 'border-transparent text-primary',
	fix: 'border-warning/40 bg-warning/10 text-warning',
	error: 'border-error/40 bg-error/10 text-error',
}

const STATUS_ICON_CLASSES: Partial<Record<SaveStatusKind, string>> = {
	clean: 'text-success',
	saved: 'text-success',
	dirty: 'size-2 text-warning',
}

const DEVICE_ICONS: Record<CanvasDevice, string> = {
	desktop: 'i-ph-monitor-light',
	tablet: 'i-ph-device-tablet-light',
	phone: 'i-ph-device-mobile-light',
}

const builder = useBuilder()
const session = builder.session
const { mode, setMode } = useBuilderMode()
const view = useCanvasView()

const canUndo = computed(() => session.value.history.length > 0)
const canRedo = computed(() => session.value.future.length > 0)

const title = computed(
	() =>
		(session.value.draft?.page?.displayName as string | undefined) ??
		session.value.structure?.page.displayName ??
		'',
)

const status = computed(() =>
	saveStatus({
		saving: session.value.saving,
		dirty: builder.dirty.value,
		changes: builder.unsaved.value.length,
		problems: builder.problems.value.length,
		lastSave: session.value.lastSave,
	}),
)

/** The canvas's zoom and width, picked from one menu. */
const viewItems = computed(() => [
	CANVAS_ZOOMS.map((zoom) => ({
		label: `${zoom}%`,
		type: 'checkbox' as const,
		checked: view.zoom.value === zoom,
		onSelect: () => view.setZoom(zoom),
	})),
	(Object.keys(DEVICE_LABELS) as CanvasDevice[]).map((device) => ({
		label: DEVICE_LABELS[device],
		icon: DEVICE_ICONS[device],
		type: 'checkbox' as const,
		checked: view.device.value === device,
		onSelect: () => view.setDevice(device),
	})),
])
</script>

<template>
	<header
		class="flex h-13 min-w-0 shrink-0 items-center gap-2.5 border-b border-default bg-(--dms-bg-sidebar) pr-2.5 pl-3"
	>
		<span
			class="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-full bg-(--dms-accent-fill) pr-2.5 pl-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-(--dms-accent-on-fill) uppercase shadow-(--dms-halo-accent)"
			title="Edit mode · ⌘B"
		>
			<UIcon name="i-ph-hammer-light" class="size-3.5" />
			Editing
		</span>
		<div class="grid min-w-0 leading-tight max-lg:hidden">
			<b class="truncate text-sm font-semibold text-highlighted">{{ title }}</b>
			<span class="truncate font-mono text-[10.5px] text-dimmed">{{
				session.pageRef
			}}</span>
		</div>

		<DmsSegmented
			:model-value="session.workspace"
			:items="WORKSPACES"
			size="sm"
			aria-label="Workspace"
			class="ml-2 shrink-0"
			@update:model-value="builder.setWorkspace($event as Workspace)"
		/>

		<div class="ml-auto flex min-w-0 items-center gap-1">
			<!-- What the draft holds, always on screen, and the way into the list
			of changes: the one place to look to know the work is safe. -->
			<button
				type="button"
				class="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap"
				:class="STATUS_CLASSES[status.kind]"
				:data-status="status.kind"
				title="Open the change list"
				@click="builder.setView('changes')"
			>
				<UIcon
					:name="status.icon"
					class="size-3.5 shrink-0"
					:class="[
						STATUS_ICON_CLASSES[status.kind],
						status.kind === 'saving' ? 'animate-spin' : '',
					]"
				/>
				<span class="truncate">{{ status.label }}</span>
				<UIcon
					v-if="status.kind !== 'clean' && status.kind !== 'saving'"
					name="i-ph-caret-down"
					class="size-3 shrink-0 text-dimmed"
				/>
			</button>

			<span class="mx-1 h-4.5 w-px bg-(--ui-border)" />
			<UButton
				icon="i-ph-arrow-counter-clockwise-light"
				size="sm"
				color="neutral"
				variant="ghost"
				:disabled="!canUndo"
				aria-label="Undo"
				title="Undo · ⌘Z"
				@click="builder.undo()"
			/>
			<UButton
				icon="i-ph-arrow-clockwise-light"
				size="sm"
				color="neutral"
				variant="ghost"
				:disabled="!canRedo"
				aria-label="Redo"
				title="Redo · ⌘⇧Z"
				@click="builder.redo()"
			/>
			<span class="mx-1 h-4.5 w-px bg-(--ui-border)" />

			<UDropdownMenu :items="viewItems" :content="{ align: 'end' }">
				<UButton
					:label="view.label.value"
					:icon="DEVICE_ICONS[view.device.value]"
					trailing-icon="i-ph-caret-down"
					size="sm"
					color="neutral"
					variant="ghost"
					class="font-mono text-xs max-xl:hidden"
					aria-label="Zoom and width of the canvas"
				/>
			</UDropdownMenu>

			<!-- Who the panel speaks to: someone building the page, or whoever
			reads the code the builder writes. -->
			<DmsSegmented
				:model-value="mode"
				:items="MODES"
				size="xs"
				aria-label="Builder mode"
				class="mr-1 shrink-0"
				@update:model-value="setMode($event as BuilderMode)"
			/>
			<UButton
				icon="i-ph-floppy-disk-light"
				label="Save"
				size="sm"
				:loading="session.saving"
				:disabled="!builder.dirty.value"
				title="Save · ⌘S"
				@click="builder.save()"
			/>
			<UButton
				label="Done"
				size="sm"
				color="neutral"
				variant="outline"
				title="Leave the editor · ⌘B"
				@click="builder.leave()"
			/>
		</div>
	</header>
</template>

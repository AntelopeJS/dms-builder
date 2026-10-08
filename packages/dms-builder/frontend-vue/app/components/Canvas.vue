<script setup lang="ts">
import { computed } from 'vue'
import { DEVICE_WIDTHS, useCanvasView } from '../runtime/canvas-view'
import { effectOfDrag, namedHost } from '../runtime/dropping'
import { useBuilder, type PageLayout } from '../runtime/session'

const builder = useBuilder()
const session = builder.session
const view = useCanvasView()

/**
 * The page at the zoom and width picked in the bar. The zoom is the page's
 * own, so what it lays out at a smaller size is what it would at that width.
 */
const pageStyle = computed(() => {
	const width = DEVICE_WIDTHS[view.device.value]
	return {
		zoom: view.zoom.value === 100 ? undefined : `${view.zoom.value}%`,
		maxWidth: width ? `${width}px` : undefined,
	}
})

/** The layouts an empty page offers to start from. */
const LAYOUTS: { id: PageLayout; label: string; icon: string; description: string }[] = [
	{
		id: 'dashboard',
		label: 'Dashboard',
		icon: 'i-ph-squares-four-light',
		description: 'A period, three figures, a chart and a ranking',
	},
	{
		id: 'list',
		label: 'List',
		icon: 'i-ph-table-light',
		description: 'The rows of a table, a page at a time',
	},
	{
		id: 'form',
		label: 'Form',
		icon: 'i-ph-note-pencil-light',
		description: 'A form that adds a row',
	},
]

// The canvas's dotted ground, so the page reads as a page laid on it.
const GROUND = {
	backgroundImage:
		'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ui-text-highlighted) 7%, transparent) 1px, transparent 0)',
	backgroundSize: '18px 18px',
}

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
		class="min-w-0 overflow-auto bg-muted px-7.5 pt-6.5 pb-10"
		:style="GROUND"
		@click="builder.select(null)"
		@dragenter.prevent="answerCursor"
		@dragover.prevent="onDragOver"
		@drop.prevent="builder.drop()"
	>
		<div class="mx-auto" :style="pageStyle">
			<header class="mb-6 flex items-start gap-3">
				<span
					class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-(--dms-accent-tint) text-primary ring-1 ring-(--dms-accent-line) ring-inset"
				>
					<UIcon :name="page.icon" class="size-[19px]" />
				</span>
				<div class="min-w-0 flex-1">
					<h1 class="truncate text-xl font-semibold tracking-tight text-highlighted">
						{{ page.displayName }}
					</h1>
					<p class="truncate text-sm text-muted">
						{{ page.description || 'No description yet' }}
					</p>
				</div>
				<UButton
					icon="i-ph-sliders-horizontal-light"
					label="Page settings"
					size="xs"
					color="neutral"
					variant="ghost"
					:aria-label="'Edit page metadata'"
					@click.stop="builder.setView('page')"
				/>
			</header>

			<div
				v-if="!blocks.length"
				class="relative flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed p-16 text-center"
				:class="receiving ? 'border-primary bg-primary/5' : 'border-(--dms-border-top)'"
			>
				<DmsBuilderPlaceholder v-if="gapAt !== undefined" axis="horizontal" />
				<span
					class="grid size-10 place-items-center rounded-lg bg-elevated text-muted ring-1 ring-default ring-inset"
				>
					<UIcon name="i-ph-stack-light" class="size-5" />
				</span>
				<p class="text-base font-semibold text-highlighted">This page is empty</p>
				<p class="max-w-sm text-sm text-muted">
					Drag a block from the side rail, or start from a layout.
				</p>
				<div class="flex flex-wrap justify-center gap-2">
					<UButton
						icon="i-ph-plus-light"
						label="Add a block"
						@click.stop="builder.setView('library')"
					/>
					<UButton
						v-for="layout in LAYOUTS"
						:key="layout.id"
						:icon="layout.icon"
						:label="layout.label"
						:title="layout.description"
						color="neutral"
						variant="outline"
						@click.stop="builder.applyLayout(layout.id)"
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
						class="absolute -top-5 left-0 rounded-md px-2 py-0.5 text-xs font-medium"
						:class="
							refusal
								? 'bg-error text-inverted'
								: 'bg-(--dms-accent-fill) text-(--dms-accent-on-fill)'
						"
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
					class="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-(--dms-border-top) font-mono text-sm text-dimmed hover:border-(--dms-accent-line) hover:text-primary"
					data-way-in="page"
					@click.stop="builder.setView('library')"
					@dragenter.prevent.stop="answerCursor"
					@dragover.prevent.stop="onDragOver"
					@drop.prevent.stop="builder.drop()"
				>
					<UIcon name="i-ph-plus-light" class="size-4" />
					Drop a block, or press
					<UKbd value="/" size="sm" />
				</button>
			</div>
		</div>
	</div>
</template>

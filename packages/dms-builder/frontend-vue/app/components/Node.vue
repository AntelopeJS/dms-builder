<script setup lang="ts">
import { computed } from 'vue'
import { descriptorOf, missingConfig, servedNodeAt } from '../runtime/catalog'
import { joinPath, useBuilder } from '../runtime/session'
import type { BlockDraft, ComponentPreview } from '../runtime/types'

const props = defineProps<{
	block: BlockDraft
	path: string
	preview?: ComponentPreview
}>()

const builder = useBuilder()
const session = builder.session

const descriptor = computed(() =>
	descriptorOf(session.value.catalog, props.block.type),
)
const selected = computed(() => session.value.selection === props.path)
const hovered = computed(() => session.value.hovered === props.path)
const missing = computed(() => missingConfig(descriptor.value, props.block))
// `degraded` addresses a block the way the engine does, `<pageRef>#<path>`.
const degraded = computed(() => {
	const ref = session.value.pageRef ?? ''
	return session.value.degraded.some(
		(entry) => entry.replace(`${ref}#`, '') === props.path,
	)
})

// A block the preview stood in for renders from what the DMS served, so a table
// shows its real columns instead of a placeholder. Anything the server does not
// know — a block just added — keeps the stand-in.
const served = computed(() =>
	degraded.value ? servedNodeAt(session.value.served, props.path) : undefined,
)
const rendered = computed(() => served.value ?? props.preview)
const resolved = computed(() =>
	rendered.value ? resolveDmsComponent(rendered.value.componentName) : undefined,
)
const label = computed(
	() => descriptor.value?.label ?? props.block.type ?? 'Block',
)

const children = computed(() =>
	(props.block.children ?? []).map((child) => ({
		block: child,
		path: joinPath(props.path, child.name),
		preview: rendered.value?.children?.find((entry) => entry.id === child.name)
			?.component,
	})),
)
const slotted = computed(() => children.value.filter((child) => child.block.slot))
// A drop zone addresses `children`, the list the draft splices into, so each
// unslotted child carries the index it holds there rather than its rank among
// its unslotted peers.
const plain = computed(() =>
	children.value
		.map((child, index) => ({ ...child, index }))
		.filter((child) => !child.block.slot),
)

// The renderer sizes a grid from the spans its children declare, the same way
// the host's recursive renderer does.
const childCount = computed(() =>
	children.value.reduce(
		(total, child) => total + (Number(child.block.meta?.colSpan) || 1),
		0,
	),
)
const spanStyle = computed(() => {
	const span = Number(props.block.meta?.colSpan)
	return span > 1 ? { gridColumn: `span ${span}` } : undefined
})

const pageId = computed(() => session.value.structure?.page.id ?? '')

function onDragStart(event: DragEvent): void {
	event.dataTransfer?.setData('text/plain', props.path)
	builder.beginDrag({ path: props.path })
}
</script>

<template>
	<div
		class="relative min-w-0 rounded-lg outline-offset-4 transition-[outline-color]"
		:class="[
			// A block that renders to nothing yet — a tab set with no tabs, an
			// empty stack — would be a hairline nobody can click, and so could
			// neither be configured nor removed. Give it something to aim at
			// until it has content of its own.
			'min-h-6',
			selected ? 'outline outline-2 outline-primary' : '',
			!selected && hovered ? 'outline outline-1 outline-primary/40' : '',
			!selected && missing.length ? 'outline outline-1 outline-dashed outline-warning' : '',
		]"
		:style="spanStyle"
		draggable="true"
		@click.stop="builder.select(path)"
		@mouseenter.stop="builder.hover(path)"
		@mouseleave="builder.hover(null)"
		@dragstart.stop="onDragStart"
		@dragend="builder.endDrag()"
	>
		<div
			v-if="selected || hovered"
			class="absolute -top-6 left-0 z-10 flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-inverted"
		>
			<UIcon v-if="descriptor?.icon" :name="descriptor.icon" class="size-3" />
			<span>{{ block.name }}</span>
			<span class="opacity-70">· {{ label }}</span>
			<span v-if="served" class="opacity-70">· as saved</span>
			<UIcon
				v-if="missing.length"
				name="i-ph-warning"
				class="size-3 text-warning"
			/>
			<button
				type="button"
				class="-mr-1 ml-0.5 rounded px-1 hover:bg-inverted/10"
				aria-label="Block actions"
				@click.stop="
					builder.openMenu(
						path,
						($event.currentTarget as HTMLElement).getBoundingClientRect().left,
						($event.currentTarget as HTMLElement).getBoundingClientRect()
							.bottom + 6,
					)
				"
			>
				<UIcon name="i-ph-dots-three" class="size-3.5" />
			</button>
		</div>

		<div
			v-if="block.preserve"
			class="flex items-center gap-2 rounded-lg border border-dashed border-default bg-elevated p-4 text-sm text-dimmed"
		>
			<UIcon name="i-ph-lock-simple" class="size-4" />
			<span>{{ block.name }} — written by hand, kept as is</span>
		</div>

		<div
			v-else-if="!resolved"
			class="flex flex-col gap-1 rounded-lg border border-dashed border-default bg-elevated p-6 text-center text-sm text-dimmed"
		>
			<span class="font-medium text-default">{{ label }}</span>
			<span>{{
				missing.length
					? `Waiting on ${missing.join(', ')}`
					: 'Renders once saved — this block needs the running page'
			}}</span>
		</div>

		<DmsBuilderBoundary
			v-else
			:label="label"
			:reset-key="rendered?.options"
		>
			<component
				:is="resolved"
				v-bind="rendered?.options"
				:page-id="pageId"
				:component-id="path"
				:child-count="childCount"
			>
				<template
					v-for="child in slotted"
					:key="child.path"
					#[child.block.slot!]
				>
					<DmsBuilderNode
						:block="child.block"
						:path="child.path"
						:preview="child.preview"
					/>
				</template>
				<template #default>
					<template v-for="child in plain" :key="child.path">
						<DmsBuilderDropZone :parent="path" :index="child.index" />
						<DmsBuilderNode
							:block="child.block"
							:path="child.path"
							:preview="child.preview"
						/>
					</template>
					<DmsBuilderDropZone
						v-if="descriptor?.container"
						:parent="path"
						:index="children.length"
					/>
					<button
						v-if="descriptor?.container && !plain.length && !session.dragging"
						type="button"
						class="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-default p-4 text-xs text-dimmed hover:border-primary hover:text-primary"
						@click.stop="builder.select(path, 'library')"
					>
						<UIcon name="i-ph-plus" class="size-4" />
						Empty container — add a block
					</button>
				</template>
			</component>
		</DmsBuilderBoundary>
	</div>
</template>

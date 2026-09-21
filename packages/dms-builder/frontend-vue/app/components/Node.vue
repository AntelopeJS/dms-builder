<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import {
	descriptorOf,
	isStructural,
	missingConfig,
	servedNodeAt,
	slotsOf,
} from '../runtime/catalog'
import {
	effectOfDrag,
	isRowContainer,
	namedHost,
	spansFullWidth,
} from '../runtime/dropping'
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

/**
 * A block the preview stood in for renders from what the DMS served, so a table
 * shows its real columns instead of a placeholder.
 *
 * Only while the served node is this block, though. A page never compiled with
 * a required setting left empty, so a block that still has one was never the
 * one the server is serving — it is a block being built at a path something
 * else was saved at, and rendering what was saved there shows an author
 * content their draft no longer holds. Looking the path up is what could not
 * tell the two apart: re-adding a block under the name of the one it replaced
 * finds the old one every time.
 */
const served = computed(() =>
	degraded.value && !missing.value.length
		? servedNodeAt(session.value.served, props.path)
		: undefined,
)
const rendered = computed(() => served.value ?? props.preview)
const resolved = computed(() =>
	rendered.value ? resolveDmsComponent(rendered.value.componentName) : undefined,
)
const label = computed(
	() => descriptor.value?.label ?? props.block.type ?? 'Block',
)
const standInNote = computed(() =>
	missing.value.length
		? `Waiting on ${missing.value.join(', ')}`
		: 'Renders once saved — this block needs the running page',
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
const plain = computed(() => children.value.filter((child) => !child.block.slot))
/**
 * The region the rendered block is showing, reported as it changes.
 *
 * A tab set is the one container that hides part of what it holds, and it is
 * the only thing that knows which part: it exposes the tab it has open, as an
 * index into the regions its own options declare. Without this the editor would
 * go on dropping into the first tab while the author is looking at another.
 */
const instance = ref<{ activeTab?: string } | null>(null)
watchEffect(() => {
	const open = instance.value?.activeTab
	if (open === undefined) {
		return
	}
	const region = slotsOf(descriptor.value, props.block)[Number(open)]
	if (region) {
		builder.openRegion(props.path, region.id)
	}
})

/**
 * The regions the block declares, each with what is attached to it.
 *
 * A stand-in has to answer for them itself: a container the preview has not
 * built lays no slotted child out at all, and a block just attached to a tab
 * would be missing from the canvas until the page compiles again — which is
 * exactly when a tab set stands in for itself.
 */
const regions = computed(() =>
	slotsOf(descriptor.value, props.block).map((slot) => ({
		...slot,
		children: slotted.value.filter((child) => child.block.slot === slot.id),
	})),
)
/** Whether this block lays its own children out side by side. */
const inner = computed(() => isRowContainer(props.block.type))
/** Whether the editor wrote this block itself, rather than the user placing it. */
const structural = computed(() =>
	isStructural(session.value.catalog, props.block.type),
)

const dragging = computed(() => session.value.dragging !== null)
const target = computed(() => session.value.dropTarget)
/**
 * Whether the block being dragged would land in this one, as far as the user is
 * concerned: a row it would really land in belongs to the grid that wrote it,
 * and the grid is what the user put on the page.
 */
const receiving = computed(() => {
	const aimed = target.value
	if (!aimed) {
		return false
	}
	return (
		namedHost(session.value.catalog, session.value.draft, aimed.parent) ===
		props.path
	)
})
const refused = computed(() => target.value?.refusal !== undefined)
/**
 * Which of its own edges carries the insertion line, and the way it runs.
 *
 * A refused target draws no line: the border and its reason are the whole
 * answer, and a line would say the drop is going to happen.
 */
const edgeLine = computed(() => {
	const anchor = refused.value ? undefined : target.value?.anchor
	if (!anchor || anchor.path !== props.path || anchor.edge === 'inside') {
		return undefined
	}
	return anchor
})

/**
 * What the block's own border says, in the order the states matter: where a drop
 * would land first, then what is selected, then what the pointer is over.
 *
 * Nothing else is drawn during a drag — an outline left over from before it
 * would compete with the one target the user is aiming at.
 */
const frame = computed(() => {
	if (receiving.value) {
		// Dashed, so a refusal reads as one at a glance rather than as a target
		// drawn in another colour.
		return refused.value
			? 'outline outline-2 outline-dashed outline-error'
			: 'outline outline-2 outline-primary'
	}
	if (selected.value) {
		return 'outline outline-2 outline-primary'
	}
	if (dragging.value) {
		return ''
	}
	if (hovered.value) {
		return 'outline outline-1 outline-primary/40'
	}
	return missing.value.length
		? 'outline outline-1 outline-dashed outline-warning'
		: ''
})

// The renderer sizes a grid from the spans its children declare, the same way
// the host's recursive renderer does.
const childCount = computed(() =>
	children.value.reduce(
		(total, child) => total + (Number(child.block.meta?.colSpan) || 1),
		0,
	),
)
/**
 * Placement the wrapper has to carry itself. The canvas wraps every block in a
 * div of its own for selection and outlines, so that div — not the block — is
 * what a grid lays out; a row's own `1 / -1` then applies inside the wrapper
 * and the row ends up squeezed into a single column.
 */
const spanStyle = computed(() => {
	if (spansFullWidth(props.block.type)) {
		return { gridColumn: '1 / -1' }
	}
	const span = Number(props.block.meta?.colSpan)
	return span > 1 ? { gridColumn: `span ${span}` } : undefined
})

const pageId = computed(() => session.value.structure?.page.id ?? '')
const filepath = computed(() => session.value.structure?.page.filepath)
// The engine words a reason as a lower-case fragment; here it opens a sentence.
const opaqueReason = computed(() => {
	const reason = props.block.opaqueReason
	return reason
		? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`
		: undefined
})

function onDragStart(event: DragEvent): void {
	event.dataTransfer?.setData('text/plain', props.path)
	// See Library.vue: without an allowed effect the browser turns every drop
	// down before the page is asked. This one is a move, and saying `copyMove`
	// while the target answered `copy` had it drawing a copy that never happens.
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = 'move'
	}
	builder.beginDrag({ path: props.path })
}

/**
 * Read the pointer against the block it is over, on both axes.
 *
 * What each axis means is the module's to decide from the page's own shape — a
 * cell of a row answers on all four of its sides, a block the page stacks only
 * above and below — so the same gesture has to carry both. The innermost block
 * under the pointer is the one that answers, hence the stopped propagation on
 * the template's handler.
 */
function onDragOver(event: DragEvent): void {
	const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
	builder.aimAt(props.path, {
		x: { start: box.left, size: box.width, at: event.clientX },
		y: { start: box.top, size: box.height, at: event.clientY },
	})
	answerCursor(event)
}

/**
 * The cursor is the only refusal an author sees before letting go, so it has to
 * say what the aim just decided rather than the browser's default — and it has
 * to say it on `dragenter` too, which is where the browser first decides what
 * to draw over an element it has just moved onto.
 */
function answerCursor(event: DragEvent): void {
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = refused.value
			? 'none'
			: effectOfDrag(session.value.dragging)
	}
}
</script>

<template>
	<!-- Laid out as a grid of one cell, for the same reason `spanStyle` exists:
	a row makes its cells as tall as the tallest, and what it stretches is this
	wrapper. The block inside would keep its own height and sit in a box it does
	not fill — a page the canvas shows and the page itself never renders. -->
	<div
		class="relative grid min-w-0 rounded-lg outline-offset-4 transition-[outline-color]"
		:class="[
			// A block that renders to nothing yet — a tab set with no tabs, an
			// empty stack — would be a hairline nobody can click, and so could
			// neither be configured nor removed. Give it something to aim at
			// until it has content of its own.
			'min-h-6',
			frame,
		]"
		:style="spanStyle"
		:data-path="path"
		draggable="true"
		@click.stop="builder.select(path)"
		@mouseenter.stop="builder.hover(path)"
		@mouseleave="builder.hover(null)"
		@dragstart.stop="onDragStart"
		@dragend="builder.endDrag()"
		@dragenter.prevent.stop="answerCursor"
		@dragover.prevent.stop="onDragOver"
		@drop.prevent.stop="builder.drop()"
	>
		<DmsBuilderInsertion
			v-if="edgeLine"
			:edge="edgeLine.edge"
			:axis="edgeLine.axis"
		/>

		<!-- What is being aimed at, named: which container receives, and why it
		would not. -->
		<div
			v-if="receiving"
			class="absolute -top-6 left-0 z-20 flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium text-inverted"
			:class="refused ? 'bg-error' : 'bg-primary'"
			:data-drop-into="path"
		>
			<UIcon v-if="descriptor?.icon" :name="descriptor.icon" class="size-3" />
			<span>{{ block.name }}</span>
			<span class="opacity-70">· {{ label }}</span>
			<span v-if="target?.refusal" class="font-normal">
				· {{ target.refusal }}
			</span>
		</div>

		<div
			v-if="(selected || hovered) && !dragging"
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
			class="flex flex-col gap-1 rounded-lg border border-dashed border-default bg-elevated p-4 text-sm text-dimmed"
		>
			<div class="flex items-center gap-2">
				<UIcon name="i-ph-lock-simple" class="size-4" />
				<span>{{ block.name }} — written by hand, kept as is</span>
			</div>
			<p class="text-xs">
				<span v-if="opaqueReason">{{ opaqueReason }} </span>
				<template v-if="filepath">
					Edit it in <code class="text-xs">{{ filepath }}</code>.
				</template>
			</p>
		</div>

		<!-- Structure the editor wrote for itself stands in as nothing but what
		it holds, laid out the way it lays it out: naming it would teach the user
		the one word the gesture that built it exists to spare them. -->
		<div
			v-else-if="!resolved && structural"
			class="flex gap-2"
			:class="inner ? 'flex-row' : 'flex-col'"
		>
			<DmsBuilderChildren
				:path="path"
				:children="plain"
				:empty="!children.length"
			/>
		</div>

		<!-- A container the preview has not answered for yet — a stack just
		added — still has to be fillable, so it stands in for itself and keeps
		holding its children. -->
		<div
			v-else-if="!resolved && descriptor?.container"
			class="flex flex-col gap-2 rounded-lg border border-dashed border-default bg-elevated p-4"
		>
			<span class="text-xs text-dimmed">
				<span class="font-medium text-default">{{ label }}</span>
				— {{ standInNote }}
			</span>
			<div class="flex flex-col gap-2">
				<!-- Named, so the tabs of a set the preview cannot build are told
				apart by what the author called them. -->
				<div
					v-for="region in regions"
					:key="region.id"
					class="flex flex-col gap-1"
					:data-region="region.id"
				>
					<span class="text-xs font-medium text-dimmed">{{ region.label }}</span>
					<DmsBuilderChildren :path="path" :children="region.children" />
				</div>
				<DmsBuilderChildren
					:path="path"
					:children="plain"
					:empty="!children.length"
				/>
			</div>
		</div>

		<div
			v-else-if="!resolved"
			class="flex flex-col gap-1 rounded-lg border border-dashed border-default bg-elevated p-6 text-center text-sm text-dimmed"
		>
			<span class="font-medium text-default">{{ label }}</span>
			<span>{{ standInNote }}</span>
		</div>

		<DmsBuilderBoundary v-else :label="label" :reset-key="rendered?.options">
			<!-- A DMS component may await in its own setup — a form asks for its
			values before it can render a field, a table for its rows — and Vue
			refuses to mount an async setup that has no Suspense above it: it warns
			once per render and mounts nothing, which takes the editor down with
			it. A page is rendered inside one; the canvas renders the same
			components itself, so it carries its own. -->
			<Suspense>
				<component
					:is="resolved"
					ref="instance"
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
						<DmsBuilderChildren
							:path="path"
							:children="plain"
							:empty="descriptor?.container === true && !children.length"
						/>
					</template>
				</component>
			</Suspense>
		</DmsBuilderBoundary>
	</div>
</template>

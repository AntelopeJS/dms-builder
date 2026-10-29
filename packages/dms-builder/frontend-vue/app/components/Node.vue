<script setup lang="ts">
import { ref } from 'vue'
import { roomStyle } from '../runtime/canvas-options'
import type { BlockDraft, ComponentPreview } from '../runtime/types'
import { type Props, LIVE_STATES } from '../build/Node'
import { useNodePart1 } from '../build/NodePart1'
import { useNodePart2 } from '../build/NodePart2'

const props = defineProps<Props>()
const nodePart1 = useNodePart1({ props })
const { builder, descriptor, advanced, title, selected, hovered, missing, served, rendered, live, resolved, options, sourceKey, room, label, standInNote, children, held, plain, instance, regions, bodyEmpty, inner, structural, dragging, target, receiving, refused, wrapGap } = nodePart1
const nodePart2 = useNodePart2({ props, ...nodePart1 })
const { wrapAxis, onClick, onFocus, onMouseEnter, lifted, frame, childCount, spanStyle, pageId, veil, veilLabel, veilDetail, onDragStart, onDragOver, answerCursor } = nodePart2
</script>

<template>
	<!-- Laid out as a grid of one cell, for the same reason `spanStyle` exists:
	a row makes its cells as tall as the tallest, and what it stretches is this
	wrapper. The block inside would keep its own height and sit in a box it does
	not fill — a page the canvas shows and the page itself never renders. -->
	<!-- The frame is drawn inside the block: two blocks a container stacks with
	no room between them — the blocks of a tab — would otherwise have the one
	selected drawn over the edge of the next, which reads as an overlap. -->
	<div
		class="relative grid min-w-0 rounded-lg -outline-offset-2 transition-[outline-color] focus-visible:outline-2 focus-visible:outline-primary"
		:class="[
			// A block that renders to nothing yet — a tab set with no tabs, an
			// empty stack — would be a hairline nobody can click, and so could
			// neither be configured nor removed. Give it something to aim at
			// until it has content of its own. Structure is not something to
			// aim at: holding nothing, it is gone on the next edit.
			structural ? '' : 'min-h-6',
			// Room opened above or below it is a second row of this grid, and
			// the two want telling apart; room opened beside it is a second
			// column, as wide as the block.
			wrapGap ? 'gap-2' : '',
			wrapGap && wrapAxis === 'vertical' ? 'grid-flow-col auto-cols-fr' : '',
			// The block is on the pointer; what is left here is the hole it
			// came out of, which the drop is about to fill from somewhere else.
			lifted ? 'opacity-40' : '',
			room
				? 'bg-[repeating-linear-gradient(-45deg,transparent_0_6px,var(--ui-border-accented)_6px_7px)]'
				: '',
			frame,
		]"
		:style="[spanStyle, roomStyle(block.type, options)]"
		:data-path="path"
		:draggable="!structural"
		:tabindex="structural ? undefined : 0"
		:role="structural ? undefined : 'group'"
		:aria-label="structural ? undefined : `${title} · ${label}`"
		@click="onClick"
		@focus="onFocus"
		@mouseenter="onMouseEnter"
		@mouseleave="builder.hover(null)"
		@dragstart.stop="onDragStart"
		@dragend="builder.endDrag()"
		@dragenter.prevent.stop="answerCursor"
		@dragover.prevent.stop="onDragOver"
		@drop.prevent.stop="builder.drop()"
	>
		<!-- What is being aimed at, named: which container receives, and why it
		would not. -->
		<div
			v-if="receiving"
			class="absolute -top-6 left-0 z-20 flex h-5.5 items-center gap-1 whitespace-nowrap rounded-[6px_6px_6px_2px] px-2 text-[11px] font-semibold shadow-sm"
			:class="refused ? 'bg-error text-inverted' : 'bg-(--dms-accent-fill) text-(--dms-accent-on-fill)'"
			:data-drop-into="path"
		>
			<UIcon v-if="descriptor?.icon" :name="descriptor.icon" class="size-3" />
			<span>{{ title }}</span>
			<span v-if="title !== label" class="font-mono text-[10.5px] font-medium opacity-70">{{
				label
			}}</span>
			<span v-if="target?.refusal" class="font-normal">
				· {{ target.refusal }}
			</span>
		</div>

		<div
			v-if="(selected || hovered) && !dragging"
			class="absolute -top-6 left-0 z-10 flex h-5.5 items-center gap-1 rounded-[6px_6px_6px_2px] pr-0.5 pl-2 text-[11px] font-semibold whitespace-nowrap shadow-sm"
			:class="
				selected
					? 'bg-(--dms-accent-fill) text-(--dms-accent-on-fill)'
					: 'border border-(--dms-accent-line) bg-elevated text-toned'
			"
		>
			<UIcon v-if="descriptor?.icon" :name="descriptor.icon" class="size-3" />
			<span>{{ title }}</span>
			<span v-if="advanced" class="font-mono text-[10.5px] font-medium opacity-70">
				#{{ block.name }}
			</span>
			<!-- A block the builder cannot rewrite carries no type in the draft,
			so its label would only say "Block". -->
			<template v-if="block.preserve">
				<span class="opacity-70">·</span>
				<UIcon name="i-ph-lock-simple-light" class="size-3 opacity-70" />
				<span class="opacity-70">set up in code</span>
			</template>
			<template v-else>
				<span v-if="title !== label" class="font-mono text-[10.5px] font-medium opacity-70">{{
					label
				}}</span>
				<span v-if="served" class="font-mono text-[10.5px] font-medium opacity-70">· as saved</span>
			</template>
			<UIcon
				v-if="missing.length"
				name="i-ph-warning-light"
				class="size-3 text-warning"
			/>
			<button
				type="button"
				class="ml-0.5 grid h-4.5 w-5 place-items-center rounded bg-current/10 hover:bg-current/20"
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
				<UIcon name="i-ph-dots-three-light" class="size-3.5" />
			</button>
		</div>

		<DmsBuilderPlaceholder v-if="wrapGap === 'before'" :axis="wrapAxis" />

		<!-- Said for whoever is building the page: why the code cannot be
		rewritten, and where it lives, are for the panel's developer notes. -->
		<div
			v-if="block.preserve && !resolved"
			class="flex items-center gap-2 rounded-lg border border-dashed border-default bg-elevated p-4 text-sm text-dimmed"
		>
			<UIcon name="i-ph-lock-simple-light" class="size-4" />
			<span>{{ block.name }} is set up in code and can't be changed here</span>
		</div>

		<div v-else-if="live" class="flex items-center gap-2 py-1" data-live-stand-in>
			<DmsSegmented
				model-value="live"
				:items="LIVE_STATES"
				size="xs"
				aria-label="Live or paused"
				class="pointer-events-none"
			/>
			<span class="text-xs text-dimmed">updated just now</span>
		</div>

		<!-- Structure the editor wrote for itself stands in as nothing but what
		it holds, laid out the way it lays it out: naming it would teach the user
		the one word the gesture that built it exists to spare them. -->
		<div
			v-else-if="!resolved && structural"
			class="flex gap-2"
			:class="inner ? 'flex-row' : 'flex-col'"
		>
			<!-- No way in: structure holding nothing is removed on the next edit,
			and a box offering to be filled would be the one thing it shows. -->
			<DmsBuilderChildren :path="path" :children="plain" />
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
					<DmsBuilderChildren
						:path="path"
						:children="region.children"
						:empty="!region.children.length"
						:region="region.id"
					/>
				</div>
				<DmsBuilderChildren
					:path="path"
					:children="plain"
					:empty="bodyEmpty"
				/>
			</div>
		</div>

		<div
			v-else-if="!resolved"
			class="flex flex-col items-center gap-1 rounded-lg border-[1.5px] border-dashed p-6 text-center text-sm"
			:class="
				missing.length
					? 'border-warning/50 bg-warning/5 text-muted'
					: 'border-default bg-elevated text-dimmed'
			"
		>
			<span class="font-medium text-default">{{ label }}</span>
			<span>{{ standInNote }}</span>
			<!-- What it waits on is a click away: the settings it lacks. -->
			<UButton
				v-if="missing.length"
				label="Fill it in"
				size="xs"
				color="warning"
				variant="soft"
				class="mt-1"
				@click.stop="builder.select(path)"
			/>
		</div>

		<DmsBuilderBoundary v-else :label="label" :reset-key="options">
			<!-- A DMS component may await in its own setup — a form asks for its
			values before it can render a field, a table for its rows — and Vue
			refuses to mount an async setup that has no Suspense above it: it warns
			once per render and mounts nothing, which takes the editor down with
			it. A page is rendered inside one; the canvas renders the same
			components itself, so it carries its own. -->
			<Suspense>
				<component
					:is="resolved"
					:key="sourceKey"
					ref="instance"
					v-bind="options"
					:page-id="pageId"
					:component-id="path"
					:child-count="childCount"
				>
					<template v-for="region in regions" :key="region.id" #[region.id]>
						<DmsBuilderChildren
							:path="path"
							:children="region.children"
							:empty="!region.children.length"
							:region="region.id"
							:label="region.label"
						/>
					</template>
					<template #default>
						<!-- Keyed on what it draws: a chart switched from columns to a pie in
						place keeps the one colour its single series had, where the page,
						drawing it afresh, gives each slice its own. -->
						<DmsRecursiveComponent
							v-for="child in held"
							:key="`${child.id}:${JSON.stringify(child.options)}`"
							:component="child"
							:page-id="pageId"
							:component-id="`${path}-child-${child.id}`"
						/>
						<DmsBuilderChildren
							:path="path"
							:children="plain"
							:empty="!structural && descriptor?.container === true && bodyEmpty"
						/>
					</template>
				</component>
			</Suspense>
		</DmsBuilderBoundary>

		<DmsBuilderPlaceholder v-if="wrapGap === 'after'" :axis="wrapAxis" />

		<template v-if="veil">
			<div
				v-if="veil.state === 'hidden'"
				class="pointer-events-none absolute inset-0 z-[5] rounded-[inherit] bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-bg)_84%,transparent)_0_10px,color-mix(in_srgb,var(--ui-bg)_70%,transparent)_10px_20px)] backdrop-blur-[3px]"
				data-veil="hidden"
			/>
			<UTooltip :text="veilDetail" :disabled="!veilDetail">
				<span
					class="absolute z-[6] inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10.5px] font-[650] tracking-[0.08em] whitespace-nowrap uppercase backdrop-blur-md"
					:class="
						veil.state === 'hidden'
							? 'pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-(--dms-error-line) bg-(--dms-error-tint) text-error'
							: '-top-3 right-4 border-(--dms-warning-line) text-warning [background:linear-gradient(var(--dms-warning-tint),var(--dms-warning-tint)),var(--ui-bg)]'
					"
					role="status"
					:tabindex="veilDetail ? 0 : undefined"
					:data-veil-badge="veil.state"
				>
					<UIcon
						:name="veil.state === 'hidden' ? 'i-ph-lock-simple' : 'i-ph-eye'"
						class="size-[13px] shrink-0"
					/>
					{{ veilLabel }}
				</span>
			</UTooltip>
		</template>
	</div>
</template>

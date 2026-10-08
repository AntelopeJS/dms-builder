<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBlockPanel } from '../runtime/block-panel'
import { descriptorOf, shownRegion } from '../runtime/catalog'
import { THEME_COLORS } from '../runtime/constants'
import { findNode } from '../runtime/draft'
import { PANEL_CARD } from '../runtime/form-panel'
import { useBuilder } from '../runtime/session'
import {
	addTab,
	blocksLabel,
	duplicateTab,
	moveTab,
	patchTab,
	removeTab,
	tabLines,
	TABS_DEFAULTS,
	type TabLine,
} from '../runtime/tabs-panel'
import type { BlockDraft, DynamicSlots } from '../runtime/types'

/**
 * A tab set, as someone building a page sets one up: its tabs one line each —
 * an icon, a name, what it holds — the one open on the canvas opened here too,
 * with its badge and whether it can be opened; then how the set looks, a line
 * per setting. Shortcuts, avatars and what a hidden tab keeps are the advanced
 * view's.
 */
const props = defineProps<{ path: string }>()

const { block, config, options, has, text, write } = useBlockPanel(() => props.path)
const builder = useBuilder()
const session = builder.session

const descriptor = computed(() => descriptorOf(session.value.catalog, block.value?.type))
const dynamic = computed(() => descriptor.value?.dynamicSlots)
const tabs = computed(() => tabLines(block.value, dynamic.value))

/** The tab on the canvas, which is the one whose details are open here. */
const open = computed(
	() =>
		shownRegion(descriptor.value, block.value, session.value.openRegions[props.path])?.id,
)

function show(id: string): void {
	builder.openRegion(props.path, id)
}

/** One edit of the tab set, its tabs and the blocks they hold together. */
function edit(apply: (block: BlockDraft, dynamic: DynamicSlots) => void): void {
	const slots = dynamic.value
	if (!slots) {
		return
	}
	builder.mutate((draft) => {
		const node = findNode(draft, props.path)
		if (node) {
			apply(node, slots)
		}
	})
}

function patch(id: string, values: Record<string, unknown>): void {
	edit((node, slots) => patchTab(node, slots, id, values))
}

function rename(tab: TabLine, label: string): void {
	const key = dynamic.value?.labelKey
	if (key) {
		patch(tab.id, { [key]: label })
	}
}

function add(): void {
	let added: string | undefined
	edit((node, slots) => {
		added = addTab(node, slots)
	})
	if (added) {
		show(added)
	}
}

function duplicate(tab: TabLine): void {
	let copy: string | undefined
	edit((node, slots) => {
		copy = duplicateTab(node, slots, tab.id)
	})
	if (copy) {
		show(copy)
		builder.notify('Tab duplicated')
	}
}

function remove(tab: TabLine): void {
	const at = tabs.value.findIndex((line) => line.id === tab.id)
	const neighbour = tabs.value[at + 1] ?? tabs.value[at - 1]
	// Read before it goes: once it has, the first tab answers for the open one.
	const wasOpen = open.value === tab.id
	edit((node, slots) => {
		removeTab(node, slots, tab.id)
	})
	if (neighbour && wasOpen) {
		show(neighbour.id)
	}
	builder.notify('Tab deleted')
}

function actions(tab: TabLine) {
	return [
		[{ label: 'Duplicate', icon: 'i-ph-copy', onSelect: () => duplicate(tab) }],
		[
			{
				label: 'Delete',
				icon: 'i-ph-trash',
				color: 'error' as const,
				// A tab set keeps one tab: without any, it has nowhere to show a block.
				disabled: tabs.value.length === 1,
				onSelect: () => remove(tab),
			},
		],
	]
}

/* ---- their order, by dragging a tab by its handle ------------------------ */

const dragged = ref<string | null>(null)
const over = ref<string | null>(null)

function startDrag(tab: TabLine, event: DragEvent): void {
	dragged.value = tab.id
	event.dataTransfer?.setData('text/plain', tab.label)
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = 'move'
	}
}

function endDrag(): void {
	dragged.value = null
	over.value = null
}

function dropOn(tab: TabLine): void {
	const id = dragged.value
	endDrag()
	if (id && id !== tab.id) {
		edit((node, slots) => moveTab(node, slots, id, tab.id))
	}
}

/** Where a tab dropped on this one would land: the line drawn above or below. */
function landing(tab: TabLine): 'before' | 'after' | undefined {
	if (!dragged.value || over.value !== tab.id || dragged.value === tab.id) {
		return undefined
	}
	const from = tabs.value.findIndex((line) => line.id === dragged.value)
	const to = tabs.value.findIndex((line) => line.id === tab.id)
	return from < to ? 'after' : 'before'
}

/** The handle moves its tab with the arrow keys as well. */
function nudge(tab: TabLine, delta: number): void {
	const at = tabs.value.findIndex((line) => line.id === tab.id)
	const onto = tabs.value[at + delta]
	if (onto) {
		edit((node, slots) => moveTab(node, slots, tab.id, onto.id))
	}
}

/* ---- how it looks ------------------------------------------------------- */

const LOOK_LABELS: Record<string, string> = {
	pill: 'Pill',
	link: 'Link',
	horizontal: 'Horizontal',
	vertical: 'Vertical',
	xs: 'XS',
	sm: 'S',
	md: 'M',
	lg: 'L',
	xl: 'XL',
}

const LOOK = [
	{ key: 'variant', label: 'Style' },
	{ key: 'orientation', label: 'Direction' },
	{ key: 'size', label: 'Size' },
] as const

function choices(key: string): Array<{ value: string; label: string }> {
	return (options.value[key]?.enum ?? []).map((value) => ({
		value: String(value),
		label: LOOK_LABELS[String(value)] ?? String(value),
	}))
}

function chosen(key: string): string {
	return text(key) || TABS_DEFAULTS[key] || ''
}

const colours = computed(() => {
	const offered = options.value.color?.enum?.map(String)
	return THEME_COLORS.filter((colour) => !offered || offered.includes(colour)).map(
		(colour) => ({
			value: colour,
			label: colour.charAt(0).toUpperCase() + colour.slice(1),
			chip: { color: colour },
		}),
	)
})
</script>

<template>
	<div class="flex flex-col gap-3">
		<section :class="PANEL_CARD" aria-label="Tabs">
			<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
				<UIcon name="i-ph-tabs-light" class="size-4 text-primary" />
				Tabs
				<span
					class="rounded-full bg-accented px-1.75 text-[11px]/[18px] font-medium text-muted"
				>
					{{ tabs.length }}
				</span>
			</p>

			<div
				v-if="tabs.length"
				role="list"
				aria-label="The tabs"
				class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-default bg-default"
			>
				<div
					v-for="tab in tabs"
					:key="tab.id"
					role="listitem"
					class="flex flex-col"
					:class="[
						tab.id === open ? 'bg-primary/7' : '',
						landing(tab) === 'before' ? 'shadow-[inset_0_2px_0_var(--ui-primary)]' : '',
						landing(tab) === 'after' ? 'shadow-[inset_0_-2px_0_var(--ui-primary)]' : '',
					]"
					@click="show(tab.id)"
					@dragover.prevent="over = tab.id"
					@drop.prevent="dropOn(tab)"
				>
					<div class="flex h-11 items-center gap-1.5 pr-1.5 pl-1">
						<button
							type="button"
							draggable="true"
							class="flex cursor-grab rounded p-0.5 text-dimmed hover:text-default"
							:aria-label="`Drag ${tab.label} to reorder`"
							@dragstart="startDrag(tab, $event)"
							@dragend="endDrag"
							@keydown.up.prevent.stop="nudge(tab, -1)"
							@keydown.down.prevent.stop="nudge(tab, 1)"
						>
							<UIcon name="i-ph-dots-six-vertical-light" class="size-3.5" />
						</button>
						<DmsBuilderIconPicker
							:model-value="tab.icon"
							fallback="i-ph-image"
							size="sm"
							:label="`Icon of ${tab.label}`"
							@update:model-value="patch(tab.id, { icon: $event })"
						/>
						<UInput
							:model-value="tab.label"
							size="sm"
							:variant="tab.id === open ? 'outline' : 'ghost'"
							class="min-w-0 flex-1"
							:aria-label="`Name of ${tab.label || 'the tab'}`"
							@focus="show(tab.id)"
							@update:model-value="rename(tab, String($event))"
						/>
						<span
							v-if="tab.badge"
							class="shrink-0 rounded-full bg-primary/14 px-1.75 text-[11px]/[18px] font-medium text-primary"
						>
							{{ tab.badge }}
						</span>
						<span class="shrink-0 text-xs text-dimmed">{{ blocksLabel(tab.blocks) }}</span>
						<UDropdownMenu :items="actions(tab)" :content="{ align: 'end' }">
							<UButton
								icon="i-ph-dots-three-light"
								size="xs"
								color="neutral"
								variant="ghost"
								:aria-label="`Actions for ${tab.label}`"
							/>
						</UDropdownMenu>
					</div>

					<div v-if="tab.id === open" class="flex flex-col pr-2.5 pb-2 pl-11">
						<div class="flex h-9 items-center gap-2.5">
							<label :for="`${path}:badge:${tab.id}`" class="w-15.5 shrink-0 text-[13px] text-toned">
								Badge
							</label>
							<UInput
								:id="`${path}:badge:${tab.id}`"
								:model-value="tab.badge"
								size="sm"
								placeholder="A count or a word"
								class="min-w-0 flex-1"
								@update:model-value="patch(tab.id, { badge: String($event) || undefined })"
							/>
						</div>
						<div class="flex h-9 items-center gap-2.5">
							<span class="w-15.5 shrink-0 text-[13px] text-toned">Disabled</span>
							<USwitch
								:model-value="tab.disabled"
								:aria-label="`${tab.label} can't be opened`"
								@update:model-value="patch(tab.id, { disabled: $event === true ? true : undefined })"
							/>
						</div>
					</div>
				</div>
			</div>

			<UButton
				icon="i-ph-plus-light"
				size="sm"
				color="neutral"
				variant="outline"
				label="Add a tab"
				class="self-start"
				@click="add"
			/>
		</section>

		<section :class="PANEL_CARD" aria-label="Look">
			<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
				<UIcon name="i-ph-palette-light" class="size-4 text-primary" />
				Look
			</p>
			<div class="flex flex-col gap-1.5">
				<div
					v-for="look in LOOK.filter((entry) => has(entry.key) && choices(entry.key).length)"
					:key="look.key"
					class="flex min-h-9 items-center gap-2.5"
				>
					<span class="w-19 shrink-0 text-[13px] text-toned">{{ look.label }}</span>
					<div
						role="group"
						:aria-label="look.label"
						class="grid flex-1 gap-0.5 rounded-lg border border-default bg-(--dms-bg-muted) p-0.5"
						:style="{ gridTemplateColumns: `repeat(${choices(look.key).length}, minmax(0, 1fr))` }"
					>
						<button
							v-for="choice in choices(look.key)"
							:key="choice.value"
							type="button"
							:aria-pressed="chosen(look.key) === choice.value"
							class="h-6.5 rounded-[5px] px-1 text-[12px] transition-colors"
							:class="
								chosen(look.key) === choice.value
									? 'bg-default font-semibold text-highlighted shadow-sm ring-1 ring-accented'
									: 'font-medium text-muted hover:text-highlighted'
							"
							@click="write(look.key, choice.value)"
						>
							{{ choice.label }}
						</button>
					</div>
				</div>
				<div v-if="has('color')" class="flex min-h-9 items-center gap-2.5">
					<span class="w-19 shrink-0 text-[13px] text-toned">Colour</span>
					<USelectMenu
						:model-value="chosen('color')"
						:items="colours"
						value-key="value"
						:search-input="false"
						size="sm"
						class="min-w-0 flex-1"
						aria-label="Colour"
						@update:model-value="write('color', $event)"
					/>
				</div>
			</div>
		</section>

		<section
			v-if="has('persistState')"
			class="flex items-center gap-2.5 rounded-lg border border-default bg-elevated px-3.5 py-3"
			aria-label="Behavior"
		>
			<UIcon name="i-ph-lightning-light" class="size-4 shrink-0 text-primary" />
			<span class="flex-1 text-[13px] text-default">Remember the open tab</span>
			<USwitch
				:model-value="config.persistState === true"
				aria-label="Remember the open tab"
				@update:model-value="write('persistState', $event === true ? true : undefined)"
			/>
		</section>
	</div>
</template>

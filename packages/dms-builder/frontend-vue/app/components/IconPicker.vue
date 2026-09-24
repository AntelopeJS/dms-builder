<script setup lang="ts">
import { computed, ref } from 'vue'
import { ICON_PREFIXES } from '../runtime/constants'
import { isBundledIcon, useIconSearch } from '../runtime/icon-search'

/**
 * An icon, shown as the tile it will be and picked from a search beside it.
 *
 * Where the other icon input asks for a name, this one is for things an author
 * names by sight — a page, a category: the tile is the choice, and the name
 * only shows once it has been made.
 */
const props = defineProps<{
	modelValue?: string
	/** Shown in the tile while nothing is picked. */
	fallback?: string
	label?: string
	size?: 'sm' | 'md'
}>()

const emit = defineEmits<{ 'update:modelValue': [string | undefined] }>()

const open = ref(false)
const { query, results, searching, offline, reset } = useIconSearch()

/** A full name typed in: the search may not know it, or not be reachable. */
const typed = computed(() => {
	const text = query.value.trim()
	return ICON_PREFIXES.some(
		(prefix) => text.startsWith(`i-${prefix}-`) && text.length > prefix.length + 3,
	)
		? text
		: undefined
})

const hint = computed(() => {
	if (offline.value) {
		return 'Icon search is unavailable — type a full name such as i-ph-house.'
	}
	if (query.value.trim().length < 2) return 'Type to search icons by name.'
	return searching.value ? 'Searching…' : 'No icon matches.'
})

function pick(name: string | undefined): void {
	emit('update:modelValue', name)
	reset()
	open.value = false
}
</script>

<template>
	<UPopover v-model:open="open" :content="{ align: 'start', sideOffset: 6 }">
		<button
			type="button"
			class="flex shrink-0 items-center justify-center rounded-md border transition-colors"
			:class="[
				size === 'sm' ? 'size-7' : 'size-9',
				open
					? 'border-primary bg-primary/10 text-primary'
					: modelValue
						? 'border-primary/30 bg-primary/10 text-primary hover:border-primary/60'
						: 'border-accented bg-default text-muted hover:border-primary/40',
			]"
			:aria-label="label ?? 'Choose an icon'"
			:title="modelValue ?? label ?? 'Choose an icon'"
		>
			<UIcon
				:name="modelValue || fallback || 'i-ph-image'"
				:class="size === 'sm' ? 'size-4' : 'size-[18px]'"
			/>
		</button>

		<template #content>
			<div class="flex w-72 flex-col gap-2 p-2">
				<UInput
					v-model="query"
					icon="i-ph-magnifying-glass"
					placeholder="Search Phosphor and Lucide"
					aria-label="Search icons"
					size="sm"
					autofocus
					:loading="searching"
				/>
				<div
					v-if="results.length"
					class="grid max-h-52 grid-cols-7 gap-1 overflow-y-auto"
				>
					<button
						v-for="name in results"
						:key="name"
						type="button"
						class="flex h-8 items-center justify-center rounded-md border transition-colors"
						:class="
							name === modelValue
								? 'border-primary bg-primary/15 text-primary'
								: 'border-transparent text-toned hover:border-accented hover:bg-elevated'
						"
						:title="name"
						:aria-label="name"
						:aria-pressed="name === modelValue"
						@click="pick(name)"
					>
						<UIcon :name="name" class="size-4" />
					</button>
				</div>
				<button
					v-if="typed && !results.includes(typed)"
					type="button"
					class="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-toned hover:bg-elevated"
					@click="pick(typed)"
				>
					<UIcon :name="typed" class="size-4 shrink-0" />
					Use <span class="truncate font-mono">{{ typed }}</span>
				</button>
				<p v-else-if="!results.length" class="px-1 py-1.5 text-xs text-muted">
					{{ hint }}
				</p>
				<div
					class="flex items-center justify-between gap-2 border-t border-default px-0.5 pt-2 text-[11px] text-muted"
				>
					<span
						class="truncate font-mono"
						:class="isBundledIcon(modelValue) ? '' : 'text-warning'"
						:title="
							isBundledIcon(modelValue)
								? undefined
								: 'Only Phosphor and Lucide icons are bundled; this one will not render.'
						"
					>
						{{ modelValue ?? 'No icon' }}
					</span>
					<button
						v-if="modelValue"
						type="button"
						class="shrink-0 hover:text-default"
						@click="pick(undefined)"
					>
						Remove
					</button>
					<span v-else class="shrink-0">Phosphor · Lucide</span>
				</div>
			</div>
		</template>
	</UPopover>
</template>

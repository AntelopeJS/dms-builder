<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { ICON_PREFIXES } from '../runtime/constants'
import { isBundledIcon, useIconSearch } from '../runtime/icon-search'

/**
 * An icon, shown as the tile it will be and picked from a search beside it.
 *
 * Where the other icon input asks for a name, this one is for things an author
 * names by sight — a page, a category: the tile is the choice, and the name
 * only shows once it has been made.
 */
defineProps<{
	modelValue?: string
	/** Shown in the tile while nothing is picked. */
	fallback?: string
	label?: string
	/** The size of the input the tile sits beside. */
	size?: 'sm' | 'lg'
}>()

const emit = defineEmits<{ 'update:modelValue': [string | undefined] }>()

const open = ref(false)
const { query, results, searching, offline, reset } = useIconSearch()
const searchId = useId()

const bundled = ICON_PREFIXES.map((prefix) => `i-${prefix}-*`).join(' and ')

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
		<UButton
			:icon="modelValue || fallback || 'i-ph-image'"
			:color="modelValue || open ? 'primary' : 'neutral'"
			:variant="modelValue || open ? 'subtle' : 'outline'"
			:size="size ?? 'lg'"
			square
			:aria-label="label ?? 'Choose an icon'"
			:title="modelValue ?? label ?? 'Choose an icon'"
		/>

		<template #content>
			<div class="flex w-72 flex-col gap-2 p-2">
				<!-- An id of its own: set beside a field's input, the picker sits in
				that field, and the search would take the input's id. -->
				<UInput
					:id="searchId"
					v-model="query"
					icon="i-ph-magnifying-glass"
					placeholder="Search icons"
					aria-label="Search icons"
					size="sm"
					autofocus
					:loading="searching"
				/>
				<div
					v-if="results.length"
					class="grid max-h-52 grid-cols-7 gap-1 overflow-y-auto"
				>
					<UButton
						v-for="name in results"
						:key="name"
						:icon="name"
						:color="name === modelValue ? 'primary' : 'neutral'"
						:variant="name === modelValue ? 'soft' : 'ghost'"
						square
						block
						:title="name"
						:aria-label="name"
						:aria-pressed="name === modelValue"
						@click="pick(name)"
					/>
				</div>
				<UButton
					v-if="typed && !results.includes(typed)"
					:icon="typed"
					size="xs"
					color="neutral"
					variant="ghost"
					@click="pick(typed)"
				>
					Use <span class="truncate font-mono">{{ typed }}</span>
				</UButton>
				<p v-else-if="!results.length" class="px-1 py-1.5 text-xs text-muted">
					{{ hint }}
				</p>
				<div
					class="flex items-center justify-between gap-2 border-t border-default px-0.5 pt-2 text-xs text-muted"
				>
					<span
						class="truncate font-mono"
						:class="isBundledIcon(modelValue) ? '' : 'text-warning'"
						:title="
							isBundledIcon(modelValue)
								? undefined
								: `Only ${bundled} icons are bundled; this one will not render.`
						"
					>
						{{ modelValue ?? 'No icon' }}
					</span>
					<UButton
						v-if="modelValue"
						label="Remove"
						size="xs"
						color="neutral"
						variant="link"
						@click="pick(undefined)"
					/>
				</div>
			</div>
		</template>
	</UPopover>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useDmsState } from '#dms/frontend-module'
import { ICON_PREFIXES, SESSION_STATE_KEY, SUGGESTED_ICONS } from '../runtime/constants'
import { isBundledIcon, useIconSearch } from '../runtime/icon-search'
import type { BuilderSession } from '../runtime/session'

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

// Read straight from the editor's state: the picker is a field, and a field
// has no business opening the builder's API to name what is in the menu.
const session = useDmsState<BuilderSession | undefined>(SESSION_STATE_KEY, () => undefined)

/** How many tiles a row of the grid holds, for the arrows to walk it. */
const COLUMNS = 7

/**
 * The icons the project's menu already uses: the ones an author most often
 * wants again, so a page sits beside its siblings looking like one of them.
 */
const used = computed(() => {
	const icons = [
		...(session.value?.pages ?? []).map((page) => page.icon),
		...(session.value?.categories ?? []).map((category) => category.icon),
	].filter((icon): icon is string => typeof icon === 'string' && icon !== '')
	return [...new Set(icons)].slice(0, COLUMNS * 2)
})

const searching_ = computed(() => query.value.trim().length >= 2)

/** Until a search is typed, the icons most often picked rather than nothing. */
const shown = computed<readonly string[]>(() =>
	searching_.value
		? results.value
		: SUGGESTED_ICONS.filter((icon) => !used.value.includes(icon)),
)

/** The arrows walk the tiles, a row at a time up and down. */
function walkTiles(event: KeyboardEvent): void {
	const steps: Record<string, number> = {
		ArrowRight: 1,
		ArrowLeft: -1,
		ArrowDown: COLUMNS,
		ArrowUp: -COLUMNS,
	}
	const step = steps[event.key]
	const grid = event.currentTarget as HTMLElement | null
	if (!step || typeof grid?.querySelectorAll !== 'function') {
		return
	}
	const tiles = [...grid.querySelectorAll<HTMLElement>('button')]
	const at = tiles.indexOf(document.activeElement as HTMLElement)
	const next = tiles[Math.min(Math.max(at + step, 0), tiles.length - 1)]
	if (next) {
		event.preventDefault()
		next.focus()
	}
}

const hint = computed(() => {
	if (offline.value) {
		return 'Icon search is unavailable — type a full name such as i-ph-house.'
	}
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
					icon="i-ph-magnifying-glass-light"
					placeholder="Search icons"
					aria-label="Search icons"
					size="sm"
					autofocus
					:loading="searching"
				/>
				<div class="flex max-h-60 flex-col gap-2 overflow-y-auto" @keydown="walkTiles">
					<template v-if="!searching_ && used.length">
						<DmsEyebrow class="px-0.5">Used in this project</DmsEyebrow>
						<div class="grid grid-cols-7 gap-1">
							<UButton
								v-for="name in used"
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
						<DmsEyebrow class="px-0.5">Suggested</DmsEyebrow>
					</template>
					<div v-if="shown.length" class="grid grid-cols-7 gap-1">
						<UButton
							v-for="name in shown"
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
				<p v-else-if="!shown.length" class="px-1 py-1.5 text-xs text-muted">
					{{ hint }}
				</p>
				<!-- The icon picked, by name, and the way to take it off; with none
				picked there is nothing to name. -->
				<div
					v-if="modelValue"
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
						{{ modelValue }}
					</span>
					<UButton
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

<script setup lang="ts">
import { computed } from 'vue'
import { useBuilderMode } from '../runtime/mode'
import { useThemeEditor } from '../runtime/theme'
import { paletteShade, THEME_PALETTES } from '../runtime/theme-catalog'
import type { ThemeColorRole } from '../runtime/types'

const props = defineProps<{
	role: ThemeColorRole
	label: string
	hint: string
}>()

const editor = useThemeEditor()
const state = editor.state
const { advanced } = useBuilderMode()

const pickedPalette = computed(() => state.value.draft?.colors[props.role])
const dmsPalette = computed(() => editor.dmsBrandingDefaults.value.colors?.[props.role])
const effectivePalette = computed(() => pickedPalette.value ?? dmsPalette.value)
const changed = computed(() => pickedPalette.value !== state.value.baseline?.colors[props.role])

const customPalette = computed(() =>
	pickedPalette.value && !THEME_PALETTES.includes(pickedPalette.value) ? pickedPalette.value : '',
)

function choose(name: string): void {
	editor.setColor(props.role, name === dmsPalette.value ? undefined : name)
}

/** Tailwind does not ship the 'dms' palette: only the page declares it, as a CSS variable. */
function swatchColor(name: string): string {
	return paletteShade(name, 500) ?? `var(--color-${name}-500)`
}

function swatchTitle(name: string): string {
	return name === dmsPalette.value ? `${name} — the DMS's` : name
}

/** Roving tabindex: Tab stops on the selected swatch, else the first; arrows move within the group. */
const tabStop = computed(() =>
	effectivePalette.value && THEME_PALETTES.includes(effectivePalette.value) ? effectivePalette.value : THEME_PALETTES[0],
)

const NEXT_SWATCH_INDEX_BY_KEY: Record<string, (index: number, count: number) => number> = {
	ArrowRight: (index, count) => (index + 1) % count,
	ArrowDown: (index, count) => (index + 1) % count,
	ArrowLeft: (index, count) => (index - 1 + count) % count,
	ArrowUp: (index, count) => (index - 1 + count) % count,
	Home: () => 0,
	End: (_index, count) => count - 1,
}

/** Arrow, Home and End keys select and focus another swatch, like a native radio group. */
function onSwatchKeydown(event: KeyboardEvent, index: number): void {
	const nextIndexOf = NEXT_SWATCH_INDEX_BY_KEY[event.key]
	if (!nextIndexOf) {
		return
	}
	event.preventDefault()
	const next = nextIndexOf(index, THEME_PALETTES.length)
	const palette = THEME_PALETTES[next]
	if (!palette) {
		return
	}
	choose(palette)
	const swatches = (event.currentTarget as HTMLElement | null)?.parentElement?.children
	const target = swatches?.[next] as HTMLElement | undefined
	target?.focus()
}
</script>

<template>
	<div class="flex flex-col gap-2" :data-theme-color="role">
		<div class="flex min-h-6 items-center gap-2">
			<div class="min-w-0 flex-1">
				<p class="text-[13px] font-medium text-highlighted">
					{{ label }}
					<span v-if="effectivePalette" class="ml-1 font-mono text-[11px] font-normal text-muted">{{ effectivePalette }}</span>
					<UBadge v-if="changed" color="primary" variant="soft" size="sm" class="ml-1">changed</UBadge>
				</p>
				<p class="text-xs text-muted">{{ hint }}</p>
			</div>
			<UButton
				v-if="pickedPalette"
				icon="i-ph-arrow-counter-clockwise-light"
				size="xs"
				color="neutral"
				variant="ghost"
				:aria-label="`Give the ${label.toLowerCase()} the DMS palette back`"
				title="Back to the DMS palette"
				@click="editor.setColor(role, undefined)"
			/>
		</div>
		<div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="`${label} palette`">
			<button
				v-for="(palette, index) in THEME_PALETTES"
				:key="palette"
				type="button"
				role="radio"
				:aria-checked="effectivePalette === palette"
				:aria-label="swatchTitle(palette)"
				:title="swatchTitle(palette)"
				:tabindex="palette === tabStop ? 0 : -1"
				class="size-6 rounded-md transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverted"
				:class="
					effectivePalette === palette
						? 'ring-2 ring-(--ui-text-highlighted) ring-offset-2 ring-offset-(--dms-bg-sidebar)'
						: 'ring-1 ring-inset ring-default hover:ring-accented'
				"
				:style="{ background: swatchColor(palette) }"
				@click="choose(palette)"
				@keydown="onSwatchKeydown($event, index)"
			/>
		</div>
		<UInput
			v-if="advanced"
			:model-value="customPalette"
			size="sm"
			class="w-full"
			:ui="{ base: 'font-mono text-xs' }"
			placeholder="Or a palette of the project's: brand for --color-brand-50…950"
			:aria-label="`${label}: palette name`"
			@change="editor.setColor(role, ($event.target as HTMLInputElement).value.trim() || undefined)"
		/>
	</div>
</template>

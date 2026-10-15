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

const picked = computed(() => state.value.draft?.colors[props.role])
const dmsPalette = computed(() => editor.defaults.value.colors?.[props.role])
/** The palette the role shows: the one picked, else the DMS's. */
const shown = computed(() => picked.value ?? dmsPalette.value)
const changed = computed(() => picked.value !== state.value.baseline?.colors[props.role])

/** A palette the project declares itself, typed rather than picked. */
const custom = computed(() =>
	picked.value && !THEME_PALETTES.includes(picked.value) ? picked.value : '',
)

function choose(name: string): void {
	editor.setColor(props.role, name === dmsPalette.value ? undefined : name)
}

/** A palette's 500 shade, the DMS's read off the page, which declares it. */
function swatch(name: string): string {
	return paletteShade(name, 500) ?? `var(--color-${name}-500)`
}

function swatchTitle(name: string): string {
	return name === dmsPalette.value ? `${name} — the DMS's` : name
}
</script>

<template>
	<div class="flex flex-col gap-2" :data-theme-color="role">
		<div class="flex min-h-6 items-center gap-2">
			<div class="min-w-0 flex-1">
				<p class="text-[13px] font-medium text-highlighted">
					{{ label }}
					<span v-if="shown" class="ml-1 font-mono text-[11px] font-normal text-muted">{{ shown }}</span>
					<UBadge v-if="changed" color="primary" variant="soft" size="sm" class="ml-1">changed</UBadge>
				</p>
				<p class="text-xs text-muted">{{ hint }}</p>
			</div>
			<UButton
				v-if="picked"
				icon="i-ph-arrow-counter-clockwise-light"
				size="xs"
				color="neutral"
				variant="ghost"
				:aria-label="`Give the ${label.toLowerCase()} the DMS palette back`"
				title="Back to the DMS palette"
				@click="editor.setColor(role, undefined)"
			/>
		</div>
		<div class="flex flex-wrap gap-1.5" role="radiogroup" :aria-label="`${label} palette`">
			<button
				v-for="palette in THEME_PALETTES"
				:key="palette"
				type="button"
				role="radio"
				:aria-checked="shown === palette"
				:aria-label="swatchTitle(palette)"
				:title="swatchTitle(palette)"
				class="size-6 rounded-full ring-offset-2 ring-offset-(--dms-bg-sidebar) transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverted"
				:class="shown === palette ? 'ring-2 ring-(--ui-text-highlighted)' : 'ring-1 ring-default hover:ring-accented'"
				:style="{ background: swatch(palette) }"
				@click="choose(palette)"
			/>
		</div>
		<UInput
			v-if="advanced"
			:model-value="custom"
			size="sm"
			class="w-full"
			:ui="{ base: 'font-mono text-xs' }"
			placeholder="Or a palette of the project's: brand for --color-brand-50…950"
			:aria-label="`${label}: palette name`"
			@change="editor.setColor(role, ($event.target as HTMLInputElement).value.trim() || undefined)"
		/>
	</div>
</template>

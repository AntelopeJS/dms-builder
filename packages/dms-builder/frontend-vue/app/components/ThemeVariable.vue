<script setup lang="ts">
import { computed } from 'vue'
import { THEME_MODES, useThemeEditor, valueProblem } from '../runtime/theme'
import type { ThemeMode } from '../runtime/types'

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const MODE_ICONS: Record<ThemeMode, string> = {
	light: 'i-ph-sun',
	dark: 'i-ph-moon',
}

const props = defineProps<{
	name: string
	label?: string
	hint?: string
	color: boolean
	/** The value each mode shows on the page now, where it could be read. */
	observed: Partial<Record<ThemeMode, string>>
}>()

const editor = useThemeEditor()
const state = editor.state

const overridden = computed(() =>
	THEME_MODES.filter((mode) => props.name in (state.value.draft?.variables[mode] ?? {})),
)

function draftValue(mode: ThemeMode): string {
	return state.value.draft?.variables[mode]?.[props.name] ?? ''
}

const problems = computed(() =>
	[...new Set(THEME_MODES.flatMap((mode) => valueProblem(draftValue(mode)) ?? []))],
)

function cellBorder(mode: ThemeMode): string {
	if (valueProblem(draftValue(mode))) {
		return 'border-error'
	}
	return isChanged(mode) ? 'border-primary' : 'border-default'
}

function isSaved(mode: ThemeMode): boolean {
	return props.name in (state.value.baseline?.variables[mode] ?? {})
}

function isChanged(mode: ThemeMode): boolean {
	return draftValue(mode) !== (state.value.baseline?.variables[mode]?.[props.name] ?? '')
}

function shown(mode: ThemeMode): string {
	return draftValue(mode) || props.observed[mode] || ''
}

function pickerValue(mode: ThemeMode): string {
	const value = shown(mode)
	return HEX_COLOR.test(value) ? value : '#000000'
}

function set(mode: ThemeMode, event: Event): void {
	editor.setVariable(mode, props.name, (event.target as HTMLInputElement).value)
}

/** Once the author moves on, the cell shows the value the save will write. */
function settle(mode: ThemeMode, event: Event): void {
	editor.setVariable(mode, props.name, (event.target as HTMLInputElement).value.trim())
}

function reset(): void {
	for (const mode of THEME_MODES) {
		editor.resetVariable(mode, props.name)
	}
}
</script>

<template>
	<div class="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,1fr)_1.75rem] items-center gap-2">
		<div class="min-w-0">
			<p class="truncate text-xs font-medium text-highlighted">{{ label ?? name }}</p>
			<p class="truncate font-mono text-[10px] text-dimmed" :title="hint">{{ name }}</p>
		</div>
		<div
			v-for="mode in THEME_MODES"
			:key="mode"
			class="flex min-w-0 items-center gap-1.5 rounded-md border px-1.5 py-1"
			:class="cellBorder(mode)"
			:data-theme-cell="`${name}:${mode}`"
		>
			<label
				v-if="color"
				class="relative size-5 shrink-0 cursor-pointer rounded border border-default"
				:style="{ background: shown(mode) || 'transparent' }"
				:title="`Pick the ${mode} color`"
			>
				<input
					type="color"
					class="absolute inset-0 size-full cursor-pointer opacity-0"
					:value="pickerValue(mode)"
					@input="set(mode, $event)"
				/>
			</label>
			<UIcon v-else :name="MODE_ICONS[mode]" class="size-3.5 shrink-0 text-dimmed" />
			<input
				class="min-w-0 flex-1 bg-transparent font-mono text-xs text-default outline-none placeholder:text-dimmed"
				:value="draftValue(mode)"
				:placeholder="observed[mode] ? `${observed[mode]} · default` : 'default'"
				:aria-label="`${label ?? name}, ${mode}`"
				@input="set(mode, $event)"
				@change="settle(mode, $event)"
			/>
			<span
				v-if="isSaved(mode) && !isChanged(mode)"
				class="shrink-0 text-[10px] font-medium text-muted"
				title="Saved in the project's theme"
			>
				saved
			</span>
		</div>
		<UButton
			v-if="overridden.length"
			icon="i-ph-arrow-counter-clockwise"
			size="xs"
			color="neutral"
			variant="ghost"
			:aria-label="`Reset ${label ?? name} to the DMS default`"
			title="Back to the DMS default, in both modes"
			@click="reset"
		/>
		<p v-if="problems.length" class="col-span-4 text-[11px] text-error">
			{{ problems.join(' ') }} It shows nowhere, and the theme is not saved with it.
		</p>
	</div>
</template>

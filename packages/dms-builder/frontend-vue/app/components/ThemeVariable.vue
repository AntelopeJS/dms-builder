<script setup lang="ts">
import { computed } from 'vue'
import { hexOf, THEME_MODES, useThemeEditor, variableProblem } from '../runtime/theme'
import { THEME_MODE_ENTRIES } from '../runtime/theme-catalog'
import type { ThemeMode } from '../runtime/types'

const MODE_ICONS = Object.fromEntries(
	THEME_MODE_ENTRIES.map((entry) => [entry.value, entry.icon]),
) as Record<ThemeMode, string>
/** What a color input shows when the value is none it can hold. */
const FALLBACK_HEX = '#000000'
/** The room a cell keeps at its end for the `saved` mark. */
const SAVED_ROOM = 'pe-12'

const props = defineProps<{
	name: string
	label?: string
	hint?: string
	color: boolean
	/** Each mode on a line of its own, for values too long for half a row. */
	wide?: boolean
	/** A row the author added and left empty, which can leave the list. */
	removable?: boolean
	/** What each mode shows on the page now, the draft included. */
	observed: Partial<Record<ThemeMode, string>>
}>()

const emit = defineEmits<{
	remove: []
}>()

const editor = useThemeEditor()
const state = editor.state

const title = computed(() => props.label ?? props.name)
const overridden = computed(() =>
	THEME_MODES.filter((mode) => props.name in (state.value.draft?.variables[mode] ?? {})),
)

function draftValue(mode: ThemeMode): string {
	return state.value.draft?.variables[mode]?.[props.name] ?? ''
}

function problemOf(mode: ThemeMode): string | undefined {
	return variableProblem(props.name, draftValue(mode))
}

const problems = computed(() =>
	THEME_MODES.flatMap((mode) => {
		const problem = problemOf(mode)
		return problem ? [`The ${mode} value ${problem}.`] : []
	}),
)
const problemEffect = computed(() =>
	problems.value.length > 1
		? 'Neither shows on the page, and the theme cannot be saved with them.'
		: 'It shows nowhere, and the theme cannot be saved with it.',
)

function isSaved(mode: ThemeMode): boolean {
	return props.name in (state.value.baseline?.variables[mode] ?? {})
}

function isChanged(mode: ThemeMode): boolean {
	return draftValue(mode) !== (state.value.baseline?.variables[mode]?.[props.name] ?? '')
}

function cellColor(mode: ThemeMode): 'error' | 'primary' | 'neutral' {
	if (problemOf(mode)) {
		return 'error'
	}
	return isChanged(mode) ? 'primary' : 'neutral'
}

/** What the cell's color stands for: what the page shows, else what was typed. */
function shown(mode: ThemeMode): string {
	return props.observed[mode] || draftValue(mode)
}

function pickerValue(mode: ThemeMode): string {
	return hexOf(shown(mode)) ?? FALLBACK_HEX
}

function set(mode: ThemeMode, value: string | number): void {
	editor.setVariable(mode, props.name, String(value))
}

/** Once the author moves on, the cell shows the value the save will write. */
function settle(mode: ThemeMode): void {
	editor.setVariable(mode, props.name, draftValue(mode).trim())
}

function pick(mode: ThemeMode, event: Event): void {
	set(mode, (event.target as HTMLInputElement).value)
}

function reset(): void {
	for (const mode of THEME_MODES) {
		editor.resetVariable(mode, props.name)
	}
}
</script>

<template>
	<div class="flex flex-col gap-1.5" :data-theme-row="name">
		<div class="flex min-h-6 items-center gap-2">
			<p
				class="min-w-0 truncate text-xs font-medium text-highlighted"
				:class="label ? '' : 'font-mono'"
				:title="hint"
			>
				{{ title }}
				<span v-if="label" class="ml-1 font-mono text-[11px] font-normal text-muted">{{ name }}</span>
			</p>
			<UButton
				v-if="overridden.length"
				icon="i-ph-arrow-counter-clockwise"
				size="xs"
				color="neutral"
				variant="ghost"
				class="ml-auto"
				:aria-label="`Reset ${title} to the DMS default`"
				title="Back to the DMS default, in both modes"
				@click="reset"
			/>
			<UButton
				v-else-if="removable"
				icon="i-ph-x"
				size="xs"
				color="neutral"
				variant="ghost"
				class="ml-auto"
				:aria-label="`Remove ${title} from the list`"
				title="Take this variable off the list"
				@click="emit('remove')"
			/>
		</div>
		<div class="grid gap-2" :class="wide ? 'grid-cols-1' : 'grid-cols-2'">
			<div v-for="mode in THEME_MODES" :key="mode" class="min-w-0" :data-theme-cell="`${name}:${mode}`">
				<UInput
					:model-value="draftValue(mode)"
					:placeholder="observed[mode] ?? ''"
					:color="cellColor(mode)"
					:highlight="cellColor(mode) !== 'neutral'"
					:leading-icon="color ? undefined : MODE_ICONS[mode]"
					size="xs"
					class="w-full"
					:ui="{ base: ['font-mono text-xs placeholder:text-muted', isSaved(mode) && !isChanged(mode) ? SAVED_ROOM : ''] }"
					:aria-label="`${title}, ${mode}`"
					:title="draftValue(mode) || observed[mode] || ''"
					@update:model-value="set(mode, $event)"
					@change="settle(mode)"
				>
					<template v-if="color" #leading>
						<label
							class="relative size-4 shrink-0 cursor-pointer rounded-sm ring ring-default focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-inverted"
							:style="{ background: shown(mode) || 'transparent' }"
						>
							<input
								type="color"
								class="absolute inset-0 size-full cursor-pointer opacity-0"
								:value="pickerValue(mode)"
								:aria-label="`${title}, ${mode}: pick a color`"
								@input="pick(mode, $event)"
							/>
						</label>
					</template>
					<template v-if="isSaved(mode) && !isChanged(mode)" #trailing>
						<span class="text-xs text-muted" title="Saved in the project's theme">saved</span>
					</template>
				</UInput>
			</div>
		</div>
		<p v-if="problems.length" class="text-xs text-error">
			{{ problems.join(' ') }} {{ problemEffect }}
		</p>
	</div>
</template>

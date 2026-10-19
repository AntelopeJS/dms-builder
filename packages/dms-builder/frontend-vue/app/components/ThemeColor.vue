<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { hexOf, THEME_MODES, useThemeEditor, variableProblem, type VariableSetName } from '../runtime/theme'
import { effectiveValue } from '../runtime/theme-preview'
import { THEME_MODE_OPTIONS, type DmsTone } from '../runtime/theme-catalog'
import type { ThemeMode } from '../runtime/types'

/**
 * A color set once per mode, as a row saying what it paints: its swatch shows
 * the light value beside the dark one, and opening it edits the mode the page
 * shows, with a picker, the DMS's own colors of the same kind or, once asked
 * for, the code itself.
 */

/**
 * How far apart, per channel, the picker may hand back the color it was given:
 * its round trip through HSV moves a channel by one or two, which is no pick of
 * the author's and must not write the variable.
 */
const PICKER_DRIFT = 2

const props = defineProps<{
	name: string
	label: string
	hint?: string
	dmsDefaultValues: Partial<Record<ThemeMode, string>>
	/** The DMS's colors for the row's group, offered to pick from. */
	dmsTones: Record<ThemeMode, DmsTone[]>
	/** The mode the page shows, which the row edits. */
	pageMode: ThemeMode
	expanded: boolean
}>()

const emit = defineEmits<{
	toggle: []
	showMode: [mode: ThemeMode]
}>()

const editor = useThemeEditor()
const state = editor.state

const editorId = useId()
/** Id of the problems paragraph, which an invalid row and code field name in aria-describedby. */
const problemId = useId()
const codeRequested = ref(false)

const overridden = computed(() =>
	(['shared', ...THEME_MODES] as VariableSetName[]).some(
		(setName) => props.name in (state.value.draft?.variables[setName] ?? {}),
	),
)
const modeOverridden = computed(() => props.name in (state.value.draft?.variables[props.pageMode] ?? {}))

/** A mode falls back to the shared value. */
function draftValue(mode: ThemeMode): string {
	const variables = state.value.draft?.variables
	return variables ? (effectiveValue(variables, mode, props.name) ?? '') : ''
}

function savedValue(mode: ThemeMode): string {
	const variables = state.value.baseline?.variables
	return variables ? (effectiveValue(variables, mode, props.name) ?? '') : ''
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

/** What the page paints in a mode: the theme's value, else the DMS's; nothing for a value it cannot hold. */
function shownColor(mode: ThemeMode): string {
	return problemOf(mode) ? '' : draftValue(mode) || (props.dmsDefaultValues[mode] ?? '')
}

const swatchBackground = computed(
	() => `linear-gradient(135deg, ${shownColor('light') || 'transparent'} 50%, ${shownColor('dark') || 'transparent'} 50%)`,
)

const pickerColor = computed(() => hexOf(shownColor(props.pageMode)))

const tones = computed(() => {
	const shown = shownColor(props.pageMode)
	const shownHex = hexOf(shown) ?? shown
	return props.dmsTones[props.pageMode].map((tone) => ({
		...tone,
		isOwnDefault: tone.value === props.dmsDefaultValues[props.pageMode],
		isShown: (hexOf(tone.value) ?? tone.value) === shownHex,
	}))
})

const codeShown = computed(() => codeRequested.value || problemOf(props.pageMode) !== undefined)

function setValue(value: string): void {
	editor.setVariable(props.pageMode, props.name, value)
}

function channels(hex: string): number[] {
	return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
}

function isDrift(picked: string, current: string | undefined): boolean {
	if (!current) {
		return false
	}
	const shown = channels(current)
	return channels(picked).every((channel, index) => Math.abs(channel - (shown[index] ?? 0)) <= PICKER_DRIFT)
}

/** A color the picker hands back; one it only rounded off the color shown writes nothing. */
function pick(color: string | undefined): void {
	const picked = color?.toLowerCase()
	if (!picked || !/^#[0-9a-f]{6}$/.test(picked) || isDrift(picked, pickerColor.value)) {
		return
	}
	setValue(picked)
}

/** The row's own DMS default is no value of the theme's: picking it takes the theme's away. */
function useTone(tone: DmsTone): void {
	setValue(tone.value === props.dmsDefaultValues[props.pageMode] ? '' : tone.value)
}

function toneTitle(tone: DmsTone & { isOwnDefault: boolean }): string {
	return tone.isOwnDefault ? `The DMS's ${tone.label}: the default here` : `The DMS's ${tone.label}`
}

function showMode(mode: string | number): void {
	emit('showMode', mode as ThemeMode)
}

function codeColor(): 'error' | 'primary' | 'neutral' {
	if (problemOf(props.pageMode)) {
		return 'error'
	}
	return draftValue(props.pageMode) === savedValue(props.pageMode) ? 'neutral' : 'primary'
}

/** Trimmed as the save will, so the field shows what gets written. */
function trimCode(): void {
	const value = state.value.draft?.variables[props.pageMode][props.name]
	if (value !== undefined && value !== value.trim()) {
		setValue(value.trim())
	}
}
</script>

<template>
	<div class="flex flex-col gap-1.5" :data-theme-row="name">
		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverted"
			:class="expanded ? 'border-primary/45 bg-elevated' : 'border-default bg-elevated/40 hover:bg-elevated'"
			:aria-expanded="expanded"
			:aria-controls="expanded ? editorId : undefined"
			:aria-describedby="problems.length ? problemId : undefined"
			@click="emit('toggle')"
		>
			<span
				aria-hidden="true"
				class="size-9 shrink-0 rounded-md ring ring-default"
				:style="{ background: swatchBackground }"
			/>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate text-[13px] font-medium text-highlighted">{{ label }}</span>
				<span v-if="hint" class="text-xs text-muted">{{ hint }}</span>
			</span>
			<UIcon v-if="problems.length" name="i-ph-warning-light" class="size-4 shrink-0 text-error" />
			<UBadge v-else-if="overridden" label="Edited" color="primary" variant="soft" size="sm" />
			<UIcon
				:name="expanded ? 'i-ph-caret-down-light' : 'i-ph-caret-right-light'"
				class="size-3.5 shrink-0 text-dimmed"
			/>
		</button>

		<div
			v-if="expanded"
			:id="editorId"
			class="flex flex-col gap-3 rounded-lg border border-default bg-elevated/40 p-3"
			:data-theme-editor="name"
		>
			<DmsSegmented
				:model-value="pageMode"
				:items="THEME_MODE_OPTIONS"
				size="xs"
				block
				:aria-label="`${label}: the mode to set`"
				@update:model-value="showMode($event)"
			/>
			<div class="flex items-start gap-3">
				<UColorPicker :model-value="pickerColor" size="xs" @update:model-value="pick" />
				<div v-if="tones.length" class="flex min-w-0 flex-col gap-1.5">
					<p class="text-[11.5px] text-muted">From the DMS</p>
					<div class="flex flex-wrap gap-1.5">
						<button
							v-for="tone in tones"
							:key="tone.value"
							type="button"
							class="size-6 cursor-pointer rounded-md ring ring-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverted"
							:class="tone.isShown ? 'outline-2 outline-offset-2 outline-primary' : ''"
							:style="{ background: tone.value }"
							:aria-pressed="tone.isShown"
							:aria-label="`${label}: the DMS's ${tone.label}`"
							:title="toneTitle(tone)"
							@click="useTone(tone)"
						/>
					</div>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<UButton
					label="Back to the DMS default"
					icon="i-ph-arrow-counter-clockwise-light"
					size="xs"
					color="neutral"
					variant="outline"
					:disabled="!modeOverridden"
					@click="setValue('')"
				/>
				<UButton
					icon="i-ph-hash-light"
					size="xs"
					color="neutral"
					:variant="codeShown ? 'soft' : 'ghost'"
					class="ml-auto"
					:aria-pressed="codeShown"
					:aria-label="`${label}: the color code`"
					:title="codeShown ? 'Hide the color code' : 'Show the color code'"
					@click="codeRequested = !codeRequested"
				/>
			</div>
			<UInput
				v-if="codeShown"
				:model-value="draftValue(pageMode)"
				:placeholder="dmsDefaultValues[pageMode] ?? ''"
				:color="codeColor()"
				:highlight="codeColor() !== 'neutral'"
				size="sm"
				class="w-full"
				:ui="{ base: 'font-mono text-xs placeholder:text-muted' }"
				:aria-label="`${label}, ${pageMode}`"
				:aria-invalid="problemOf(pageMode) ? true : undefined"
				:aria-describedby="problemOf(pageMode) ? problemId : undefined"
				@update:model-value="setValue(String($event))"
				@change="trimCode"
			/>
		</div>

		<p v-if="problems.length" :id="problemId" class="text-xs text-error">
			{{ problems.join(' ') }} It shows nowhere, and the theme cannot be saved with it.
		</p>
	</div>
</template>

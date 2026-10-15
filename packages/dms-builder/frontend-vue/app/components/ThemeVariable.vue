<script setup lang="ts">
import { computed } from 'vue'
import { hexOf, THEME_MODES, useThemeEditor, variableProblem, type VariableSet } from '../runtime/theme'
import { effectiveValue } from '../runtime/theme-preview'
import { THEME_MODE_ENTRIES, type ThemeVariableScope } from '../runtime/theme-catalog'
import type { ThemeMode } from '../runtime/types'

const MODE_ICONS = Object.fromEntries(
	THEME_MODE_ENTRIES.map((entry) => [entry.value, entry.icon]),
) as Record<ThemeMode, string>
/** What a color input shows when the value is none it can hold. */
const FALLBACK_HEX = '#000000'

const props = defineProps<{
	name: string
	label?: string
	hint?: string
	color: boolean
	/** One value both modes share, or one per mode. */
	scope: ThemeVariableScope
	/** A row the author added and left empty, which can leave the list. */
	removable?: boolean
	/** What each mode shows on the page now, the draft included. */
	observed: Partial<Record<ThemeMode, string>>
	/** The mode the page is shown in, whose value a shared cell stands for. */
	shownMode: ThemeMode
}>()

const emit = defineEmits<{
	remove: []
}>()

const editor = useThemeEditor()
const state = editor.state

const title = computed(() => props.label ?? props.name)

/** The cells of the row: one shared, or one per mode, each the set it writes to. */
const cells = computed<VariableSet[]>(() => (props.scope === 'shared' ? ['shared'] : THEME_MODES))

const overridden = computed(() =>
	(['shared', ...THEME_MODES] as VariableSet[]).some(
		(set) => props.name in (state.value.draft?.variables[set] ?? {}),
	),
)

/** What a cell holds: its own value, or — for a mode — the one both modes share. */
function draftValue(set: VariableSet): string {
	const variables = state.value.draft?.variables
	if (!variables) {
		return ''
	}
	return set === 'shared' ? (variables.shared[props.name] ?? '') : (effectiveValue(variables, set, props.name) ?? '')
}

function savedValue(set: VariableSet): string {
	const variables = state.value.baseline?.variables
	if (!variables) {
		return ''
	}
	return set === 'shared' ? (variables.shared[props.name] ?? '') : (effectiveValue(variables, set, props.name) ?? '')
}

function observedOf(set: VariableSet): string {
	return (set === 'shared' ? props.observed[props.shownMode] : props.observed[set]) ?? ''
}

function problemOf(set: VariableSet): string | undefined {
	return variableProblem(props.name, draftValue(set))
}

const problems = computed(() =>
	cells.value.flatMap((set) => {
		const problem = problemOf(set)
		return problem ? [`The ${set === 'shared' ? '' : `${set} `}value ${problem}.`] : []
	}),
)

function isChanged(set: VariableSet): boolean {
	return draftValue(set) !== savedValue(set)
}

function cellColor(set: VariableSet): 'error' | 'primary' | 'neutral' {
	if (problemOf(set)) {
		return 'error'
	}
	return isChanged(set) ? 'primary' : 'neutral'
}

/** What the cell's swatch stands for: what the page shows, else what was typed. */
function shown(set: VariableSet): string {
	return observedOf(set) || draftValue(set)
}

function pickerValue(set: VariableSet): string {
	return hexOf(shown(set)) ?? FALLBACK_HEX
}

function set(cell: VariableSet, value: string | number): void {
	editor.setVariable(cell, props.name, String(value))
}

/** Once the author moves on, the cell shows the value the save will write. */
function settle(cell: VariableSet): void {
	const value = state.value.draft?.variables[cell][props.name]
	if (value !== undefined && value !== value.trim()) {
		editor.setVariable(cell, props.name, value.trim())
	}
}

function pick(cell: VariableSet, event: Event): void {
	set(cell, (event.target as HTMLInputElement).value)
}

function cellLabel(cell: VariableSet): string {
	return cell === 'shared' ? title.value : `${title.value}, ${cell}`
}
</script>

<template>
	<div class="flex flex-col gap-1.5" :data-theme-row="name">
		<div class="flex min-h-6 items-center gap-2">
			<p class="min-w-0 truncate text-[13px] font-medium text-highlighted" :class="label ? '' : 'font-mono'" :title="hint">
				{{ title }}
			</p>
			<UButton
				v-if="overridden"
				icon="i-ph-arrow-counter-clockwise-light"
				size="xs"
				color="neutral"
				variant="ghost"
				class="ml-auto"
				:aria-label="`Reset ${title} to the DMS default`"
				title="Back to the DMS default"
				@click="editor.resetVariable(name)"
			/>
			<UButton
				v-else-if="removable"
				icon="i-ph-x-light"
				size="xs"
				color="neutral"
				variant="ghost"
				class="ml-auto"
				:aria-label="`Remove ${title} from the list`"
				title="Take this variable off the list"
				@click="emit('remove')"
			/>
		</div>
		<p v-if="hint" class="-mt-1 text-xs text-muted">{{ hint }}</p>
		<div class="grid gap-2" :class="cells.length > 1 ? 'grid-cols-2' : 'grid-cols-1'">
			<div v-for="cell in cells" :key="cell" class="min-w-0" :data-theme-cell="`${name}:${cell}`">
				<UInput
					:model-value="draftValue(cell)"
					:placeholder="observedOf(cell)"
					:color="cellColor(cell)"
					:highlight="cellColor(cell) !== 'neutral'"
					:leading-icon="color || cell === 'shared' ? undefined : MODE_ICONS[cell]"
					size="sm"
					class="w-full"
					:ui="{ base: 'font-mono text-xs placeholder:text-muted' }"
					:aria-label="cellLabel(cell)"
					:title="draftValue(cell) || observedOf(cell)"
					@update:model-value="set(cell, $event)"
					@change="settle(cell)"
				>
					<template v-if="color" #leading>
						<label
							class="relative size-4 shrink-0 cursor-pointer rounded-sm ring ring-default focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-inverted"
							:style="{ background: shown(cell) || 'transparent' }"
						>
							<input
								type="color"
								class="absolute inset-0 size-full cursor-pointer opacity-0"
								:value="pickerValue(cell)"
								:aria-label="`${cellLabel(cell)}: pick a color`"
								@input="pick(cell, $event)"
							/>
						</label>
					</template>
				</UInput>
			</div>
		</div>
		<p v-if="problems.length" class="text-xs text-error">
			{{ problems.join(' ') }} It shows nowhere, and the theme cannot be saved with it.
		</p>
	</div>
</template>

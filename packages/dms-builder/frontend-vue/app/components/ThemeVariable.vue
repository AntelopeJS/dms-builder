<script setup lang="ts">
import { computed, useId } from 'vue'
import { THEME_MODES, useThemeEditor, variableProblem, type VariableSetName } from '../runtime/theme'
import { effectiveValue } from '../runtime/theme-preview'
import { THEME_MODE_OPTIONS, type ThemeVariableScope } from '../runtime/theme-catalog'
import type { ThemeMode } from '../runtime/types'

/**
 * A value typed as code: a corner, a font, or a variable the catalog does not
 * list. A catalog color set per mode is a ThemeColor row instead.
 */

const MODE_ICONS = Object.fromEntries(
	THEME_MODE_OPTIONS.map((entry) => [entry.value, entry.icon]),
) as Record<ThemeMode, string>

const props = defineProps<{
	name: string
	label?: string
	hint?: string
	scope: ThemeVariableScope
	removable?: boolean
	dmsDefaultValues: Partial<Record<ThemeMode, string>>
	/** A shared cell shows this mode's DMS default. */
	pageMode: ThemeMode
}>()

const emit = defineEmits<{
	remove: []
}>()

const editor = useThemeEditor()
const state = editor.state

const title = computed(() => props.label ?? props.name)
/** Id of the problems paragraph, which an invalid cell names in aria-describedby. */
const problemId = useId()

const cells = computed<VariableSetName[]>(() => (props.scope === 'shared' ? ['shared'] : THEME_MODES))

const overridden = computed(() =>
	(['shared', ...THEME_MODES] as VariableSetName[]).some(
		(cell) => props.name in (state.value.draft?.variables[cell] ?? {}),
	),
)

/** A mode cell falls back to the shared value. */
function draftValue(cell: VariableSetName): string {
	const variables = state.value.draft?.variables
	if (!variables) {
		return ''
	}
	return cell === 'shared' ? (variables.shared[props.name] ?? '') : (effectiveValue(variables, cell, props.name) ?? '')
}

function savedValue(cell: VariableSetName): string {
	const variables = state.value.baseline?.variables
	if (!variables) {
		return ''
	}
	return cell === 'shared' ? (variables.shared[props.name] ?? '') : (effectiveValue(variables, cell, props.name) ?? '')
}

function dmsDefaultOf(cell: VariableSetName): string {
	return (cell === 'shared' ? props.dmsDefaultValues[props.pageMode] : props.dmsDefaultValues[cell]) ?? ''
}

function problemOf(cell: VariableSetName): string | undefined {
	return variableProblem(props.name, draftValue(cell))
}

const problems = computed(() =>
	cells.value.flatMap((cell) => {
		const problem = problemOf(cell)
		return problem ? [`The ${cell === 'shared' ? '' : `${cell} `}value ${problem}.`] : []
	}),
)

function isChanged(cell: VariableSetName): boolean {
	return draftValue(cell) !== savedValue(cell)
}

function cellColor(cell: VariableSetName): 'error' | 'primary' | 'neutral' {
	if (problemOf(cell)) {
		return 'error'
	}
	return isChanged(cell) ? 'primary' : 'neutral'
}

function setCellValue(cell: VariableSetName, value: string | number): void {
	editor.setVariable(cell, props.name, String(value))
}

/** Trimmed as the save will, so the cell shows what gets written. */
function trimCellValue(cell: VariableSetName): void {
	const value = state.value.draft?.variables[cell][props.name]
	if (value !== undefined && value !== value.trim()) {
		editor.setVariable(cell, props.name, value.trim())
	}
}

function cellLabel(cell: VariableSetName): string {
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
					:placeholder="dmsDefaultOf(cell)"
					:color="cellColor(cell)"
					:highlight="cellColor(cell) !== 'neutral'"
					:leading-icon="cell === 'shared' ? undefined : MODE_ICONS[cell]"
					size="sm"
					class="w-full"
					:ui="{ base: 'font-mono text-xs placeholder:text-muted' }"
					:aria-label="cellLabel(cell)"
					:aria-invalid="problemOf(cell) ? true : undefined"
					:aria-describedby="problemOf(cell) ? problemId : undefined"
					:title="draftValue(cell) || dmsDefaultOf(cell)"
					@update:model-value="setCellValue(cell, $event)"
					@change="trimCellValue(cell)"
				/>
			</div>
		</div>
		<p v-if="problems.length" :id="problemId" class="text-xs text-error">
			{{ problems.join(' ') }} It shows nowhere, and the theme cannot be saved with it.
		</p>
	</div>
</template>

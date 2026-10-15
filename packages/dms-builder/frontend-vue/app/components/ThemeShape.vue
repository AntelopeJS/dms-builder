<script setup lang="ts">
import { computed } from 'vue'
import { useThemeEditor } from '../runtime/theme'
import { CORNER_PRESETS, FONT_PRESETS } from '../runtime/theme-catalog'

/**
 * The corners and the font as the simple mode sets them: a choice among a
 * few, written as the same variables the developer mode lists one by one.
 */

const RADIUS = '--ui-radius'
const CARD_RADIUS = '--dms-radius-card'
const FONT = '--font-sans'
const CUSTOM = 'custom'

const editor = useThemeEditor()
const state = editor.state

const shared = computed(() => state.value.draft?.variables.shared ?? {})

const corner = computed(() => {
	const radius = shared.value[RADIUS]
	const card = shared.value[CARD_RADIUS]
	const preset = CORNER_PRESETS.find((entry) =>
		entry.values ? entry.values.radius === radius && entry.values.card === card : radius === undefined && card === undefined,
	)
	return preset?.id ?? CUSTOM
})

const font = computed(() => {
	const stack = shared.value[FONT]
	return FONT_PRESETS.find((entry) => (entry.stack ?? undefined) === stack)?.id ?? CUSTOM
})

/** The choices, with the value set by hand named when it is none of them. */
function withCustom<T extends { id: string; label: string }>(entries: T[], current: string) {
	const items = entries.map((entry) => ({ label: entry.label, value: entry.id }))
	return current === CUSTOM ? [...items, { label: 'Custom', value: CUSTOM, disabled: true }] : items
}

const cornerItems = computed(() => withCustom(CORNER_PRESETS, corner.value))
const fontItems = computed(() => withCustom(FONT_PRESETS, font.value))

function setCorner(id: string | number): void {
	const preset = CORNER_PRESETS.find((entry) => entry.id === id)
	if (preset) {
		editor.setVariables('shared', {
			[RADIUS]: preset.values?.radius,
			[CARD_RADIUS]: preset.values?.card,
		})
	}
}

function setFont(id: string | number): void {
	const preset = FONT_PRESETS.find((entry) => entry.id === id)
	if (preset) {
		editor.setVariables('shared', { [FONT]: preset.stack ?? undefined })
	}
}
</script>

<template>
	<div class="flex flex-col gap-3">
		<div class="flex flex-col gap-1.5">
			<p class="text-[13px] font-medium text-highlighted">Corners</p>
			<DmsSegmented
				:model-value="corner"
				:items="cornerItems"
				size="sm"
				block
				aria-label="Corners"
				@update:model-value="setCorner($event)"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<p class="text-[13px] font-medium text-highlighted">Font</p>
			<DmsSegmented
				:model-value="font"
				:items="fontItems"
				size="sm"
				block
				aria-label="Font"
				@update:model-value="setFont($event)"
			/>
		</div>
	</div>
</template>

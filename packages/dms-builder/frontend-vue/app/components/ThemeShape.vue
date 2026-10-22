<script setup lang="ts">
import { computed } from 'vue'
import { useThemeEditor } from '../runtime/theme'
import { CORNER_PRESETS } from '../runtime/theme-catalog'

/** Simple-mode presets for the corners, written to the variables the developer mode lists. */

const RADIUS_VARIABLE = '--ui-radius'
const CARD_RADIUS_VARIABLE = '--dms-radius-card'
const CUSTOM = 'custom'

const editor = useThemeEditor()
const state = editor.state

const sharedVariables = computed(() => state.value.draft?.variables.shared ?? {})

const cornerPresetId = computed(() => {
	const radius = sharedVariables.value[RADIUS_VARIABLE]
	const cardRadius = sharedVariables.value[CARD_RADIUS_VARIABLE]
	const preset = CORNER_PRESETS.find((entry) =>
		entry.values
			? entry.values.radius === radius && entry.values.cardRadius === cardRadius
			: radius === undefined && cardRadius === undefined,
	)
	return preset?.id ?? CUSTOM
})

/** A disabled "Custom" item joins the presets when the current value matches none. */
const cornerItems = computed(() => {
	const items = CORNER_PRESETS.map((entry) => ({ label: entry.label, value: entry.id }))
	return cornerPresetId.value === CUSTOM ? [...items, { label: 'Custom', value: CUSTOM, disabled: true }] : items
})

function setCorner(id: string | number): void {
	const preset = CORNER_PRESETS.find((entry) => entry.id === id)
	if (preset) {
		editor.setVariables('shared', {
			[RADIUS_VARIABLE]: preset.values?.radius,
			[CARD_RADIUS_VARIABLE]: preset.values?.cardRadius,
		})
	}
}
</script>

<template>
	<div class="flex flex-col gap-1.5">
		<p class="text-[13px] font-medium text-highlighted">Corners</p>
		<DmsSegmented
			:model-value="cornerPresetId"
			:items="cornerItems"
			size="sm"
			block
			aria-label="Corners"
			@update:model-value="setCorner($event)"
		/>
	</div>
</template>

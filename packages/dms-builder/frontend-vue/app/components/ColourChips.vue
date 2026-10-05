<script setup lang="ts">
import { THEME_COLORS } from '../runtime/constants'
import { TREND_ACCENT } from '../runtime/figure-panel'

/**
 * A colour picked among the theme's, each named and drawn in itself; the trend's
 * own, when offered, leaves it to what the figure does — green up, red down.
 */
defineProps<{
	modelValue: unknown
	label: string
	/** Offer the trend's own colour first, under this name. */
	auto?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
	<div class="flex flex-col gap-1.5">
		<span class="text-sm text-muted">{{ label }}</span>
		<div role="group" :aria-label="label" class="flex flex-wrap gap-1">
			<UButton
				v-if="auto"
				:label="auto"
				color="neutral"
				size="xs"
				:variant="modelValue === TREND_ACCENT ? 'solid' : 'soft'"
				:aria-pressed="modelValue === TREND_ACCENT"
				@click="emit('update:modelValue', TREND_ACCENT)"
			/>
			<UButton
				v-for="colour in THEME_COLORS"
				:key="colour"
				:label="colour"
				:color="colour"
				size="xs"
				:variant="modelValue === colour ? 'solid' : 'soft'"
				:aria-pressed="modelValue === colour"
				@click="emit('update:modelValue', colour)"
			/>
		</div>
	</div>
</template>

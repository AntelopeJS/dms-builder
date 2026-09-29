<script setup lang="ts">
import { THEME_MODE_ENTRIES } from '../runtime/theme-catalog'

withDefaults(
	defineProps<{
		label: string
		/** Whether the rows below have a cell per mode to head. */
		modes?: boolean
	}>(),
	{ modes: true },
)
</script>

<template>
	<!-- Kept in sight while the rows scroll under it: a cell says nothing of
	its mode, and ten rows down nothing else does either. -->
	<div class="sticky top-0 z-10 flex flex-col gap-1 bg-default py-1">
		<p class="text-xs font-semibold uppercase tracking-wide text-dimmed">{{ label }}</p>
		<div v-if="modes" class="grid grid-cols-2 gap-2" aria-hidden="true">
			<p
				v-for="mode in THEME_MODE_ENTRIES"
				:key="mode.value"
				class="flex items-center gap-1 text-[11px] font-medium text-muted"
			>
				<UIcon :name="mode.icon" class="size-3.5" /> {{ mode.label }}
			</p>
		</div>
	</div>
</template>

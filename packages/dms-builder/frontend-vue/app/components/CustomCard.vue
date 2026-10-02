<script setup lang="ts">
import { PANEL_CARD } from '../runtime/form-panel'

/**
 * A part of a panel left to what the block does by itself until it is turned
 * on, the way a form's Custom submit is: a switch beside its title, a line
 * saying what off means, and its settings once it is on.
 */
defineProps<{
	title: string
	icon: string
	/** What the block does while the switch is off, after `Off:`. */
	off: string
	on: boolean
}>()
const emit = defineEmits<{ 'update:on': [on: boolean] }>()
</script>

<template>
	<section :class="PANEL_CARD" :aria-label="title">
		<div class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between gap-3">
				<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
					<UIcon :name="icon" class="size-4 text-primary" />
					{{ title }}
				</p>
				<USwitch
					:model-value="on"
					:aria-label="title"
					@update:model-value="emit('update:on', $event === true)"
				/>
			</div>
			<p class="text-[13px]/[18px] text-muted">Off: {{ off }}</p>
		</div>
		<div v-if="on" class="flex flex-col gap-3">
			<slot />
		</div>
	</section>
</template>

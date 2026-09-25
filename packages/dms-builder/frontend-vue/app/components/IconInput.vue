<script setup lang="ts">
import { computed } from 'vue'
import { ICON_PREFIXES } from '../runtime/constants'
import { isBundledIcon, useIconSearch } from '../runtime/icon-search'

const props = defineProps<{
	modelValue?: string
	placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string | undefined] }>()

const { query, results, searching, offline, reset } = useIconSearch()

const known = computed(() => isBundledIcon(props.modelValue))
const bundled = ICON_PREFIXES.map((prefix) => `i-${prefix}-*`).join(' and ')

function pick(name: string): void {
	emit('update:modelValue', name)
	reset()
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<UInput
			:model-value="modelValue"
			:icon="modelValue || 'i-ph-image'"
			:placeholder="placeholder ?? 'i-ph-file'"
			size="sm"
			@update:model-value="
				emit('update:modelValue', $event === '' ? undefined : String($event))
			"
		/>

		<UInput
			v-model="query"
			icon="i-ph-magnifying-glass"
			size="sm"
			placeholder="Search icons…"
			:loading="searching"
		/>

		<div v-if="results.length" class="grid grid-cols-8 gap-1">
			<UButton
				v-for="name in results"
				:key="name"
				:icon="name"
				size="sm"
				color="neutral"
				variant="outline"
				square
				block
				:title="name"
				@click="pick(name)"
			/>
		</div>

		<p v-if="offline" class="text-xs text-dimmed">
			Icon search is unavailable — type a name such as
			<code>i-ph-house</code> instead.
		</p>
		<p v-else-if="!known" class="text-xs text-warning">
			Only {{ bundled }} icons are bundled; this one will not render.
		</p>
	</div>
</template>

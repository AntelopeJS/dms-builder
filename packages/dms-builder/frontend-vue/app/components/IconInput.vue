<script setup lang="ts">
import { computed } from 'vue'
import { isBundledIcon, useIconSearch } from '../runtime/icon-search'

const props = defineProps<{
	modelValue?: string
	placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string | undefined] }>()

const { query, results, searching, offline, reset } = useIconSearch()

const known = computed(() => isBundledIcon(props.modelValue))

function pick(name: string): void {
	emit('update:modelValue', name)
	reset()
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<div class="flex items-center gap-2">
			<span
				class="flex size-8 shrink-0 items-center justify-center rounded-md border border-default"
			>
				<UIcon
					v-if="modelValue"
					:name="modelValue"
					class="size-4 text-default"
				/>
				<UIcon v-else name="i-ph-image" class="size-4 text-dimmed" />
			</span>
			<UInput
				:model-value="modelValue"
				:placeholder="placeholder ?? 'i-ph-file'"
				size="sm"
				class="flex-1"
				@update:model-value="
					emit('update:modelValue', $event === '' ? undefined : String($event))
				"
			/>
		</div>

		<UInput
			v-model="query"
			icon="i-ph-magnifying-glass"
			size="sm"
			placeholder="Search Phosphor and Lucide…"
			:loading="searching"
		/>

		<div v-if="results.length" class="grid grid-cols-8 gap-1">
			<button
				v-for="name in results"
				:key="name"
				type="button"
				class="flex items-center justify-center rounded-md border border-default p-1.5 hover:border-primary hover:text-primary"
				:title="name"
				@click="pick(name)"
			>
				<UIcon :name="name" class="size-4" />
			</button>
		</div>

		<p v-if="offline" class="text-xs text-dimmed">
			Icon search is unavailable — type a name such as
			<code>i-ph-house</code> instead.
		</p>
		<p v-else-if="!known" class="text-xs text-warning">
			Only <code>i-ph-*</code> and <code>i-lucide-*</code> icons are bundled;
			this one will not render.
		</p>
	</div>
</template>

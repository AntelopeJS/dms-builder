<script setup lang="ts">
import { onErrorCaptured, ref, watch } from 'vue'

/**
 * Contains a block that throws while rendering.
 *
 * The canvas renders the DMS's real components, and one of them failing during
 * setup would otherwise abort Vue's whole update — leaving the config panel
 * showing stale values, with no way to fix the very option that caused it. A
 * half-configured block is a normal state in a builder, so the block reports
 * itself and the rest of the page keeps working.
 */
const props = defineProps<{ label: string; resetKey: unknown }>()

const failure = ref<string | null>(null)

onErrorCaptured((error) => {
	failure.value = error instanceof Error ? error.message : String(error)
	// Stop here: the error is shown in place, and letting it travel further
	// would abort the update this boundary exists to protect.
	return false
})

// A new configuration deserves another attempt.
watch(
	() => props.resetKey,
	() => {
		failure.value = null
	},
)
</script>

<template>
	<div
		v-if="failure"
		class="flex flex-col gap-1 rounded-md border border-dashed border-error/50 bg-error/5 p-4 text-xs"
	>
		<span class="font-medium text-error">
			{{ props.label }} cannot render yet
		</span>
		<span class="text-toned">{{ failure }}</span>
		<span class="text-dimmed">
			Finish configuring it, or remove it — the rest of the page is unaffected.
		</span>
	</div>
	<slot v-else />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBuilder } from '../runtime/session'
import type { PageDraft } from '../runtime/types'

const builder = useBuilder()
const draftText = computed(() =>
	JSON.stringify(builder.session.value.draft ?? {}, null, 2),
)
const input = ref('')
const error = ref<string | null>(null)

function apply(): void {
	try {
		const parsed = JSON.parse(input.value) as PageDraft
		if (!Array.isArray(parsed.blocks)) {
			error.value = 'The payload needs a "blocks" array.'
			return
		}
		builder.setDraft(parsed)
		error.value = null
		builder.notify('Configuration applied')
	} catch (parseError) {
		error.value =
			parseError instanceof Error ? parseError.message : String(parseError)
	}
}

async function copy(): Promise<void> {
	await navigator.clipboard?.writeText(draftText.value)
	builder.notify('Copied to the clipboard')
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-2">
			<p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
				Export
			</p>
			<pre
				class="max-h-64 overflow-auto rounded-md border border-default bg-elevated p-3 font-mono text-xs text-muted"
			>{{ draftText }}</pre>
			<UButton
				icon="i-ph-copy"
				size="xs"
				color="neutral"
				variant="outline"
				label="Copy the JSON"
				@click="copy"
			/>
		</div>

		<div class="flex flex-col gap-2 border-t border-default pt-4">
			<p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
				Import
			</p>
			<UTextarea
				v-model="input"
				:rows="6"
				class="font-mono text-xs"
				placeholder='{ "blocks": [ … ] }'
			/>
			<p v-if="error" class="text-xs text-error">{{ error }}</p>
			<UButton
				size="xs"
				color="primary"
				label="Replace the page"
				:disabled="!input.trim()"
				@click="apply"
			/>
		</div>
	</div>
</template>

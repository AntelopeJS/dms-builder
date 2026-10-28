<script setup lang="ts">
import { computed } from 'vue'
import { type DiffTone, diffRows } from '../runtime/diff-rows'
import type { FileChange } from '../runtime/types'

/**
 * The files an operation writes, or would write, each with its diff: what the
 * integrator reads before confirming a change to the project's configuration.
 * Unchanged lines between two changes are left out, and the gap says so in a
 * colour of its own, so two changes never read as one.
 */

const props = defineProps<{ changes: FileChange[] }>()

const KIND_LABELS: Record<string, string> = {
	create: 'New file',
	modify: 'Changed',
	delete: 'Removed',
}

const TONE_CLASSES: Record<DiffTone, string> = {
	added: 'bg-success/10 text-success',
	removed: 'bg-error/10 text-error',
	context: 'text-toned',
	note: 'text-muted italic',
}

function gapLabel(hidden: number): string {
	return `⋯ ${hidden} unchanged ${hidden === 1 ? 'line' : 'lines'}`
}

const files = computed(() =>
	props.changes.map((change) => ({
		...change,
		label: KIND_LABELS[change.kind] ?? change.kind,
		rows: diffRows(change.diff),
	})),
)
</script>

<template>
	<div class="flex flex-col gap-3">
		<p v-if="!files.length" class="text-xs text-muted">Nothing would change.</p>
		<section
			v-for="file in files"
			:key="file.path"
			class="overflow-hidden rounded-md border border-default"
		>
			<header class="flex items-center gap-2 border-b border-default bg-elevated px-3 py-1.5">
				<UBadge color="neutral" variant="subtle" size="sm">{{ file.label }}</UBadge>
				<span class="truncate font-mono text-xs text-highlighted">{{ file.path }}</span>
			</header>
			<pre class="max-h-80 overflow-auto p-0 text-[11.5px] leading-5"><code><template
				v-for="(row, index) in file.rows"
				:key="index"
			><span
				v-if="row.kind === 'gap'"
				class="block border-y border-info/30 bg-info/10 px-3 font-sans font-medium text-info"
				data-diff-gap
			>{{ gapLabel(row.hidden) }}</span><span
				v-else
				class="block px-3"
				:class="TONE_CLASSES[row.tone]"
			>{{ row.text || ' ' }}</span></template></code></pre>
		</section>
	</div>
</template>

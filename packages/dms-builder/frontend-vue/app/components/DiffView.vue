<script setup lang="ts">
import { computed } from 'vue'
import type { FileChange } from '../runtime/types'

/**
 * The files an operation writes, or would write, each with its diff: what the
 * integrator reads before confirming a change to the project's configuration.
 */

const props = defineProps<{ changes: FileChange[] }>()

const KIND_LABELS: Record<string, string> = {
	create: 'New file',
	modify: 'Changed',
	delete: 'Removed',
}

function lineClass(line: string): string {
	if (line.startsWith('+') && !line.startsWith('+++')) return 'bg-success/10 text-success'
	if (line.startsWith('-') && !line.startsWith('---')) return 'bg-error/10 text-error'
	if (line.startsWith('@@')) return 'text-muted'
	return 'text-toned'
}

const files = computed(() =>
	props.changes.map((change) => ({
		...change,
		label: KIND_LABELS[change.kind] ?? change.kind,
		lines: change.diff.split('\n'),
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
			<pre class="max-h-80 overflow-auto p-0 text-[11.5px] leading-5"><code><span
				v-for="(line, index) in file.lines"
				:key="index"
				class="block px-3"
				:class="lineClass(line)"
			>{{ line || ' ' }}</span></code></pre>
		</section>
	</div>
</template>

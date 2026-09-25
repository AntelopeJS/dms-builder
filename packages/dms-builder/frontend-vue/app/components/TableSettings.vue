<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBuilder } from '../runtime/session'

const props = defineProps<{ resource: string; readBy: number }>()

const builder = useBuilder()
const session = builder.session

/**
 * What the author typed to confirm. Deleting a table takes every row in it,
 * with no undo, so the button waits on its name rather than on a second click
 * someone can make by reflex.
 */
const typed = ref('')
const deleting = ref(false)

const structure = computed(() => session.value.resourceStructures[props.resource])
const confirmed = computed(() => typed.value.trim() === props.resource)
const blocks = computed(
	() => `${props.readBy} block${props.readBy === 1 ? '' : 's'}`,
)
const about = computed(() => [
	{ label: 'Key', value: props.resource, mono: true },
	{ label: 'Database table', value: structure.value?.tableName, mono: true },
	{ label: 'API', value: structure.value?.route, mono: true },
	{ label: 'Read on this page by', value: blocks.value, mono: false },
])

watch(
	() => props.resource,
	() => {
		typed.value = ''
	},
)

async function remove(): Promise<void> {
	if (!confirmed.value || deleting.value) return
	deleting.value = true
	try {
		if (await builder.deleteResource(props.resource)) {
			session.value.table = null
		}
	} finally {
		deleting.value = false
	}
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="overflow-hidden rounded-lg border border-default">
			<div class="flex h-9 items-center bg-elevated px-3">
				<span class="text-xs font-semibold text-toned">About this table</span>
			</div>
			<div
				v-for="entry in about"
				:key="entry.label"
				class="flex h-10 items-center justify-between gap-4 border-t border-default px-3"
			>
				<span class="text-sm text-muted">{{ entry.label }}</span>
				<span
					class="truncate text-default"
					:class="entry.mono ? 'font-mono text-xs' : 'text-sm'"
				>
					{{ entry.value }}
				</span>
			</div>
		</div>

		<UAlert
			color="error"
			variant="subtle"
			icon="i-ph-warning"
			title="Delete this table"
		>
			<template #description>
				Removes <span class="font-mono">{{ structure?.tableName }}</span>, its
				API and <b>every row it holds</b>. There is no undo, and it happens now,
				not on Save.
				<template v-if="readBy">
					{{ blocks }} on this page read from it.
				</template>
			</template>
			<template #actions>
				<UFormField :label="`Type ${resource} to confirm`" class="w-full">
					<UInput
						v-model="typed"
						:placeholder="resource"
						color="error"
						autocomplete="off"
						class="w-full font-mono"
						@keydown.enter="remove"
					/>
				</UFormField>
				<UButton
					icon="i-ph-trash"
					color="error"
					label="Delete the table and its rows"
					:disabled="!confirmed"
					:loading="deleting"
					@click="remove"
				/>
			</template>
		</UAlert>
	</div>
</template>

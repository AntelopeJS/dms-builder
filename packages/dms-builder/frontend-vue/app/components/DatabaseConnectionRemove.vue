<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { refusalText } from '../runtime/database-connect'
import type { ConnectionInfo } from '../runtime/database-types'
import type { FileChange } from '../runtime/types'

/**
 * *Remove*: what taking the connection out of the project changes, then the
 * change itself. Its tables module goes with it, folder included.
 */

const props = defineProps<{ connection: string; info: ConnectionInfo }>()
const emit = defineEmits<{ close: []; removed: [connection: string] }>()

const api = useBuilderApi()

const preview = ref<FileChange[] | null>(null)
const busy = ref(false)
const problem = ref('')
const removed = ref(false)

const folders = computed(() =>
	props.info.wiring.modules.map((module) => module.path),
)
const moduleNames = computed(() => props.info.wiring.modules.map((module) => module.id))

async function plan(): Promise<void> {
	busy.value = true
	problem.value = ''
	const result = await api.removeConnection(props.connection, {
		dryRun: true,
	})
	busy.value = false
	if (!result.ok) {
		problem.value = refusalText(result.error)
		preview.value = null
		return
	}
	preview.value = result.changes
}

async function remove(): Promise<void> {
	busy.value = true
	problem.value = ''
	const result = await api.removeConnection(props.connection, {
		dryRun: false,
	})
	busy.value = false
	if (!result.ok) {
		problem.value = refusalText(result.error)
		return
	}
	removed.value = true
}

onMounted(plan)
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
		<header>
			<p class="text-xl font-semibold tracking-tight text-highlighted">Remove {{ connection }}</p>
			<p class="text-xs text-muted">Takes the database out of the project. The database itself is not touched.</p>
		</header>

		<template v-if="!removed">
			<div class="flex flex-col gap-1.5 text-sm text-default">
				<p class="font-semibold text-highlighted">Removing will:</p>
				<ul class="ml-4 list-disc text-xs leading-relaxed">
					<li>
						remove the driver <span class="font-mono">{{ info.wiring.driver }}</span>
						<template v-if="moduleNames.length">
							and the module <span class="font-mono">{{ moduleNames.join(', ') }}</span>
						</template>
						from <span class="font-mono">antelope.config.ts</span>, so its pages are no longer served;
					</li>
					<li v-if="folders.length">
						delete <span class="font-mono">{{ folders.join(', ') }}</span>, with the tables and pages written
						there;
					</li>
					<li>remove the <span class="font-mono">{{ connection }}</span> connection of the builder and dms-ai;</li>
					<li v-if="info.wiring.variable">
						remove <span class="font-mono">{{ info.wiring.variable }}</span> from
						<span class="font-mono">envOverrides</span> and <span class="font-mono">.env</span>.
					</li>
				</ul>
			</div>

			<p v-if="problem" class="text-xs text-error">{{ problem }}</p>

			<div class="flex items-center gap-2">
				<UButton
					:label="busy ? 'Removing…' : `Remove ${connection}`"
					color="error"
					:disabled="busy || !preview"
					@click="remove"
				/>
				<UButton label="Cancel" color="neutral" variant="ghost" @click="emit('close')" />
			</div>

			<DmsBuilderFoldCard v-if="preview" icon="i-ph-file-text" title="The changes" :summary="`${preview.length} files`">
				<DmsBuilderDiffView :changes="preview" />
			</DmsBuilderFoldCard>
		</template>

		<div
			v-else
			class="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-toned"
			data-connection-removed
		>
			<p><b class="font-semibold text-highlighted">Removed. Restart the project.</b></p>
			<div>
				<UButton label="Done" size="sm" @click="emit('removed', connection)" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { refusalText } from '../runtime/database-connect'
import type { ConnectionInfo } from '../runtime/database-types'
import { t } from '../runtime/i18n'
import type { FileChange } from '../runtime/types'

/**
 * *Remove*: what taking the connection out of the project changes, then the
 * change itself. Its tables module goes with it, folder included, and its driver
 * when nothing else uses it.
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
const kept = computed(() => props.info.wiring.unrecorded.map((module) => module.id))
const removeModules = computed(() => {
	const { ownsDriver, driver } = props.info.wiring
	const modules = moduleNames.value.join(', ')
	if (ownsDriver && modules) return t('database.remove.driver_and_modules', { driver, modules })
	return ownsDriver ? t('database.remove.driver', { driver }) : t('database.remove.modules', { modules })
})

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
	emit('removed', props.connection)
}

onMounted(plan)
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
		<header>
			<p class="text-xl font-semibold tracking-tight text-highlighted">{{ t('database.remove.title', { connection }) }}</p>
			<p class="text-xs text-muted">{{ t('database.remove.intro') }}</p>
		</header>

		<template v-if="!removed">
			<div class="flex flex-col gap-1.5 text-sm text-default">
				<p class="font-semibold text-highlighted">{{ t('database.remove.will') }}</p>
				<ul class="ml-4 list-disc text-xs leading-relaxed">
					<li v-if="info.wiring.ownsDriver || moduleNames.length">
						{{ removeModules }}
					</li>
					<li v-if="!info.wiring.ownsDriver">
						{{ t('database.remove.keep_driver', { driver: info.wiring.driver }) }}
					</li>
					<li v-if="kept.length">
						{{ t('database.remove.keep_modules', { modules: kept.join(', ') }) }}
					</li>
					<li v-if="folders.length">
						{{ t('database.remove.delete_folders', { folders: folders.join(', ') }) }}
					</li>
					<li>{{ t('database.remove.remove_connection', { connection }) }}</li>
					<li v-if="info.wiring.ownsDriver && info.wiring.variables.length">
						{{ t('database.remove.remove_variables', { variables: info.wiring.variables.join(', ') }) }}
					</li>
				</ul>
			</div>

			<p v-if="problem" class="text-xs text-error">{{ problem }}</p>

			<div class="flex items-center gap-2">
				<UButton
					:label="busy ? t('database.remove.removing') : t('database.remove.action', { connection })"
					color="error"
					:disabled="busy || !preview"
					@click="remove"
				/>
				<UButton :label="t('database.connect.cancel')" color="neutral" variant="ghost" @click="emit('close')" />
			</div>

			<DmsBuilderFoldCard v-if="preview" icon="i-ph-file-text" :title="t('database.remove.changes')" :summary="t('database.remove.files', {}, preview.length)">
				<DmsBuilderDiffView :changes="preview" />
			</DmsBuilderFoldCard>
		</template>

		<div
			v-else
			class="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-toned"
			data-connection-removed
		>
			<p><b class="font-semibold text-highlighted">{{ t('database.remove.removed') }}</b></p>
			<div>
				<UButton :label="t('database.remove.done')" size="sm" @click="emit('close')" />
			</div>
		</div>
	</div>
</template>

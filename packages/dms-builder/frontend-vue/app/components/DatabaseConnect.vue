<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { connectSteps, type ConnectForm } from '../runtime/database'
import type { FileChange } from '../runtime/types'

/**
 * *Connect a database*: the names the wiring needs, the diff of what it writes
 * to `antelope.config.ts`, and the URL, which goes into the git-ignored `.env`
 * and nowhere else. The project restarts once afterwards.
 */

const emit = defineEmits<{ cancel: []; connected: [connection: string] }>()

const api = useBuilderApi()

const form = reactive<ConnectForm>({
	connection: 'erp',
	providerModule: 'postgres-erp',
	generatedModule: 'erp-tables',
	variable: 'ERP_DATABASE_URL',
	postgresVersion: '',
	dmsPinned: false,
	withDmsAi: true,
})
const url = ref('')
const preview = ref<FileChange[] | null>(null)
const busy = ref(false)
const problem = ref('')
const written = ref(false)

watch(form, () => {
	preview.value = null
}, { deep: true })

const complete = computed(
	() =>
		[form.connection, form.providerModule, form.generatedModule, form.variable, form.postgresVersion]
			.every((value) => value.trim() !== ''),
)

function refusal(result: { ok: false; error: unknown }): string {
	return JSON.stringify(result.error)
}

async function showDiff(): Promise<void> {
	busy.value = true
	problem.value = ''
	const result = await api.configureProject(connectSteps(form), true)
	busy.value = false
	if (!result.ok) {
		problem.value = refusal(result)
		preview.value = null
		return
	}
	preview.value = result.changes
}

async function write(): Promise<void> {
	busy.value = true
	problem.value = ''
	const result = await api.configureProject(connectSteps(form), false)
	if (!result.ok) {
		busy.value = false
		problem.value = refusal(result)
		return
	}
	if (url.value.trim()) {
		const set = await api.setVariable(form.variable, url.value.trim()).catch((error: unknown) => ({
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		}))
		url.value = ''
		if (!set.ok) {
			problem.value = `The configuration is written, but ${form.variable} is not: ${set.message ?? 'refused'}. Set it in .env.`
		}
	}
	busy.value = false
	written.value = true
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
		<header>
			<p class="text-xl font-semibold tracking-tight text-highlighted">Connect a database</p>
			<p class="text-xs text-muted">
				Wires a client's database into the project: a postgres module in external mode,
				a module for its tables, and a catalog connection for the builder.
			</p>
		</header>

		<template v-if="!written">
			<div class="grid grid-cols-2 gap-3">
				<UFormField label="Connection" help="The name pages and routes use.">
					<UInput v-model="form.connection" class="w-full" />
				</UFormField>
				<UFormField label="Postgres version" help="The range of @antelopejs-private/postgres to install.">
					<UInput v-model="form.postgresVersion" placeholder="^0.1.4" class="w-full" />
				</UFormField>
				<UFormField label="Provider module">
					<UInput v-model="form.providerModule" class="w-full" />
				</UFormField>
				<UFormField label="Module for its tables">
					<UInput v-model="form.generatedModule" class="w-full" />
				</UFormField>
				<UFormField label="Variable" help="Holds the URL in each environment.">
					<UInput v-model="form.variable" class="w-full font-mono" />
				</UFormField>
				<UFormField
					label="URL, for development"
					help="Written into .env, which git must ignore. Never into the configuration."
				>
					<UInput v-model="url" type="password" autocomplete="off" class="w-full font-mono" />
				</UFormField>
			</div>
			<div class="flex flex-col gap-2">
				<UCheckbox v-model="form.dmsPinned" label="The DMS modules are already pinned to their database" />
				<UCheckbox v-model="form.withDmsAi" label="Give dms-ai a connection too" />
			</div>

			<p v-if="problem" class="text-xs text-error">{{ problem }}</p>

			<div class="flex gap-2">
				<UButton label="Show the changes" variant="soft" :disabled="!complete || busy" @click="showDiff" />
				<UButton label="Write them" :disabled="!complete || busy || !preview" @click="write" />
				<UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
			</div>

			<DmsBuilderDiffView v-if="preview" :changes="preview" />
		</template>

		<div
			v-else
			class="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-toned"
		>
			<p><b class="font-semibold text-highlighted">Written. Restart the project.</b></p>
			<p>
				The connection exists once the project restarts. Every deployed environment sets
				<span class="font-mono">{{ form.variable }}</span> where it keeps its secrets, never in git.
			</p>
			<p v-if="problem" class="text-error">{{ problem }}</p>
			<div>
				<UButton label="Done" size="sm" @click="emit('connected', form.connection)" />
			</div>
		</div>
	</div>
</template>

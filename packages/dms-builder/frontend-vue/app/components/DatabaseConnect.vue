<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { connectSteps, type ConnectForm, type DatabaseEngine, ENGINES } from '../runtime/database'
import type { FileChange } from '../runtime/types'

/**
 * *Connect a database*: the names the wiring needs, the diff of what it writes
 * to `antelope.config.ts`, and the URL, which goes into the git-ignored `.env`
 * and nowhere else. The project restarts once afterwards.
 */

const emit = defineEmits<{ cancel: []; connected: [connection: string] }>()

const api = useBuilderApi()

const form = reactive<ConnectForm>({
	engine: 'postgres',
	connection: 'erp',
	providerModule: ENGINES.postgres.providerModule,
	generatedModule: 'erp-tables',
	variable: 'ERP_DATABASE_URL',
	databaseVariable: 'ERP_DATABASE_NAME',
	version: '',
	dmsPinned: false,
	withDmsAi: true,
})
const engines = (Object.keys(ENGINES) as DatabaseEngine[]).map((engine) => ({
	value: engine,
	label: ENGINES[engine].title,
}))
const wiring = computed(() => ENGINES[form.engine])

watch(() => form.engine, (engine, previous) => {
	if (form.providerModule === ENGINES[previous].providerModule) {
		form.providerModule = ENGINES[engine].providerModule
	}
})
const url = ref('')
const databaseName = ref('')
const preview = ref<FileChange[] | null>(null)
const busy = ref(false)
const problem = ref('')
const written = ref(false)

watch(form, () => {
	preview.value = null
}, { deep: true })

const complete = computed(
	() =>
		[
			form.connection,
			form.providerModule,
			form.generatedModule,
			form.variable,
			form.version,
			...(wiring.value.separateDatabase ? [form.databaseVariable] : []),
		].every((value) => value.trim() !== ''),
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
	const values: [string, string][] = [
		[form.variable, url.value.trim()],
		...(wiring.value.separateDatabase ? [[form.databaseVariable, databaseName.value.trim()] as [string, string]] : []),
	]
	url.value = ''
	const unset = await setVariables(values.filter(([, value]) => value !== ''))
	if (unset.length > 0) {
		problem.value = `The configuration is written, but not ${unset.join('; ')}. Set ${unset.length > 1 ? 'them' : 'it'} in .env.`
	}
	busy.value = false
	written.value = true
}

/** Writes each variable into .env, and answers the ones refused with why. */
async function setVariables(values: [string, string][]): Promise<string[]> {
	const unset: string[] = []
	for (const [variable, value] of values) {
		const set = await api.setVariable(variable, value).catch((error: unknown) => ({
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		}))
		if (!set.ok) {
			unset.push(`${variable} (${set.message ?? 'refused'})`)
		}
	}
	return unset
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
		<header>
			<p class="text-xl font-semibold tracking-tight text-highlighted">Connect a database</p>
			<p class="text-xs text-muted">
				Wires a client's database into the project: its engine's module in external mode,
				a module for its tables and collections, and a catalog connection for the builder.
			</p>
		</header>

		<template v-if="!written">
			<div class="grid grid-cols-2 gap-3">
				<UFormField label="Engine">
					<USelect v-model="form.engine" :items="engines" class="w-full" />
				</UFormField>
				<UFormField label="Connection" help="The name pages and routes use.">
					<UInput v-model="form.connection" class="w-full" />
				</UFormField>
				<UFormField label="Version" :help="`The range of ${wiring.package} to install.`">
					<UInput v-model="form.version" :placeholder="wiring.versionExample" class="w-full" />
				</UFormField>
				<UFormField label="Provider module">
					<UInput v-model="form.providerModule" class="w-full" />
				</UFormField>
				<UFormField label="Module it maps into">
					<UInput v-model="form.generatedModule" class="w-full" />
				</UFormField>
				<UFormField label="Variable" help="Holds the URL in each environment.">
					<UInput v-model="form.variable" class="w-full font-mono" />
				</UFormField>
				<UFormField
					v-if="wiring.separateDatabase"
					label="Database variable"
					help="Holds the database name in each environment."
				>
					<UInput v-model="form.databaseVariable" class="w-full font-mono" />
				</UFormField>
				<UFormField
					v-if="wiring.separateDatabase"
					label="Database name, for development"
					help="Written into .env beside the URL."
				>
					<UInput v-model="databaseName" autocomplete="off" placeholder="erp" class="w-full font-mono" />
				</UFormField>
				<UFormField
					label="URL, for development"
					help="Written into .env, which git must ignore. Never into the configuration."
				>
					<UInput
						v-model="url"
						type="password"
						autocomplete="off"
						:placeholder="wiring.urlExample"
						class="w-full font-mono"
					/>
				</UFormField>
			</div>
			<p class="text-xs text-muted">{{ wiring.accountAdvice }}</p>
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
				<span class="font-mono">{{ form.variable }}</span> where it keeps its secrets, never in git<template
					v-if="wiring.separateDatabase"
				>, and <span class="font-mono">{{ form.databaseVariable }}</span> to its database</template>.
			</p>
			<p v-if="problem" class="text-error">{{ problem }}</p>
			<div>
				<UButton label="Done" size="sm" @click="emit('connected', form.connection)" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import {
	type ConnectForm,
	type DatabaseEngine,
	ENGINES,
	type ManagedNames,
	connectSteps,
	connectionId,
	connectionUrl,
	defaultNames,
	emptyFields,
	isConnectionUrl,
	managedNames,
	missingField,
	parseConnectionUrl,
} from '../runtime/database-connect'
import type { FileChange } from '../runtime/types'

/**
 * *Connect a database*: a name, the database's type and how to reach it. The
 * modules and the variable the builder manages follow the name, under *Advanced
 * settings*. The URL goes into the git-ignored `.env` and nowhere else; the
 * project restarts once afterwards.
 */

const emit = defineEmits<{ cancel: []; connected: [connection: string] }>()

const api = useBuilderApi()

const ENGINE_ITEMS = Object.entries(ENGINES).map(([value, spec]) => ({ label: spec.label, value }))

const form = reactive<ConnectForm>({
	name: '',
	engine: 'postgres',
	fields: emptyFields('postgres'),
	overrides: {},
})
const projectModules = ref<string[]>([])
const pasted = ref('')
const pasteProblem = ref('')
const preview = ref<FileChange[] | null>(null)
const busy = ref(false)
const problem = ref('')
const written = ref(false)

onMounted(async () => {
	try {
		projectModules.value = (await api.projectModules()).modules
	} catch (error) {
		problem.value = `The project's modules could not be read: ${error instanceof Error ? error.message : String(error)}`
	}
})

watch(form, () => {
	preview.value = null
}, { deep: true })

const id = computed(() => connectionId(form.name))
const names = computed(() => managedNames(form))
const defaults = computed(() => defaultNames(form.name, form.engine))
const missing = computed(() => missingField(form))
const extraOptions = computed(() => Object.entries(form.fields.options))

function setName(key: keyof ManagedNames, value: string): void {
	if (value === defaults.value[key]) {
		delete form.overrides[key]
		return
	}
	form.overrides[key] = value
}

function setEngine(engine: DatabaseEngine): void {
	form.engine = engine
	form.fields = emptyFields(engine)
}

function applyUrl(text: string): boolean {
	try {
		form.fields = parseConnectionUrl(form.engine, text)
		pasteProblem.value = ''
		return true
	} catch (error) {
		pasteProblem.value = `This URL could not be read: ${error instanceof Error ? error.message : String(error)}`
		return false
	}
}

function pasteUrl(): void {
	if (pasted.value.trim() && applyUrl(pasted.value)) {
		pasted.value = ''
	}
}

function pasteIntoHost(event: ClipboardEvent): void {
	const text = event.clipboardData?.getData('text') ?? ''
	if (!isConnectionUrl(form.engine, text)) {
		return
	}
	event.preventDefault()
	applyUrl(text)
}

function refusal(result: { ok: false; error: unknown }): string {
	return JSON.stringify(result.error)
}

async function showDiff(): Promise<void> {
	busy.value = true
	problem.value = ''
	const result = await api.configureProject(connectSteps(form, projectModules.value), true)
	busy.value = false
	if (!result.ok) {
		problem.value = refusal(result)
		preview.value = null
		return
	}
	preview.value = result.changes
}

async function writeVariable(): Promise<void> {
	const variable = names.value.variable
	const set = await api
		.setVariable(variable, connectionUrl(form.engine, form.fields))
		.catch((error: unknown) => ({
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		}))
	form.fields.password = ''
	if (!set.ok) {
		problem.value = `The configuration is written, but ${variable} is not: ${set.message ?? 'refused'}. Set it in .env.`
	}
}

async function write(): Promise<void> {
	busy.value = true
	problem.value = ''
	const result = await api.configureProject(connectSteps(form, projectModules.value), false)
	if (!result.ok) {
		busy.value = false
		problem.value = refusal(result)
		return
	}
	await writeVariable()
	busy.value = false
	written.value = true
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
		<header>
			<p class="text-xl font-semibold tracking-tight text-highlighted">Connect a database</p>
			<p class="text-xs text-muted">
				Wires an existing database into the project, so its tables can be mapped into pages.
			</p>
		</header>

		<template v-if="!written">
			<div class="grid grid-cols-2 gap-3">
				<UFormField
					label="Name"
					:help="id && id !== form.name ? `Used as ${id}` : 'Names the connection in the builder and dms-ai.'"
				>
					<UInput v-model="form.name" placeholder="erp" class="w-full" />
				</UFormField>
				<UFormField label="Database type">
					<USelect
						:model-value="form.engine"
						:items="ENGINE_ITEMS"
						class="w-full"
						@update:model-value="setEngine($event as DatabaseEngine)"
					/>
				</UFormField>
			</div>

			<section class="flex flex-col gap-3 rounded-md border border-default p-3">
				<p class="text-sm font-semibold text-highlighted">Connection</p>
				<div class="flex gap-2">
					<UInput
						v-model="pasted"
						type="password"
						autocomplete="off"
						:placeholder="`Paste a ${ENGINES[form.engine].schemes[0]}// URL to fill the fields`"
						class="flex-1 font-mono"
						@keydown.enter="pasteUrl"
					/>
					<UButton label="Fill in" variant="soft" :disabled="!pasted.trim()" @click="pasteUrl" />
				</div>
				<p v-if="pasteProblem" class="text-xs text-error">{{ pasteProblem }}</p>
				<div class="grid grid-cols-[1fr_8rem] gap-3">
					<UFormField label="Host">
						<UInput v-model="form.fields.host" class="w-full font-mono" @paste="pasteIntoHost" />
					</UFormField>
					<UFormField label="Port">
						<UInput v-model="form.fields.port" inputmode="numeric" class="w-full font-mono" />
					</UFormField>
				</div>
				<div class="grid grid-cols-3 gap-3">
					<UFormField label="Database">
						<UInput v-model="form.fields.database" class="w-full font-mono" />
					</UFormField>
					<UFormField label="User">
						<UInput v-model="form.fields.user" autocomplete="off" class="w-full font-mono" />
					</UFormField>
					<UFormField label="Password">
						<UInput
							v-model="form.fields.password"
							type="password"
							autocomplete="new-password"
							class="w-full font-mono"
						/>
					</UFormField>
				</div>
				<div class="flex items-center gap-3">
					<USwitch v-model="form.fields.ssl" aria-label="Connect over SSL" />
					<span class="text-sm text-default">Connect over SSL</span>
				</div>
				<p v-if="extraOptions.length" class="text-xs text-muted">
					Other options, kept from the pasted URL:
					<span class="font-mono">{{ extraOptions.map(([key, value]) => `${key}=${value}`).join(', ') }}</span>
				</p>
				<p class="text-xs text-muted">
					Written into the project's <span class="font-mono">.env</span> as
					<span class="font-mono">{{ names.variable }}</span>, never into the configuration.
				</p>
			</section>

			<DmsBuilderFoldCard
				icon="i-ph-gear-six"
				title="Advanced settings"
				:summary="`${names.driverModule}, ${names.tablesModule}, ${names.variable}`"
			>
				<div class="grid grid-cols-2 gap-3">
					<UFormField label="Driver module" :help="`The ${ENGINES[form.engine].package} instance that connects to this database.`">
						<UInput
							:model-value="names.driverModule"
							class="w-full font-mono"
							@update:model-value="setName('driverModule', String($event))"
						/>
					</UFormField>
					<UFormField label="Package version" :help="`The range of ${ENGINES[form.engine].package} to install.`">
						<UInput
							:model-value="names.version"
							class="w-full font-mono"
							@update:model-value="setName('version', String($event))"
						/>
					</UFormField>
					<UFormField label="Tables module" help="The module the database's tables and pages are written into.">
						<UInput
							:model-value="names.tablesModule"
							class="w-full font-mono"
							@update:model-value="setName('tablesModule', String($event))"
						/>
					</UFormField>
					<UFormField label="Variable" help="Holds the URL in each environment.">
						<UInput
							:model-value="names.variable"
							class="w-full font-mono"
							@update:model-value="setName('variable', String($event))"
						/>
					</UFormField>
				</div>
			</DmsBuilderFoldCard>

			<p v-if="problem" class="text-xs text-error">{{ problem }}</p>

			<div class="flex items-center gap-2">
				<UButton label="Show the changes" variant="soft" :disabled="!!missing || busy" @click="showDiff" />
				<UButton label="Write them" :disabled="!!missing || busy || !preview" @click="write" />
				<UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
				<span v-if="missing" class="text-xs text-muted">Needs {{ missing }}.</span>
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
				<span class="font-mono">{{ names.variable }}</span> where it keeps its secrets, never in git.
			</p>
			<p v-if="problem" class="text-error">{{ problem }}</p>
			<div>
				<UButton label="Done" size="sm" @click="emit('connected', id)" />
			</div>
		</div>
	</div>
</template>

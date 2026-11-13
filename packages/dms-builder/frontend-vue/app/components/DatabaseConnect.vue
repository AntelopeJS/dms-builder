<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import {
	type ConnectForm,
	type DatabaseEngine,
	ENGINES,
	type ManagedNames,
	accountAdvice,
	connectSteps,
	connectVariables,
	connectionId,
	defaultNames,
	emptyFields,
	fieldProblem,
	isConnectionUrl,
	managedNames,
	missingField,
	parseConnectionUrl,
	refusalText,
} from '../runtime/database-connect'
import type { ProjectModules } from '../runtime/database-types'
import { t } from '../runtime/i18n'
import type { FileChange } from '../runtime/types'

/**
 * *Connect a database*: a name, the database's type and how to reach it. The
 * modules and the variable the builder manages follow the name, under *Advanced
 * settings*. The name follows the database's until it is typed. *Connect* writes
 * the batch at once; its diff stays under *Advanced settings*. The URL goes into
 * the git-ignored `.env` and nowhere else.
 */

const emit = defineEmits<{ cancel: []; written: [connection: string, module: string] }>()

const api = useBuilderApi()

const ENGINE_ITEMS = Object.entries(ENGINES).map(([value, spec]) => ({ label: spec.label, value }))

const form = reactive<ConnectForm>({
	name: '',
	engine: 'postgres',
	fields: emptyFields('postgres'),
	overrides: {},
})
/** The project's modules and the pin connecting needs; nothing until read, so no batch is planned without them. */
const project = ref<ProjectModules | null>(null)
const projectProblem = ref('')
const pasted = ref('')
const pasteProblem = ref('')
const preview = ref<FileChange[] | null>(null)
const busy = ref(false)
const problem = ref('')
/** Whether the name was typed; until then it follows the database field. */
const nameTyped = ref(false)
/** Counts the edits of the form, so an answer to an older one is dropped. */
let edits = 0

async function readProject(): Promise<void> {
	projectProblem.value = ''
	try {
		project.value = await api.projectModules()
	} catch (error) {
		projectProblem.value = api.failure(error).detail
	}
}

onMounted(readProject)

watch(
	() => form.fields.database,
	(database) => {
		if (!nameTyped.value) form.name = database
	},
)

function typeName(value: string): void {
	nameTyped.value = true
	form.name = value
}

watch(form, () => {
	edits += 1
	preview.value = null
}, { deep: true })

const id = computed(() => connectionId(form.name))
const names = computed(() => managedNames(form))
const defaults = computed(() => defaultNames(form.name, form.engine))
const missing = computed(() => missingField(form))
const invalid = computed(() => fieldProblem(form.engine, form.fields))
const blocked = computed(() => !!missing.value || !!invalid.value || !project.value || busy.value)
const extraOptions = computed(() => Object.entries(form.fields.options))
const spec = computed(() => ENGINES[form.engine])

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
		pasteProblem.value = t('database.connect.url_unreadable', {
			reason: error instanceof Error ? error.message : String(error),
		})
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

async function showDiff(): Promise<void> {
	if (!project.value) return
	busy.value = true
	problem.value = ''
	const asked = edits
	const result = await api.configureProject(connectSteps(form, project.value), true)
	busy.value = false
	if (asked !== edits) return
	if (!result.ok) {
		problem.value = refusalText(result.error)
		preview.value = null
		return
	}
	preview.value = result.changes
}

async function write(): Promise<void> {
	if (!project.value) return
	busy.value = true
	problem.value = ''
	const result = await api.configureProject(connectSteps(form, project.value), false, connectVariables(form))
	busy.value = false
	if (!result.ok) {
		problem.value = refusalText(result.error)
		return
	}
	form.fields.password = ''
	emit('written', id.value, names.value.tablesModule)
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
		<header>
			<p class="text-xl font-semibold tracking-tight text-highlighted">{{ t('database.connect.title') }}</p>
			<p class="text-xs text-muted">{{ t('database.connect.intro') }}</p>
		</header>

		<div class="grid grid-cols-2 gap-3">
			<UFormField
				:label="t('database.connect.name')"
				:help="id && id !== form.name ? t('database.connect.name_used', { id }) : t('database.connect.name_help')"
			>
				<UInput
					:model-value="form.name"
					:placeholder="t('database.connect.name_placeholder')"
					class="w-full"
					@update:model-value="typeName(String($event))"
				/>
			</UFormField>
			<UFormField :label="t('database.connect.engine')">
				<USelect
					:model-value="form.engine"
					:items="ENGINE_ITEMS"
					class="w-full"
					@update:model-value="setEngine($event as DatabaseEngine)"
				/>
			</UFormField>
		</div>

		<section class="flex flex-col gap-3 rounded-md border border-default p-3">
			<p class="text-sm font-semibold text-highlighted">{{ t('database.connect.connection') }}</p>
			<div class="flex gap-2">
				<UInput
					v-model="pasted"
					type="password"
					autocomplete="off"
					:placeholder="t('database.connect.paste_placeholder', { scheme: spec.schemes[0] })"
					class="flex-1 font-mono"
					@keydown.enter="pasteUrl"
				/>
				<UButton :label="t('database.connect.fill_in')" variant="soft" :disabled="!pasted.trim()" @click="pasteUrl" />
			</div>
			<p v-if="pasteProblem" class="text-xs text-error">{{ pasteProblem }}</p>
			<div class="grid grid-cols-[1fr_8rem] gap-3">
				<UFormField :label="t('database.connect.host')">
					<UInput v-model="form.fields.host" class="w-full font-mono" @paste="pasteIntoHost" />
				</UFormField>
				<UFormField :label="t('database.connect.port')">
					<UInput v-model="form.fields.port" inputmode="numeric" class="w-full font-mono" />
				</UFormField>
			</div>
			<div class="grid grid-cols-3 gap-3">
				<UFormField :label="t('database.connect.database')">
					<UInput v-model="form.fields.database" class="w-full font-mono" />
				</UFormField>
				<UFormField :label="t('database.connect.user')">
					<UInput v-model="form.fields.user" autocomplete="off" class="w-full font-mono" />
				</UFormField>
				<UFormField :label="t('database.connect.password')">
					<UInput
						v-model="form.fields.password"
						type="password"
						autocomplete="new-password"
						class="w-full font-mono"
					/>
				</UFormField>
			</div>
			<div v-if="spec.sslMode" class="flex items-center gap-3">
				<USwitch v-model="form.fields.ssl" :aria-label="t('database.connect.ssl')" />
				<span class="text-sm text-default">{{ t('database.connect.ssl') }}</span>
			</div>
			<p v-if="extraOptions.length" class="text-xs text-muted">
				{{ t('database.connect.options') }}
				<span class="font-mono">{{ extraOptions.map(([key, value]) => `${key}=${value}`).join(', ') }}</span>
			</p>
			<p class="text-xs text-muted">{{ accountAdvice(form.engine) }}</p>
			<p class="text-xs text-muted">
				{{
					spec.separateDatabase
						? t('database.connect.env_database', { variable: names.variable, databaseVariable: names.databaseVariable })
						: t('database.connect.env', { variable: names.variable })
				}}
			</p>
		</section>

		<DmsBuilderFoldCard
			icon="i-ph-gear-six"
			:title="t('database.connect.advanced')"
			:summary="`${names.driverModule}, ${names.tablesModule}, ${names.variable}`"
		>
			<div class="grid grid-cols-2 gap-3">
				<UFormField :label="t('database.connect.driver')" :help="t('database.connect.driver_help', { package: spec.package })">
					<UInput
						:model-value="names.driverModule"
						class="w-full font-mono"
						@update:model-value="setName('driverModule', String($event))"
					/>
				</UFormField>
				<UFormField :label="t('database.connect.version')" :help="t('database.connect.version_help', { package: spec.package })">
					<UInput
						:model-value="names.version"
						class="w-full font-mono"
						@update:model-value="setName('version', String($event))"
					/>
				</UFormField>
				<UFormField :label="t('database.connect.tables')" :help="t('database.connect.tables_help')">
					<UInput
						:model-value="names.tablesModule"
						class="w-full font-mono"
						@update:model-value="setName('tablesModule', String($event))"
					/>
				</UFormField>
				<UFormField :label="t('database.connect.variable')" :help="t('database.connect.variable_help')">
					<UInput
						:model-value="names.variable"
						class="w-full font-mono"
						@update:model-value="setName('variable', String($event))"
					/>
				</UFormField>
				<UFormField
					v-if="spec.separateDatabase"
					:label="t('database.connect.database_variable')"
					:help="t('database.connect.database_variable_help')"
				>
					<UInput
						:model-value="names.databaseVariable"
						class="w-full font-mono"
						@update:model-value="setName('databaseVariable', String($event))"
					/>
				</UFormField>
			</div>
			<div class="flex items-center gap-2">
				<UButton :label="t('database.connect.show_changes')" size="xs" variant="soft" :disabled="blocked" @click="showDiff" />
				<span class="text-xs text-muted">{{ t('database.connect.show_changes_hint') }}</span>
			</div>
			<DmsBuilderDiffView v-if="preview" :changes="preview" />
		</DmsBuilderFoldCard>

		<p v-if="projectProblem" class="flex items-center gap-2 text-xs text-error">
			{{ projectProblem }}
			<UButton :label="t('database.connect.retry')" size="xs" variant="soft" @click="readProject" />
		</p>
		<p v-if="problem" class="text-xs text-error">{{ problem }}</p>

		<div class="flex items-center gap-2">
			<UButton :label="t('database.connect.connect')" :loading="busy" :disabled="blocked" @click="write" />
			<UButton :label="t('database.connect.cancel')" color="neutral" variant="ghost" @click="emit('cancel')" />
			<span v-if="missing" class="text-xs text-muted">{{ t('database.connect.needs', { missing }) }}</span>
			<span v-else-if="invalid" class="text-xs text-error">{{ t('database.connect.check', { problem: invalid }) }}</span>
			<span v-else-if="!project && !projectProblem" class="text-xs text-muted">{{ t('database.connect.reading') }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { refusalText } from '../runtime/database-connect'
import {
	ASSISTANT_ACTIONS_KEY,
	type AssistantActions,
	assistantMessage,
	type BuildStep,
	type BuildView,
	buildState,
	forkText,
	preferredSchemas,
	readBuild,
	type StepStatus,
} from '../runtime/database-build'

/**
 * The build of a connection, step by step, from the write of *Connect* to the
 * fork: adding it to the project, the reload, connecting, reading the database.
 * Every step is derived from what the server answers, polled each second, so
 * the screen survives the reload and a closed tab. It stops at the fork, where
 * the person chooses who settles the mapping.
 */

const props = defineProps<{ connection: string; module: string }>()
const emit = defineEmits<{ connected: []; review: [job: string]; edit: []; remove: [] }>()

const POLL_MS = 1000

const STATUS_ICONS: Record<StepStatus, { icon: string; tone: string }> = {
	pending: { icon: 'i-ph-circle-light', tone: 'text-dimmed' },
	running: { icon: 'i-ph-circle-notch', tone: 'text-primary animate-spin' },
	done: { icon: 'i-ph-check-circle-fill', tone: 'text-success' },
	failed: { icon: 'i-ph-x-circle-fill', tone: 'text-error' },
}

const api = useBuilderApi()
const assistant = inject<AssistantActions | null>(ASSISTANT_ACTIONS_KEY, null)
const view = ref<BuildView | null>(null)
const checked = ref<string[]>([])
const problem = ref('')
let reloadingSince: number | undefined
let announced = false
let starting = false
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false

const steps = computed<BuildStep[]>(() => view.value?.steps ?? [])
const settled = computed(() => !!view.value?.fork || !!view.value?.empty)
const canHandOff = computed(() => !!assistant?.isAvailable)

function letAssistantFinish(): void {
	assistant?.startConversation(assistantMessage(props.connection, props.module), { mode: 'plan' })
}

async function startAnalysis(schemas?: string[]): Promise<void> {
	starting = true
	problem.value = ''
	const result = await api.analyseDatabase(props.connection, props.module, schemas)
	starting = false
	if (!result.ok) {
		problem.value = refusalText(result.error)
	}
}

async function poll(): Promise<void> {
	const answers = await readBuild(api, props.connection)
	if (disposed) return
	const before = buildState(answers)
	if (before.reloading) {
		reloadingSince ??= Date.now()
	} else {
		reloadingSince = undefined
	}
	const next = buildState(answers, reloadingSince === undefined ? 0 : Date.now() - reloadingSince)
	if (next.schemas && !view.value?.schemas) {
		checked.value = preferredSchemas(next.schemas)
	}
	view.value = next
	if (!announced && next.steps.some((entry) => entry.key === 'connect' && entry.status !== 'pending')) {
		announced = true
		emit('connected')
	}
	if (next.needsAnalysis && !starting && !problem.value) {
		await startAnalysis()
	}
	if (!disposed && !settled.value) {
		timer = setTimeout(() => void poll(), POLL_MS)
	}
}

function toggleSchema(schema: string, on: boolean): void {
	checked.value = on ? [...checked.value, schema] : checked.value.filter((entry) => entry !== schema)
}

async function readSchemas(): Promise<void> {
	await startAnalysis(checked.value)
	if (timer) clearTimeout(timer)
	await poll()
}

onMounted(() => void poll())
onBeforeUnmount(() => {
	disposed = true
	if (timer) clearTimeout(timer)
})
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
		<header>
			<p class="text-xl font-semibold tracking-tight text-highlighted">{{ connection }}</p>
			<p class="font-mono text-xs text-muted">tables in module {{ module }}</p>
		</header>

		<ol class="flex flex-col gap-3" aria-live="polite">
			<li v-for="(entry, index) in steps" :key="entry.key" class="flex gap-3" :data-step="entry.key" :data-status="entry.status">
				<UIcon
					:name="STATUS_ICONS[entry.status].icon"
					class="mt-0.5 size-4 shrink-0"
					:class="STATUS_ICONS[entry.status].tone"
				/>
				<div class="flex min-w-0 flex-col gap-1">
					<p class="text-sm font-semibold" :class="entry.status === 'pending' ? 'text-muted' : 'text-highlighted'">
						{{ index + 1 }}. {{ entry.title }}
					</p>
					<p v-if="entry.detail" class="text-xs" :class="entry.status === 'failed' ? 'text-error' : 'text-muted'">
						{{ entry.detail }}
					</p>

					<div v-if="entry.key === 'reload' && entry.status === 'failed'" class="flex gap-2">
						<UButton label="Remove" size="xs" color="error" variant="outline" @click="emit('remove')" />
					</div>
					<div v-if="entry.key === 'connect' && entry.status === 'failed'" class="flex gap-2">
						<UButton label="Edit the connection" size="xs" @click="emit('edit')" />
						<UButton label="Remove" size="xs" color="error" variant="outline" @click="emit('remove')" />
					</div>
					<div v-if="entry.key === 'read' && view?.schemas" class="flex flex-col gap-2" data-schemas>
						<label
							v-for="option in view.schemas.options"
							:key="String(option.value)"
							class="flex items-center gap-2 text-xs text-default"
						>
							<UCheckbox
								:model-value="checked.includes(String(option.value))"
								@update:model-value="toggleSchema(String(option.value), $event === true)"
							/>
							{{ option.title }}
						</label>
						<div>
							<UButton label="Continue" size="xs" :disabled="!checked.length" @click="readSchemas" />
						</div>
					</div>
					<div v-if="entry.key === 'read' && view?.empty" class="flex gap-2">
						<UButton label="Remove" size="xs" color="error" variant="outline" @click="emit('remove')" />
					</div>
				</div>
			</li>
		</ol>

		<p v-if="problem" class="text-xs text-error">{{ problem }}</p>

		<section v-if="view?.fork && view.job" class="flex flex-col gap-3 rounded-md border border-default p-4" data-fork>
			<p class="text-sm font-semibold text-highlighted">{{ forkText(view.fork) }}</p>
			<p class="text-xs text-muted">
				Nothing is mapped yet. Choose who settles the questions and maps the tables.
			</p>
			<div class="flex gap-2">
				<UButton v-if="canHandOff" label="Let the assistant finish" @click="letAssistantFinish" />
				<UButton label="Review it myself" variant="soft" @click="emit('review', view.job)" />
			</div>
		</section>
	</div>
</template>

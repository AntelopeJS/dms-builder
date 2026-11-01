<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { DATABASE_ICON } from '../runtime/constants'
import { defaultNames } from '../runtime/database-connect'
import type { ConnectionInfo, DatabaseConnection } from '../runtime/database-types'

/**
 * The databases the project maps: the builder's catalog connections in a list,
 * the open one's mapping beside it, or the form that wires a new one. A
 * connection wired and not mapped yet opens on its build screen, as one just
 * connected does.
 */

const api = useBuilderApi()
const consumeRefusal = useReadOnlyRefusal()
const connections = ref<DatabaseConnection[] | null>(null)
const selected = ref<string | null>(null)
const connecting = ref(false)
const module = ref('')
/** The module field as typed; the mapping follows it once the field is left. */
const moduleInput = ref('')
/** Tables of the open connection changed and not applied yet. */
const unsaved = ref(0)
/** Connections written to the configuration, until the builder lists them. */
const pending = ref<string[]>([])
/** Connections taken out of the configuration, still served until the project restarts. */
const removed = ref<string[]>([])
/** What the open connection wired, read from the configuration. */
const info = ref<ConnectionInfo | null>(null)
const infoProblem = ref('')
/** Whether the open connection's wiring was read, so its mapping opens on the module it holds its tables in. */
const infoRead = ref(false)

function connectionProblem(error: unknown): string {
	const data = (error as { data?: { message?: string; code?: string } }).data
	if (data?.message) {
		return `Edit and Remove are unavailable: ${data.message}`
	}
	return data?.code === 'not_found'
		? 'This connection is no longer in the configuration: restart the project to finish.'
		: 'Edit and Remove are unavailable: the connection could not be read.'
}
/** What the section beside the list shows for the open connection. */
const view = ref<'mapping' | 'edit' | 'remove' | 'build'>('mapping')
/** Where closing Edit or Remove goes back to: the build screen they were opened from, or the mapping. */
let returnTo: 'mapping' | 'build' = 'mapping'
/** The analysis *Review it myself* opens the mapping on, so it is not run again. */
const reviewJob = ref<string | undefined>()

async function load(): Promise<void> {
	connections.value = await api.databaseConnections().catch(() => [])
	const first = connections.value.find((entry) => !removed.value.includes(entry.id))
	if (!selected.value && first) {
		void open(first.id)
	}
}

/** A connection written to the configuration: listed as pending until the builder lists it, and built. */
function wrote(id: string, tablesModule: string): void {
	pending.value = [...pending.value.filter((entry) => entry !== id), id]
	removed.value = removed.value.filter((entry) => entry !== id)
	connecting.value = false
	selected.value = id
	module.value = tablesModule
	moduleInput.value = tablesModule
	info.value = null
	infoRead.value = true
	reviewJob.value = undefined
	view.value = 'build'
}

function connected(): void {
	void load()
}

/** What a listed connection's line says under its name. */
function status(entry: DatabaseConnection): { text: string; tone: string } {
	if (pending.value.includes(entry.id) && !entry.engine && !entry.error) {
		return { text: 'Connecting…', tone: 'text-warning' }
	}
	if (removed.value.includes(entry.id)) {
		return { text: 'Removed, restart to finish', tone: 'text-warning' }
	}
	if (entry.error) {
		return { text: entry.error, tone: 'text-error' }
	}
	return { text: `${entry.engine} ${entry.version} · ${entry.database} · ${entry.role}`, tone: 'text-muted' }
}

/** Leaving the open connection drops its unapplied changes, so it asks first. */
function mayLeave(): boolean {
	return (
		unsaved.value === 0 ||
		window.confirm(`${unsaved.value} changed tables are not applied yet. Leave them unsaved?`)
	)
}

function startConnecting(): void {
	if (connecting.value || mayLeave()) connecting.value = !connecting.value
}

async function open(id: string): Promise<void> {
	if (id === selected.value) {
		connecting.value = false
		view.value = 'mapping'
		return
	}
	if (!mayLeave()) return
	selected.value = id
	connecting.value = false
	view.value = 'mapping'
	reviewJob.value = undefined
	info.value = null
	infoRead.value = false
	await readInfo(id)
	const mapping = await api.mapping(id, module.value)
	if (selected.value !== id) return
	if (!mapping.ok || mapping.data.length === 0) view.value = 'build'
}

/** *Review it myself*: the mapping, on the analysis the build screen ran. */
function review(job: string): void {
	reviewJob.value = job
	view.value = 'mapping'
}

/** Edit or Remove from the build screen, once the connection's wiring is read. */
async function fromBuild(next: 'edit' | 'remove'): Promise<void> {
	if (!selected.value) return
	if (!info.value) await readInfo(selected.value)
	if (!info.value) return
	returnTo = 'build'
	view.value = next
}

function savedEdit(): void {
	if (!selected.value) return
	void readInfo(selected.value)
	returnTo = 'mapping'
	view.value = 'build'
}

async function readInfo(id: string): Promise<void> {
	infoProblem.value = ''
	const read = await api.databaseConnection(id).catch((error: unknown) => {
		if (consumeRefusal(error)) return null
		infoProblem.value = connectionProblem(error)
		return null
	})
	if (selected.value !== id) return
	info.value = read
	if (!infoRead.value) {
		module.value =
			read?.wiring.modules[0]?.id ?? read?.wiring.unrecorded[0]?.id ?? defaultNames(id, 'postgres').tablesModule
		moduleInput.value = module.value
		infoRead.value = true
	}
}

/** Opens the mapping of the module typed, once the field is left, asking first when changes would be dropped. */
function useModule(): void {
	const next = moduleInput.value.trim()
	if (!next || next === module.value) {
		moduleInput.value = module.value
		return
	}
	if (!mayLeave()) {
		moduleInput.value = module.value
		return
	}
	module.value = next
}

function show(next: 'edit' | 'remove'): void {
	if (view.value === next) {
		closeView()
		return
	}
	if (!mayLeave()) return
	returnTo = view.value === 'build' ? 'build' : 'mapping'
	view.value = next
}

function wasRemoved(id: string): void {
	removed.value = [...removed.value.filter((entry) => entry !== id), id]
	pending.value = pending.value.filter((entry) => entry !== id)
}

/** Back to the mapping, or to no connection when the open one was removed. */
function closeView(): void {
	view.value = returnTo
	returnTo = 'mapping'
	if (selected.value && removed.value.includes(selected.value)) {
		selected.value = null
		info.value = null
	}
}

onMounted(load)
</script>

<template>
	<div class="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
		<aside
			class="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-default bg-(--dms-bg-sidebar) p-3"
			aria-label="Databases"
		>
			<UButton
				icon="i-ph-plus-light"
				label="Connect a database"
				size="sm"
				:variant="connecting ? 'soft' : 'solid'"
				@click="startConnecting"
			/>
			<div
				v-for="id in pending.filter((entry) => !connections?.some((listed) => listed.id === entry))"
				:key="id"
				class="flex items-center gap-2.5 px-2 py-2"
				data-pending-connection
			>
				<UIcon :name="DATABASE_ICON" class="size-4 shrink-0 text-muted" />
				<span class="flex min-w-0 flex-col">
					<span class="truncate text-[13px] font-semibold text-highlighted">{{ id }}</span>
					<span class="truncate text-[11px] text-warning">Connecting…</span>
				</span>
			</div>
			<p v-if="connections && !connections.length && !pending.length" class="text-xs text-muted">
				No database is connected to the builder yet.
			</p>
			<UButton
				v-for="entry in connections ?? []"
				:key="entry.id"
				color="neutral"
				variant="ghost"
				block
				class="justify-start gap-2.5 px-2 py-2 text-left font-normal"
				:class="selected === entry.id && !connecting ? 'bg-primary/10' : ''"
				:disabled="removed.includes(entry.id)"
				@click="open(entry.id)"
			>
				<UIcon :name="DATABASE_ICON" class="size-4 shrink-0" />
				<span class="flex min-w-0 flex-col">
					<span class="truncate text-[13px] font-semibold text-highlighted">{{ entry.id }}</span>
					<span class="truncate text-[11px]" :class="[status(entry).tone, status(entry).tone === 'text-muted' ? 'font-mono' : '']">
						{{ status(entry).text }}
					</span>
				</span>
			</UButton>
			<template v-if="selected && !connecting">
				<UFormField label="Module for its tables" size="xs">
					<UInput
						v-model="moduleInput"
						size="xs"
						class="w-full font-mono"
						@blur="useModule"
						@keydown.enter="useModule"
					/>
				</UFormField>
				<p v-if="infoProblem" class="text-xs text-error">{{ infoProblem }}</p>
				<div v-if="info && !removed.includes(selected)" class="flex gap-2">
					<UButton
						icon="i-ph-pencil-simple"
						label="Edit connection"
						size="xs"
						color="neutral"
						:variant="view === 'edit' ? 'soft' : 'outline'"
						@click="show('edit')"
					/>
					<UButton
						icon="i-ph-trash"
						label="Remove"
						size="xs"
						color="error"
						:variant="view === 'remove' ? 'soft' : 'outline'"
						@click="show('remove')"
					/>
				</div>
			</template>
		</aside>

		<section class="flex min-h-0 min-w-0 flex-col overflow-y-auto">
			<DmsBuilderDatabaseConnect
				v-if="connecting || (connections && !connections.length && !pending.length)"
				@cancel="connecting = false"
				@written="wrote"
			/>
			<DmsBuilderDatabaseBuild
				v-else-if="selected && view === 'build' && !removed.includes(selected)"
				:key="`build:${selected}:${module}`"
				:connection="selected"
				:module="module"
				@connected="connected"
				@review="review"
				@edit="fromBuild('edit')"
				@remove="fromBuild('remove')"
			/>
			<DmsBuilderDatabaseConnectionEdit
				v-else-if="selected && info && view === 'edit'"
				:key="`edit:${selected}`"
				:connection="selected"
				:info="info"
				@close="closeView"
				@saved="savedEdit"
			/>
			<DmsBuilderDatabaseConnectionRemove
				v-else-if="selected && info && view === 'remove'"
				:key="`remove:${selected}`"
				:connection="selected"
				:info="info"
				@close="closeView"
				@removed="wasRemoved"
			/>
			<DmsBuilderDatabaseProposal
				v-else-if="selected && infoRead && !removed.includes(selected)"
				:key="`${selected}:${module}:${reviewJob ?? ''}`"
				:connection="selected"
				:module="module"
				:job="reviewJob"
				@unsaved="unsaved = $event"
			/>
		</section>
	</div>
</template>

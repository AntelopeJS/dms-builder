<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { DATABASE_ICON } from '../runtime/constants'
import { defaultNames } from '../runtime/database-connect'
import type { ConnectionInfo, DatabaseConnection } from '../runtime/database-types'

/**
 * The databases the project maps: the builder's catalog connections in a list,
 * the open one's mapping beside it, or the form that wires a new one.
 */

const api = useBuilderApi()
const connections = ref<DatabaseConnection[] | null>(null)
const selected = ref<string | null>(null)
const connecting = ref(false)
const module = ref('')
/** Tables of the open connection changed and not applied yet. */
const unsaved = ref(0)
/** A connection written to the configuration, which exists once the project restarts. */
const pending = ref<string | null>(null)
/** Connections taken out of the configuration, still served until the project restarts. */
const removed = ref<string[]>([])
/** What the open connection wired, read from the configuration. */
const info = ref<ConnectionInfo | null>(null)
/** What the section beside the list shows for the open connection. */
const view = ref<'mapping' | 'edit' | 'remove'>('mapping')

async function load(): Promise<void> {
	connections.value = await api.databaseConnections().catch(() => [])
	if (!selected.value && connections.value.length) {
		void open(connections.value[0].id)
	}
}

function connected(id: string): void {
	connecting.value = false
	pending.value = id
	void load()
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
	if (id !== selected.value && !mayLeave()) return
	selected.value = id
	connecting.value = false
	view.value = 'mapping'
	info.value = null
	module.value = defaultNames(id, 'postgres').tablesModule
	const read = await api.databaseConnection(id).catch(() => null)
	if (selected.value !== id) return
	info.value = read
	module.value = read?.wiring.modules[0]?.id ?? module.value
}

function show(next: 'edit' | 'remove'): void {
	if (view.value === next) {
		view.value = 'mapping'
		return
	}
	if (mayLeave()) view.value = next
}

function wasRemoved(id: string): void {
	removed.value = [...removed.value, id]
	selected.value = null
	view.value = 'mapping'
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
				v-if="pending && !connections?.some((entry) => entry.id === pending)"
				class="flex items-center gap-2.5 px-2 py-2"
				data-pending-connection
			>
				<UIcon :name="DATABASE_ICON" class="size-4 shrink-0 text-muted" />
				<span class="flex min-w-0 flex-col">
					<span class="truncate text-[13px] font-semibold text-highlighted">{{ pending }}</span>
					<span class="truncate text-[11px] text-warning">Restart to connect</span>
				</span>
			</div>
			<p v-else-if="connections && !connections.length" class="text-xs text-muted">
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
					<span v-if="removed.includes(entry.id)" class="truncate text-[11px] text-warning">
						Removed, restart to finish
					</span>
					<span v-else class="truncate font-mono text-[11px]" :class="entry.error ? 'text-error' : 'text-muted'">
						{{ entry.error ?? `${entry.engine} ${entry.version} · ${entry.database} · ${entry.role}` }}
					</span>
				</span>
			</UButton>
			<template v-if="selected && !connecting">
				<UFormField label="Module for its tables" size="xs">
					<UInput v-model="module" size="xs" class="w-full font-mono" />
				</UFormField>
				<div v-if="info" class="flex gap-2">
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
				v-if="connecting || (connections && !connections.length && !pending)"
				@cancel="connecting = false"
				@connected="connected"
			/>
			<DmsBuilderDatabaseConnectionEdit
				v-else-if="selected && info && view === 'edit'"
				:key="`edit:${selected}`"
				:connection="selected"
				:info="info"
				@close="view = 'mapping'"
			/>
			<DmsBuilderDatabaseConnectionRemove
				v-else-if="selected && info && view === 'remove'"
				:key="`remove:${selected}`"
				:connection="selected"
				:info="info"
				@close="view = 'mapping'"
				@removed="wasRemoved"
			/>
			<DmsBuilderDatabaseProposal
				v-else-if="selected"
				:key="`${selected}:${module}`"
				:connection="selected"
				:module="module"
				@unsaved="unsaved = $event"
			/>
		</section>
	</div>
</template>

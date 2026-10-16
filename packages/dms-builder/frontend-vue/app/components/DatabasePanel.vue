<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { DATABASE_ICON } from '../runtime/constants'
import type { DatabaseConnection } from '../runtime/database-types'

/**
 * The databases the project maps: the builder's catalog connections in a list,
 * the open one's mapping beside it, or the form that wires a new one.
 */

const api = useBuilderApi()
const connections = ref<DatabaseConnection[] | null>(null)
const selected = ref<string | null>(null)
const connecting = ref(false)
const module = ref('')
/** A connection written to the configuration, which exists once the project restarts. */
const pending = ref<string | null>(null)

async function load(): Promise<void> {
	connections.value = await api.databaseConnections().catch(() => [])
	if (!selected.value && connections.value.length) {
		open(connections.value[0].id)
	}
}

function connected(id: string): void {
	connecting.value = false
	pending.value = id
	void load()
}

function open(id: string): void {
	selected.value = id
	connecting.value = false
	module.value = `${id}-tables`
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
				@click="connecting = !connecting"
			/>
			<div
				v-if="pending && !connections?.some((entry) => entry.id === pending)"
				class="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-toned"
			>
				<b class="font-semibold text-highlighted">{{ pending }}</b> is written to the configuration.
				Restart the project for it to connect.
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
				@click="open(entry.id)"
			>
				<UIcon :name="DATABASE_ICON" class="size-4 shrink-0" />
				<span class="flex min-w-0 flex-col">
					<span class="truncate text-[13px] font-semibold text-highlighted">{{ entry.id }}</span>
					<span class="truncate font-mono text-[11px]" :class="entry.error ? 'text-error' : 'text-muted'">
						{{ entry.error ?? `${entry.engine} ${entry.version} · ${entry.database} · ${entry.role}` }}
					</span>
				</span>
			</UButton>
			<UFormField v-if="selected && !connecting" label="Module for its tables" size="xs">
				<UInput v-model="module" size="xs" class="w-full font-mono" />
			</UFormField>
		</aside>

		<section class="flex min-h-0 min-w-0 flex-col overflow-y-auto">
			<DmsBuilderDatabaseConnect
				v-if="connecting || (connections && !connections.length && !pending)"
				@cancel="connecting = false"
				@connected="connected"
			/>
			<DmsBuilderDatabaseProposal
				v-else-if="selected"
				:key="`${selected}:${module}`"
				:connection="selected"
				:module="module"
			/>
		</section>
	</div>
</template>

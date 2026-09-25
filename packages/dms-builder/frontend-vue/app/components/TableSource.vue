<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBuilder } from '../runtime/session'
import { serves, useTableBlock } from '../runtime/table-panel'

/**
 * The table a table block lists. One placed a moment ago lists none yet, and
 * the tables to pick from are the first thing it shows.
 */
const props = defineProps<{ path: string }>()

/** Past this many tables, the list takes a search. */
const SEARCH_FROM = 7
/** The route a table's rows are listed through, as its API names it. */
const LIST_ROUTE = 'list'

const builder = useBuilder()
const session = builder.session
const table = useTableBlock(() => props.path)

/** Whether the list of tables is open over the table already listed. */
const choosing = ref(false)
const query = ref('')

const listing = computed(() => !table.table.value || choosing.value)

watch(
	() => props.path,
	() => {
		choosing.value = false
		query.value = ''
	},
)

/** A table's columns and routes, read as the list opens. */
watch(
	listing,
	(open) => {
		if (!open) return
		for (const entry of session.value.resources) {
			void builder.loadResource(entry.ref)
		}
	},
	{ immediate: true },
)

const tables = computed(() => {
	const text = query.value.trim().toLowerCase()
	return [...session.value.resources]
		.filter((entry) => !text || entry.ref.toLowerCase().includes(text))
		.sort((a, b) => a.ref.localeCompare(b.ref))
		.map((entry) => {
			const structure = session.value.resourceStructures[entry.ref]
			return {
				ref: entry.ref,
				columns: structure?.fields.length,
				lists: serves(structure, LIST_ROUTE),
			}
		})
})

async function choose(ref: string): Promise<void> {
	choosing.value = false
	query.value = ''
	await table.list(ref)
}

function columnsLabel(count: number | undefined): string {
	if (count === undefined) return ''
	return `${count} column${count === 1 ? '' : 's'}`
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<button
			v-if="table.table.value"
			type="button"
			class="flex h-12 items-center gap-2.5 rounded-lg border bg-elevated px-2.5 text-left transition-colors"
			:class="choosing ? 'border-primary' : 'border-accented hover:border-primary/40'"
			:aria-expanded="choosing"
			:aria-label="`Table it lists: ${table.table.value}`"
			@click="choosing = !choosing"
		>
			<span
				class="flex size-[30px] shrink-0 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary"
			>
				<UIcon name="i-ph-table" class="size-4" />
			</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-sm font-medium text-highlighted">
					{{ table.table.value }}
				</span>
				<span class="text-xs text-muted">The table it lists, a page at a time</span>
			</span>
			<UIcon
				:name="choosing ? 'i-ph-caret-up' : 'i-ph-caret-down'"
				class="size-3.5 text-dimmed"
			/>
		</button>

		<div
			v-if="listing"
			class="flex flex-col gap-2.5 rounded-lg border bg-elevated p-3"
			:class="table.table.value ? 'border-accented' : 'border-primary/35'"
		>
			<div v-if="!table.table.value" class="flex flex-col gap-1">
				<p class="text-[13px] font-semibold text-highlighted">
					Pick the table it lists
				</p>
				<p class="text-xs leading-relaxed text-muted">
					Its rows show here, a page at a time. Choose next which columns show
					and what people can do with a row.
				</p>
			</div>
			<UInput
				v-if="session.resources.length >= SEARCH_FROM"
				v-model="query"
				icon="i-ph-magnifying-glass"
				size="sm"
				placeholder="Find a table"
				aria-label="Find a table"
			/>
			<div role="listbox" aria-label="Tables" class="flex flex-col gap-1">
				<button
					v-for="entry in tables"
					:key="entry.ref"
					type="button"
					role="option"
					:aria-selected="entry.ref === table.table.value"
					:disabled="!entry.lists"
					class="flex h-11 items-center gap-2.5 rounded-md border px-2.5 text-left transition-colors"
					:class="
						!entry.lists
							? 'cursor-not-allowed border-dashed border-accented'
							: entry.ref === table.table.value
								? 'border-primary/45 bg-primary/10'
								: 'border-accented bg-default hover:border-primary/40'
					"
					@click="choose(entry.ref)"
				>
					<span
						class="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-accented"
						:class="entry.lists ? 'text-muted' : 'text-dimmed'"
					>
						<UIcon name="i-ph-table" class="size-[15px]" />
					</span>
					<span
						class="min-w-0 flex-1 truncate text-[13px]"
						:class="entry.lists ? 'text-default' : 'text-dimmed'"
					>
						{{ entry.ref }}
					</span>
					<span class="shrink-0 text-xs text-dimmed">
						{{ entry.lists ? columnsLabel(entry.columns) : "Can't list its rows" }}
					</span>
				</button>
				<p v-if="!session.resources.length" class="py-1 text-xs text-muted">
					No table yet.
				</p>
				<p v-else-if="!tables.length" class="py-1 text-xs text-muted">
					No table matches.
				</p>
			</div>
			<UButton
				v-if="choosing"
				size="xs"
				color="neutral"
				variant="ghost"
				label="Cancel"
				class="self-start"
				@click="choosing = false"
			/>
		</div>

		<p v-if="!table.table.value" class="text-xs leading-relaxed text-dimmed">
			{{ session.resources.length ? 'No table fits?' : 'None to pick?' }}
			<UButton
				size="xs"
				variant="link"
				label="Create one in Tables"
				class="p-0 align-baseline"
				@click="builder.setView('resource')"
			/>
		</p>
	</div>
</template>

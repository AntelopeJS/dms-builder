<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TABLE_ROUTES } from '../runtime/constants'
import { useFormBlock } from '../runtime/form-panel'
import { fillableColumns, takesRows } from '../runtime/form-table'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'

/**
 * Where a form's values go: a row of the table picked, or an address someone
 * typed in the advanced view. A form placed a moment ago goes nowhere yet, and
 * the tables to pick from are the first thing it shows.
 */
const props = defineProps<{ path: string }>()

/** Past this many tables, the list takes a search. */
const SEARCH_FROM = 7
/** The route a table creates a row through, as its API lists it. */
const CREATE_ROUTE = 'create'

const builder = useBuilder()
const session = builder.session
const { setMode } = useBuilderMode()
const form = useFormBlock(() => props.path)

const destination = form.destination
const table = form.table
/** Whether the list of tables is open over a destination already chosen. */
const choosing = ref(false)
const query = ref('')

const listing = computed(
	() => destination.value.kind === 'none' || choosing.value,
)

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
				columns: structure ? fillableColumns(structure).length : undefined,
				takes: structure ? takesRows(structure) : true,
			}
		})
})

/** The table picked, when its API no longer creates rows. */
const refuses = computed(
	() => !!form.structure.value && !takesRows(form.structure.value),
)
const writing = computed(
	() => !!table.value && session.value.pending.includes(table.value.ref),
)

const askedCount = computed(
	() => form.columns.value.filter((column) => form.asked.value.has(column.name)).length,
)

async function choose(ref: string): Promise<void> {
	await form.bindTo(ref)
	choosing.value = false
	query.value = ''
}

/** Written straight to the table, as its API tab would. */
function turnCreateOn(): void {
	const current = table.value
	if (!current) return
	const served =
		form.structure.value?.routes ?? TABLE_ROUTES.map((entry) => entry.key)
	void builder.configureResource(current.ref, [...new Set([...served, CREATE_ROUTE])])
}

function columnsLabel(count: number | undefined): string {
	if (count === undefined) return ''
	return `${count} column${count === 1 ? '' : 's'}`
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<p class="text-xs font-semibold text-toned">
			{{ destination.kind === 'address' ? 'Sends to' : 'Saves into' }}
		</p>

		<template v-if="destination.kind === 'table'">
			<button
				type="button"
				class="flex h-12 items-center gap-2.5 rounded-lg border bg-elevated px-2.5 text-left transition-colors"
				:class="
					refuses
						? 'border-warning/55'
						: choosing
							? 'border-primary'
							: 'border-accented hover:border-primary/40'
				"
				:aria-expanded="choosing"
				:aria-label="`Table the form saves into: ${destination.table.ref}`"
				@click="choosing = !choosing"
			>
				<span
					class="flex size-[30px] shrink-0 items-center justify-center rounded-md border"
					:class="
						refuses
							? 'border-warning/40 bg-warning/10 text-warning'
							: 'border-primary/35 bg-primary/10 text-primary'
					"
				>
					<UIcon name="i-ph-table" class="size-4" />
				</span>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-sm font-medium text-highlighted">
						{{ destination.table.ref }}
					</span>
					<span class="text-xs" :class="refuses ? 'text-warning' : 'text-muted'">
						{{ refuses ? 'Takes no new rows' : 'Each submit adds a row' }}
					</span>
				</span>
				<UIcon
					:name="choosing ? 'i-ph-caret-up' : 'i-ph-caret-down'"
					class="size-3.5 text-dimmed"
				/>
			</button>

			<div
				v-if="refuses && !choosing"
				role="alert"
				class="flex flex-col gap-2.5 rounded-lg border border-warning/40 bg-warning/5 p-2.5"
			>
				<div class="flex gap-2">
					<UIcon name="i-ph-warning" class="mt-0.5 size-3.5 shrink-0 text-warning" />
					<p class="text-xs leading-relaxed text-toned">
						The API of
						<span class="font-medium text-highlighted">{{ destination.table.ref }}</span>
						has <span class="font-medium text-highlighted">Create</span> turned
						off, so every submit will be refused.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<UButton
						size="xs"
						color="warning"
						label="Turn Create on"
						:loading="writing"
						:disabled="writing"
						@click="turnCreateOn"
					/>
					<span
						class="inline-flex h-4 items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary"
						title="Applies now"
					>
						<UIcon name="i-ph-lightning-fill" class="size-2.5" />
						Now
					</span>
					<UButton
						size="xs"
						color="neutral"
						variant="link"
						label="Pick another table"
						class="ml-auto"
						@click="choosing = true"
					/>
				</div>
			</div>
			<div
				v-else-if="!choosing && form.structure.value"
				class="flex items-center justify-between gap-2 text-xs text-muted"
			>
				<span>
					{{ askedCount }} of its {{ columnsLabel(form.columns.value.length) }} in
					the form
				</span>
				<UButton
					size="xs"
					variant="link"
					trailing-icon="i-ph-arrow-square-out"
					label="Open the table"
					class="px-0"
					@click="builder.openTable(destination.table.ref)"
				/>
			</div>
		</template>

		<div
			v-else-if="destination.kind === 'address'"
			class="flex flex-col gap-2.5 rounded-lg border border-accented bg-elevated p-2.5"
		>
			<div class="flex items-center gap-2.5">
				<span
					class="flex size-[30px] shrink-0 items-center justify-center rounded-md bg-accented text-muted"
				>
					<UIcon name="i-ph-globe-simple" class="size-4" />
				</span>
				<span class="flex min-w-0 flex-1 flex-col">
					<code class="truncate font-mono text-[13px] text-highlighted">
						{{ destination.method ?? 'POST' }} {{ destination.url }}
					</code>
					<span class="text-xs text-muted">An address set in the Advanced view</span>
				</span>
			</div>
			<UButton
				v-if="!choosing"
				icon="i-ph-table"
				size="xs"
				color="neutral"
				variant="outline"
				label="Save into a table instead"
				class="self-start"
				@click="choosing = true"
			/>
		</div>

		<div
			v-if="listing"
			class="flex flex-col gap-2.5 rounded-lg border bg-elevated p-3"
			:class="destination.kind === 'none' ? 'border-primary/35' : 'border-accented'"
		>
			<div v-if="destination.kind === 'none'" class="flex flex-col gap-1">
				<p class="text-[13px] font-semibold text-highlighted">
					Pick the table it fills
				</p>
				<p class="text-xs leading-relaxed text-muted">
					Each submit adds a row to it. Its columns become the fields — leave out
					any it shouldn't ask.
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
					:aria-selected="entry.ref === table?.ref"
					:disabled="!entry.takes"
					class="flex h-11 items-center gap-2.5 rounded-md border px-2.5 text-left transition-colors"
					:class="
						!entry.takes
							? 'cursor-not-allowed border-dashed border-accented'
							: entry.ref === table?.ref
								? 'border-primary/45 bg-primary/10'
								: 'border-accented bg-default hover:border-primary/40'
					"
					@click="choose(entry.ref)"
				>
					<span
						class="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-accented"
						:class="entry.takes ? 'text-muted' : 'text-dimmed'"
					>
						<UIcon name="i-ph-table" class="size-[15px]" />
					</span>
					<span
						class="min-w-0 flex-1 truncate text-[13px]"
						:class="entry.takes ? 'text-default' : 'text-dimmed'"
					>
						{{ entry.ref }}
					</span>
					<span class="shrink-0 text-xs text-dimmed">
						{{ entry.takes ? columnsLabel(entry.columns) : 'Takes no new rows' }}
					</span>
				</button>
				<p v-if="!session.resources.length" class="py-1 text-xs text-muted">
					No table yet.
					<UButton
						size="xs"
						variant="link"
						label="Create one in Tables"
						class="px-0"
						@click="builder.setView('resource')"
					/>
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

		<p v-if="destination.kind === 'none'" class="text-xs leading-relaxed text-dimmed">
			Sending somewhere else than a table? Type the address in the
			<UButton
				size="xs"
				variant="link"
				label="Advanced"
				class="p-0 align-baseline"
				@click="setMode('advanced')"
			/>
			view.
		</p>
	</div>
</template>

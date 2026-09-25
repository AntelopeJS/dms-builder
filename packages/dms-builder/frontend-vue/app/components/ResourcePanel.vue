<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DEFAULT_DATA_TYPE, TABLE_ROUTES } from '../runtime/constants'
import { walkDraft } from '../runtime/draft'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder, type TableTab } from '../runtime/session'
import { servedRoutes } from '../runtime/table-routes'
import type { FieldSpec, ResourceSummary } from '../runtime/types'

/** The field every new table starts with, so its rows have a name from the first. */
const FIRST_FIELD: FieldSpec = {
	name: 'title',
	dataType: { $dataType: DEFAULT_DATA_TYPE },
	label: 'Title',
	listable: true,
	selectable: true,
	searchable: true,
}

const builder = useBuilder()
const { advanced } = useBuilderMode()
const session = builder.session

const query = ref('')
const composing = ref(false)
const newName = ref('')
/** Whether the open table was asked for and did not come back. */
const unreadable = ref(false)
const addingField = ref(false)

const table = computed(() => session.value.table)
const structure = computed(() =>
	table.value ? session.value.resourceStructures[table.value.ref] : undefined,
)
// With no table at all, naming the first one is the only thing to do here.
const composerOpen = computed(
	() => composing.value || !session.value.resources.length,
)

/** How many blocks of this page read each table, by its ref. */
const readers = computed(() => {
	const counts: Record<string, number> = {}
	walkDraft(session.value.draft?.blocks ?? [], (block) => {
		if (block.controller) {
			counts[block.controller] = (counts[block.controller] ?? 0) + 1
		}
	})
	return counts
})

const listed = computed(() => {
	const needle = query.value.trim().toLowerCase()
	return session.value.resources.filter(
		(entry) =>
			!needle ||
			entry.ref.toLowerCase().includes(needle) ||
			entry.tableName.toLowerCase().includes(needle),
	)
})

/** The open table's sections, each with what it holds once the table is read. */
const tabs = computed(() => {
	const read = structure.value
	return [
		{ label: 'Fields', value: 'fields', badge: read?.fields.length },
		{
			label: 'API',
			value: 'api',
			badge:
				read && `${servedRoutes(read).length}/${TABLE_ROUTES.length}`,
		},
		{ label: 'Settings', value: 'settings' },
	]
})

watch(
	() => table.value?.ref,
	async (ref_) => {
		unreadable.value = false
		if (!ref_) return
		await builder.loadResource(ref_)
		unreadable.value = !session.value.resourceStructures[ref_]
	},
	{ immediate: true },
)

// The list counts each table's fields from its structure: the summary's count
// takes the row id in, and is not refreshed when a field is added.
watch(
	() => (table.value ? [] : session.value.resources.map((entry) => entry.ref)),
	(refs) => {
		for (const ref_ of refs) void builder.loadResource(ref_)
	},
	{ immediate: true },
)

function readBy(ref_: string): number {
	return readers.value[ref_] ?? 0
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function describe(entry: ResourceSummary): string {
	const fields = session.value.resourceStructures[entry.ref]?.fields.length
	const readersHere = readBy(entry.ref)
	return [
		fields === undefined ? '' : plural(fields, 'field'),
		readersHere ? `read by ${plural(readersHere, 'block')} on this page` : '',
	]
		.filter(Boolean)
		.join(' · ')
}

function open(ref_: string): void {
	session.value.table = { ref: ref_, tab: 'fields', adding: false }
}

function setTab(tab: string | number): void {
	if (table.value) {
		session.value.table = { ...table.value, tab: tab as TableTab }
	}
}

function setAdding(adding: boolean): void {
	if (table.value) session.value.table = { ...table.value, adding }
}

function cancelComposing(): void {
	composing.value = false
	newName.value = ''
}

async function create(): Promise<void> {
	const name = newName.value.trim()
	if (!name) return
	const created = await builder.createResource(name, [FIRST_FIELD])
	if (!created) return
	cancelComposing()
	open(created)
}

async function addField(spec: FieldSpec): Promise<void> {
	const ref_ = table.value?.ref
	if (!ref_ || addingField.value) return
	addingField.value = true
	try {
		await builder.addField(ref_, spec)
	} finally {
		addingField.value = false
	}
	// A refused field leaves the form as it was, for the author to fix.
	const added = session.value.resourceStructures[ref_]?.fields.some(
		(field) => field.name === spec.name,
	)
	if (added) setAdding(false)
}
</script>

<template>
	<!-- A field being added: a step of its own, back returns to the grid. -->
	<DmsBuilderFieldForm
		v-if="table?.adding"
		:resource="table.ref"
		:busy="addingField"
		@cancel="setAdding(false)"
		@submit="addField"
	/>

	<div v-else-if="table" class="flex flex-col gap-4">
		<div class="flex flex-wrap gap-2">
			<UBadge
				color="neutral"
				variant="outline"
				icon="i-ph-lightning"
				label="Saved as you edit — no Save needed"
			/>
			<UBadge
				v-if="readBy(table.ref)"
				color="neutral"
				variant="outline"
				icon="i-ph-squares-four"
				:label="`Read by ${plural(readBy(table.ref), 'block')} on this page`"
			/>
		</div>

		<UTabs
			:items="tabs"
			:model-value="table.tab"
			:content="false"
			variant="link"
			@update:model-value="setTab"
		/>

		<p v-if="unreadable" class="text-sm text-muted">
			This table could not be read. It may have been removed from the code.
		</p>
		<p
			v-else-if="!structure"
			class="flex items-center gap-2 text-sm text-muted"
		>
			<UIcon name="i-ph-circle-notch" class="size-4 animate-spin" />
			Reading the table…
		</p>
		<DmsBuilderFieldGrid
			v-else-if="table.tab === 'fields'"
			:resource="table.ref"
			@add="setAdding(true)"
		/>
		<DmsBuilderTableApi v-else-if="table.tab === 'api'" :resource="table.ref" />
		<DmsBuilderTableSettings
			v-else
			:resource="table.ref"
			:read-by="readBy(table.ref)"
		/>
	</div>

	<div v-else class="flex flex-col gap-3.5">
		<div v-if="session.resources.length" class="flex items-center gap-2">
			<UInput
				v-model="query"
				icon="i-ph-magnifying-glass"
				placeholder="Find a table"
				aria-label="Find a table"
				class="flex-1"
			/>
			<UButton
				icon="i-ph-plus"
				label="New table"
				:variant="composerOpen ? 'soft' : 'solid'"
				@click="composerOpen ? cancelComposing() : (composing = true)"
			/>
		</div>

		<div
			v-if="composerOpen"
			class="flex flex-col gap-3.5 rounded-lg border border-accented bg-elevated p-3.5"
		>
			<p class="text-sm font-semibold text-highlighted">New table</p>
			<UFormField
				label="Name"
				help="Names the table and its API. It can't be renamed afterwards."
			>
				<UInput
					v-model="newName"
					placeholder="Product"
					autofocus
					class="w-full"
					@keydown.enter="create"
				/>
			</UFormField>
			<div class="flex flex-wrap items-center gap-2 text-xs text-muted">
				<span>Starts with</span>
				<UBadge color="neutral" variant="subtle" icon="i-ph-text-t">
					Title
					<span v-if="advanced" class="font-mono text-muted">title</span>
				</UBadge>
				<span>— add the rest once it exists.</span>
			</div>
			<div class="flex gap-2">
				<UButton
					label="Create table"
					:disabled="!newName.trim()"
					@click="create"
				/>
				<UButton
					v-if="session.resources.length"
					label="Cancel"
					color="neutral"
					variant="ghost"
					@click="cancelComposing"
				/>
			</div>
		</div>

		<template v-if="session.resources.length">
			<p class="pt-1 text-xs font-medium text-muted">
				{{ plural(session.resources.length, 'table') }}
			</p>
			<div class="overflow-hidden rounded-lg border border-default">
				<UButton
					v-for="entry in listed"
					:key="entry.ref"
					color="neutral"
					variant="ghost"
					block
					trailing-icon="i-ph-caret-right"
					class="justify-start gap-3 rounded-none border-t border-default px-3 py-2.5 text-left font-normal first:border-t-0"
					@click="open(entry.ref)"
				>
					<span
						class="flex size-8 shrink-0 items-center justify-center rounded-md border border-default bg-accented text-muted"
					>
						<UIcon name="i-ph-database" class="size-4" />
					</span>
					<span class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span class="truncate text-sm font-medium text-default">
							{{ entry.ref }}
						</span>
						<span class="truncate text-xs text-muted">
							{{ describe(entry) }}
						</span>
					</span>
				</UButton>
				<p v-if="!listed.length" class="px-3 py-3 text-xs text-muted">
					No table matches “{{ query.trim() }}”.
				</p>
			</div>
		</template>
		<p v-else class="text-xs text-muted">
			No table yet — name the first one above.
		</p>
	</div>
</template>

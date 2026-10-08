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
	() => session.value.resources.map((entry) => entry.ref),
	(refs) => {
		for (const ref_ of refs) void builder.loadResource(ref_)
	},
	{ immediate: true },
)

/** What the open table is, under its name: where it answers, who reads it. */
const headline = computed(() => {
	const read = structure.value
	const ref_ = table.value?.ref
	if (!read || !ref_) {
		return ''
	}
	const readersHere = readBy(ref_)
	return [
		`${plural(read.fields.length, 'field')}`,
		`served at ${read.route}`,
		readersHere ? `read by ${plural(readersHere, 'block')} on this page` : '',
	]
		.filter(Boolean)
		.join(' · ')
})

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
	<!-- The tables in a list that stays, the open one beside it: going from one
	table to another is one click, not back and forth. -->
	<div class="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
		<aside
			class="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-default bg-(--dms-bg-sidebar) p-3"
			aria-label="Tables"
		>
			<div class="flex items-center gap-2">
				<UInput
					v-model="query"
					icon="i-ph-magnifying-glass-light"
					placeholder="Find a table"
					aria-label="Find a table"
					size="sm"
					class="min-w-0 flex-1"
				/>
				<UButton
					icon="i-ph-plus-light"
					label="Table"
					size="sm"
					:variant="composerOpen ? 'soft' : 'solid'"
					aria-label="New table"
					@click="composerOpen ? cancelComposing() : (composing = true)"
				/>
			</div>

			<div
				v-if="composerOpen"
				class="flex flex-col gap-3 rounded-lg border border-accented bg-default p-3"
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
					<UBadge color="neutral" variant="subtle" icon="i-ph-text-t-light">
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
				<DmsEyebrow class="px-1">{{ plural(session.resources.length, 'table') }}</DmsEyebrow>
				<div class="flex flex-col gap-0.5">
					<UButton
						v-for="entry in listed"
						:key="entry.ref"
						color="neutral"
						variant="ghost"
						block
						class="justify-start gap-2.5 px-2 py-2 text-left font-normal"
						:class="table?.ref === entry.ref ? 'bg-primary/10' : ''"
						:aria-current="table?.ref === entry.ref ? 'true' : undefined"
						@click="open(entry.ref)"
					>
						<span
							class="flex size-7.5 shrink-0 items-center justify-center rounded-md border border-default bg-default text-toned"
						>
							<UIcon name="i-ph-database-light" class="size-4" />
						</span>
						<span class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span
								class="truncate text-[13px] font-semibold"
								:class="table?.ref === entry.ref ? 'text-primary' : 'text-highlighted'"
							>
								{{ entry.ref }}
							</span>
							<span class="truncate font-mono text-[11px] text-muted">
								{{ describe(entry) }}
							</span>
						</span>
					</UButton>
					<p v-if="!listed.length" class="px-2 py-2 text-xs text-muted">
						No table matches “{{ query.trim() }}”.
					</p>
				</div>
			</template>
			<p v-else-if="!composerOpen" class="text-xs text-muted">
				No table yet — name the first one above.
			</p>
		</aside>

		<section class="flex min-h-0 min-w-0 flex-col overflow-y-auto">
			<!-- A field being added: a step of its own, back returns to the grid. -->
			<div v-if="table?.adding" class="mx-auto w-full max-w-3xl p-6">
				<DmsBuilderFieldForm
					:resource="table.ref"
					:busy="addingField"
					@cancel="setAdding(false)"
					@submit="addField"
				/>
			</div>

			<div v-else-if="table" class="flex flex-col">
				<header class="flex items-start gap-3 px-6 pt-5 pb-3">
					<span
						class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-(--dms-accent-tint) text-primary ring-1 ring-(--dms-accent-line) ring-inset"
					>
						<UIcon name="i-ph-database-light" class="size-[19px]" />
					</span>
					<div class="min-w-0 flex-1">
						<p class="flex items-center gap-2">
							<b class="truncate text-xl font-semibold tracking-tight text-highlighted">
								{{ table.ref }}
							</b>
							<span
								v-if="structure"
								class="rounded-md border border-default px-1.5 font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase"
							>
								{{ structure.tableName }}
							</span>
						</p>
						<p class="truncate font-mono text-xs text-muted">
							{{ headline }}
						</p>
					</div>
					<UButton
						icon="i-ph-plus-light"
						label="Add field"
						size="sm"
						:disabled="!structure"
						@click="setTab('fields'); setAdding(true)"
					/>
				</header>

				<div class="px-6">
					<UTabs
						:items="tabs"
						:model-value="table.tab"
						:content="false"
						variant="link"
						@update:model-value="setTab"
					/>
				</div>

				<div class="flex flex-col gap-4 px-6 py-5">
					<div
						class="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-toned"
					>
						<UIcon name="i-ph-lightning-light" class="mt-px size-4 shrink-0 text-warning" />
						<span>
							<b class="font-semibold text-highlighted">Written at once.</b>
							A change here goes straight to the project, for every page reading
							{{ table.ref }}; Save and Discard leave it as it is. The change list
							keeps a note of it.
						</span>
					</div>

					<p v-if="unreadable" class="text-sm text-muted">
						This table could not be read. It may have been removed from the code.
					</p>
					<div v-else-if="!structure" class="flex flex-col gap-2" aria-busy="true">
						<USkeleton v-for="line in 4" :key="line" class="h-11 w-full" />
						<span class="sr-only">Reading the table…</span>
					</div>
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
			</div>

			<div
				v-else-if="session.resources.length"
				class="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center"
			>
				<span
					class="grid size-10 place-items-center rounded-lg bg-elevated text-muted ring-1 ring-default ring-inset"
				>
					<UIcon name="i-ph-database-light" class="size-5" />
				</span>
				<p class="text-sm font-semibold text-highlighted">Pick a table</p>
				<p class="max-w-sm text-xs text-muted">
					Its fields, its API and its settings open here. A table stores rows
					— orders, customers — and gives them an API the blocks read.
				</p>
			</div>

			<div v-else class="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
				<span
					class="grid size-10 place-items-center rounded-lg bg-elevated text-muted ring-1 ring-default ring-inset"
				>
					<UIcon name="i-ph-database-light" class="size-5" />
				</span>
				<p class="text-sm font-semibold text-highlighted">No table yet</p>
				<p class="max-w-sm text-xs text-muted">
					A table stores rows — orders, customers — and gives them an API the
					blocks read. Name the first one in the list.
				</p>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { readAfterSubmit, writeAfterSubmit } from '../runtime/after-submit'
import { useBlockPanel } from '../runtime/block-panel'
import { PANEL_CARD } from '../runtime/form-panel'
import { savedRowOf, type ResourceFormMode } from '../runtime/resource-form-panel'
import { useBuilder } from '../runtime/session'
import { columnsInOrder } from '../runtime/table-panel'

/**
 * A table form, as someone building a page sets one up, in three cards: the
 * data it works on — its table, what it does with a row, the fields it asks
 * for —, what it shows on the page, and what happens once it is sent. Where
 * the row id is read from, and what every submit adds, are the advanced
 * view's.
 */
const props = defineProps<{ path: string }>()

const builder = useBuilder()
const session = builder.session
const block = useBlockPanel(() => props.path)
const { config, text } = block

/* ---- the data ----------------------------------------------------------- */

const table = computed(() => block.block.value?.controller)
const tableItems = computed(() =>
	session.value.resources.map((entry) => ({ label: entry.ref, value: entry.ref })),
)
const fields = computed(() =>
	table.value
		? columnsInOrder(session.value.resourceStructures[table.value]?.fields)
		: [],
)
const fieldNames = computed(() =>
	fields.value.map((field) => field.label || field.name).join(', '),
)

const MODES: Array<{ value: ResourceFormMode; label: string }> = [
	{ value: 'new', label: 'Creates' },
	{ value: 'edit', label: 'Edits' },
	{ value: 'view', label: 'Shows' },
]

const HINTS: Record<ResourceFormMode, string> = {
	new: "Adds a new row each time it's sent.",
	edit: 'The row the page is opened on, saved with the changes.',
	view: 'The row the page is opened on, read-only.',
}

const mode = computed(() => text('mode') as ResourceFormMode | '')
const savedRow = computed(() => savedRowOf(mode.value, config.value.rowId))

function pick(ref: unknown): void {
	if (typeof ref === 'string' && ref !== table.value) {
		builder.setController(props.path, ref)
	}
}

/**
 * Another mode knows the row it saved by another variable: a page it was to
 * open on that row is opened on the new one. Showing a row saves none, and
 * leaves the address as it is, for the mode that comes next.
 */
function setMode(next: ResourceFormMode): void {
	const values: Record<string, unknown> = { mode: next }
	const then = readAfterSubmit(text('redirectOnSuccess'), true)
	const row = savedRowOf(next, config.value.rowId)
	if (then?.openRow && row) {
		values.redirectOnSuccess = writeAfterSubmit(then.page, true, row)
	}
	block.patch(values)
}
</script>

<template>
	<div class="flex flex-col gap-3">
		<section :class="PANEL_CARD" aria-label="Data">
			<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
				<UIcon name="i-ph-table" class="size-4 text-primary" />
				Data
			</p>
			<div class="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
				<span class="text-sm text-muted">Table</span>
				<USelectMenu
					:model-value="table"
					:items="tableItems"
					value-key="value"
					placeholder="Choose a table…"
					aria-label="Table"
					class="w-full"
					@update:model-value="pick($event)"
				/>
			</div>

			<div v-if="block.has('mode')" class="flex flex-col gap-1.5">
				<span class="text-sm text-muted">The form</span>
				<div
					role="group"
					aria-label="What the form does"
					class="grid grid-cols-3 gap-1 rounded-lg border border-accented bg-default p-0.75"
				>
					<button
						v-for="item in MODES"
						:key="item.value"
						type="button"
						:aria-pressed="mode === item.value"
						class="h-8 rounded-[5px] px-3 text-[13px] transition-colors"
						:class="
							mode === item.value
								? 'bg-primary font-semibold text-inverted'
								: 'font-medium text-toned hover:bg-elevated'
						"
						@click="setMode(item.value)"
					>
						{{ item.label }}
					</button>
				</div>
				<span v-if="mode" class="text-[13px]/[18px] text-muted">{{ HINTS[mode] }}</span>
				<span v-else class="text-[13px]/[18px] text-warning">
					Pick what the form does with a row.
				</span>
			</div>

			<div class="h-px bg-(--ui-border)" />

			<button
				type="button"
				class="flex items-center gap-2.5 text-left text-sm disabled:opacity-60"
				:disabled="!table"
				@click="builder.setView('resource')"
			>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="font-medium text-default">
						{{
							table
								? `${fields.length} field${fields.length === 1 ? '' : 's'}`
								: 'No table yet'
						}}
					</span>
					<span class="truncate text-[13px]/[18px] text-muted">
						{{ table ? fieldNames : 'Choose a table to see its fields.' }}
					</span>
				</span>
				<span
					v-if="table"
					class="flex shrink-0 items-center gap-1 font-medium text-primary"
				>
					Go to Tables
					<UIcon name="i-ph-arrow-right" class="size-4" />
				</span>
			</button>
			<p
				v-if="table"
				class="flex gap-2 rounded-md bg-warning/10 px-2.5 py-2 text-xs text-warning"
			>
				<UIcon name="i-ph-info" class="mt-px size-3.5 shrink-0" />
				Fields belong to the table: editing them changes every page that uses it.
			</p>
		</section>

		<DmsBuilderOnThePage :path="path" />

		<!-- Showing a row sends nothing: there is no button, and nowhere to go. -->
		<DmsBuilderSubmitSettings v-if="mode !== 'view'" :path="path" :saved-row="savedRow" />
	</div>
</template>

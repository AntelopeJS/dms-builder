<script setup lang="ts">
import { computed } from 'vue'
import { readAfterSubmit, writeAfterSubmit } from '../runtime/after-submit'
import { useBlockPanel } from '../runtime/block-panel'
import { PANEL_CARD } from '../runtime/form-panel'
import { savedRowOf, type ResourceFormMode } from '../runtime/resource-form-panel'
import { useBuilder } from '../runtime/session'
import {
	columnsInOrder,
	columnsTaken,
	SHARED_TABLE_WARNING,
} from '../runtime/table-panel'

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
const fields = computed(() =>
	table.value
		? columnsInOrder(session.value.resourceStructures[table.value]?.fields)
		: [],
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

function pick(ref: string): void {
	if (ref !== table.value) {
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
				<UIcon name="i-ph-table-light" class="size-4 text-primary" />
				Data
			</p>
			<DmsBuilderTableChoice
				:model-value="table"
				note="The table its fields come from"
				label="Table the form works on"
				empty-title="Pick the table it works on"
				empty-hint="The form asks for the table's fields, in the table's order. Choose next whether it creates, edits or shows a row."
				@update:model-value="pick"
			/>

			<div v-if="block.has('mode')" class="flex flex-col gap-1.5">
				<span class="text-sm text-muted">The form</span>
				<div
					role="group"
					aria-label="What the form does"
					class="grid grid-cols-3 gap-0.5 rounded-lg border border-default bg-(--dms-bg-muted) p-0.5"
				>
					<button
						v-for="item in MODES"
						:key="item.value"
						type="button"
						:aria-pressed="mode === item.value"
						class="h-8 rounded-[5px] px-3 text-[13px] transition-colors"
						:class="
							mode === item.value
								? 'bg-default font-semibold text-highlighted shadow-sm ring-1 ring-accented'
								: 'font-medium text-muted hover:text-highlighted'
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

			<DmsBuilderTableLink
				v-if="table"
				:table="table"
				:summary="`${columnsTaken(fields.length, fields.length)} in the form`"
				:warning="`Fields belong to the table: ${SHARED_TABLE_WARNING}`"
			/>
		</section>

		<DmsBuilderOnThePage :path="path" />

		<!-- Showing a row sends nothing: there is no button, and nowhere to go. -->
		<DmsBuilderSubmitSettings v-if="mode !== 'view'" :path="path" :saved-row="savedRow" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { dataTypeItem } from '../runtime/catalog'
import { fieldFlags } from '../runtime/constants'
import { useBuilder } from '../runtime/session'
import { useTableBlock } from '../runtime/table-panel'
import type { FieldFlag, ResourceFieldStructure } from '../runtime/types'

/**
 * The columns of the table a table block lists, left to right: whether each
 * shows, and whether the search bar and the filters read it. They are the
 * table's own, so a change applies at once, on every page listing it.
 */
const props = defineProps<{ path: string }>()

const ASPECTS = fieldFlags('listable', 'searchable', 'filterable')

const builder = useBuilder()
const session = builder.session
const table = useTableBlock(() => props.path)

const tableRef = computed(() => table.table.value ?? '')
const columns = computed(() => table.columns.value)
/** The columns while a move is written: already where they are going. */
const moving = computed(() => session.value.pending.includes(tableRef.value))

/** The column being dragged, and the one it would land on. */
const dragged = ref<string | null>(null)
const over = ref<string | null>(null)

function labelOf(column: ResourceFieldStructure): string {
	return column.label || column.name
}

function writing(column: ResourceFieldStructure): boolean {
	return (
		moving.value || session.value.pending.includes(`${tableRef.value}#${column.name}`)
	)
}

function toggle(column: ResourceFieldStructure, key: FieldFlag, on: boolean): void {
	void builder.configureField(`${tableRef.value}#${column.name}`, { [key]: on })
}

/** Put `name` where `target` stands, the others keeping their order. */
function moveTo(name: string, target: string): void {
	const names = columns.value.map((column) => column.name)
	const from = names.indexOf(name)
	const to = names.indexOf(target)
	if (from < 0 || to < 0 || from === to) return
	names.splice(from, 1)
	names.splice(to, 0, name)
	void builder.orderFields(tableRef.value, names)
}

function step(column: ResourceFieldStructure, delta: number): void {
	const names = columns.value.map((entry) => entry.name)
	const target = names[names.indexOf(column.name) + delta]
	if (target) moveTo(column.name, target)
}

function onKey(event: KeyboardEvent, column: ResourceFieldStructure): void {
	const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
	if (!delta) return
	event.preventDefault()
	step(column, delta)
}

function onDragStart(event: DragEvent, column: ResourceFieldStructure): void {
	dragged.value = column.name
	event.dataTransfer?.setData('text/plain', column.name)
	if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent, column: ResourceFieldStructure): void {
	if (!dragged.value) return
	event.preventDefault()
	over.value = column.name
}

function onDrop(event: DragEvent, column: ResourceFieldStructure): void {
	event.preventDefault()
	if (dragged.value) moveTo(dragged.value, column.name)
	dragged.value = null
	over.value = null
}

function onDragEnd(): void {
	dragged.value = null
	over.value = null
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between gap-2">
			<p class="flex items-center gap-1.5 text-xs font-medium text-toned">
				Columns
				<UBadge
					color="primary"
					variant="soft"
					size="sm"
					icon="i-ph-lightning-fill"
					label="Now"
					title="Changes the table at once, on every page listing it"
				/>
			</p>
			<UButton
				size="xs"
				variant="link"
				trailing-icon="i-ph-arrow-square-out"
				label="Open the table"
				class="px-0"
				@click="builder.openTable(tableRef)"
			/>
		</div>

		<div class="overflow-hidden rounded-lg border border-default">
			<div class="flex h-7 items-center bg-elevated px-2.5 text-xs font-medium text-muted">
				<span class="flex-1 pl-7.5">Column</span>
				<span v-for="aspect in ASPECTS" :key="aspect.key" class="w-12 text-center">
					{{ aspect.label }}
				</span>
			</div>
			<div
				v-for="column in columns"
				:key="column.name"
				class="flex h-10 items-center border-t px-2.5 transition-colors"
				:class="[
					over === column.name && dragged !== column.name
						? 'border-t-primary'
						: 'border-default',
					dragged === column.name ? 'opacity-50' : 'hover:bg-elevated/60',
				]"
				:draggable="!column.opaque && !moving"
				@dragstart="onDragStart($event, column)"
				@dragover="onDragOver($event, column)"
				@drop="onDrop($event, column)"
				@dragend="onDragEnd"
			>
				<span class="flex min-w-0 flex-1 items-center gap-1.5">
					<UButton
						icon="i-ph-dots-six-vertical"
						color="neutral"
						variant="ghost"
						size="xs"
						square
						class="cursor-grab text-dimmed"
						:aria-label="`Move ${labelOf(column)}`"
						title="Drag to move, or use the arrow keys"
						:disabled="column.opaque || moving"
						@keydown="onKey($event, column)"
					/>
					<UIcon
						:name="dataTypeItem(column.dataType?.$dataType).icon"
						class="size-4 shrink-0"
						:class="column.listable ? 'text-muted' : 'text-dimmed'"
					/>
					<span
						class="truncate text-sm"
						:class="column.listable ? 'text-default' : 'text-dimmed'"
					>
						{{ labelOf(column) }}
					</span>
					<UIcon
						v-if="column.opaque"
						name="i-ph-lock-simple"
						class="size-3 shrink-0 text-dimmed"
						title="Set up in code"
					/>
				</span>
				<span
					v-for="aspect in ASPECTS"
					:key="aspect.key"
					class="flex w-12 justify-center"
				>
					<UCheckbox
						:model-value="column[aspect.key] === true"
						:disabled="column.opaque || writing(column)"
						:aria-label="`${labelOf(column)}: ${aspect.label}`"
						@update:model-value="toggle(column, aspect.key, $event === true)"
					/>
				</span>
			</div>
			<p v-if="!columns.length" class="border-t border-default px-3 py-3 text-xs text-muted">
				This table has no column yet.
			</p>
		</div>
		<p class="text-xs leading-relaxed text-dimmed">
			Changed at once, on every page listing {{ tableRef }}. Drag a row to move its
			column.
		</p>
	</div>
</template>

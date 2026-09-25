<script setup lang="ts">
import { computed, watch } from 'vue'
import { dataTypeItem } from '../runtime/catalog'
import { useBuilder } from '../runtime/session'
import { useTableBlock } from '../runtime/table-panel'
import type { ResourceFieldStructure } from '../runtime/types'

/**
 * A table, as someone building a page sets one up: what it is called, the
 * table it lists and that table's columns, how its rows come and are named,
 * and what people can do with them. Forms, tabs and displays are the advanced
 * view's.
 */
const props = defineProps<{ path: string }>()

/**
 * The one choice of a menu that means no column. A menu item cannot stand for
 * an empty value, and no column's name starts with a hash.
 */
const NONE = '#none'

const builder = useBuilder()
const table = useTableBlock(() => props.path)
const config = table.config

watch(
	() => table.table.value,
	(ref) => {
		if (ref) void builder.loadResource(ref)
	},
	{ immediate: true },
)

const caption = computed(() =>
	typeof config.value.caption === 'string' ? config.value.caption : '',
)

function labelOf(column: ResourceFieldStructure): string {
	return column.label || column.name
}

function iconOf(column: ResourceFieldStructure | undefined): string {
	return dataTypeItem(column?.dataType?.$dataType ?? 'string').icon
}

function columnNamed(name: string | undefined): ResourceFieldStructure | undefined {
	return table.columns.value.find((column) => column.name === name)
}

/**
 * The columns a menu offers, and the one already chosen even when it is not
 * among them — written in code, or no longer read that way — so it shows as
 * the choice it is.
 */
function itemsOf(
	offered: ResourceFieldStructure[],
	chosen: string | undefined,
	none: string,
): Array<Record<string, unknown>> {
	const items: Array<Record<string, unknown>> = [
		{ label: none, value: NONE, icon: 'i-ph-minus' },
		...offered.map((column) => ({
			label: labelOf(column),
			value: column.name,
			icon: iconOf(column),
		})),
	]
	if (chosen && !offered.some((column) => column.name === chosen)) {
		const column = columnNamed(chosen)
		items.push({
			label: column ? labelOf(column) : chosen,
			value: chosen,
			icon: iconOf(column),
		})
	}
	return items
}

/* ---- the order rows come in -------------------------------------------- */

const sort = computed(() => {
	const value = config.value.defaultSort as
		| { field?: unknown; desc?: unknown }
		| undefined
	return typeof value?.field === 'string'
		? { field: value.field, desc: value.desc === true }
		: undefined
})
const sortable = computed(() =>
	table.columns.value.filter((column) => column.sortable && !column.opaque),
)
const sortItems = computed(() =>
	itemsOf(sortable.value, sort.value?.field, 'As the table returns them'),
)
const sortColumn = computed(() => columnNamed(sort.value?.field))

/**
 * The two ways a column is sorted, in the words its type reads in, the way
 * people want it first leading: the newest date, the largest number, and
 * text from A.
 */
const directions = computed(() => {
	const type = sortColumn.value?.dataType?.$dataType ?? 'string'
	if (['date', 'string_time'].includes(type)) {
		return [
			{ desc: true, label: 'Newest first' },
			{ desc: false, label: 'Oldest first' },
		]
	}
	if (['number', 'price', 'percentage'].includes(type)) {
		return [
			{ desc: true, label: 'Largest first' },
			{ desc: false, label: 'Smallest first' },
		]
	}
	return [
		{ desc: false, label: 'A to Z' },
		{ desc: true, label: 'Z to A' },
	]
})

function setSortField(value: unknown): void {
	const field = String(value)
	if (field === NONE) {
		table.patch({ defaultSort: undefined })
		return
	}
	const type = columnNamed(field)?.dataType?.$dataType
	// A date reads newest first, unless the author already chose otherwise.
	const desc = sort.value ? sort.value.desc : type === 'date'
	table.patch({ defaultSort: desc ? { field, desc } : { field } })
}

function setDesc(desc: boolean): void {
	if (!sort.value) return
	table.patch({
		defaultSort: desc
			? { field: sort.value.field, desc }
			: { field: sort.value.field },
	})
}

const sortHint = computed(() => {
	const names = sortable.value.map(labelOf)
	return names.length
		? `Among the columns ${table.table.value} sorts by: ${names.join(', ')}.`
		: `${table.table.value} sorts by no column yet: turn Sort on for one in Tables.`
})

/* ---- what a row is called ----------------------------------------------- */

const labelKey = computed(() =>
	typeof config.value.labelKey === 'string' ? config.value.labelKey : undefined,
)
const nameItems = computed(() =>
	itemsOf(
		table.columns.value.filter((column) => column.listable && !column.opaque),
		labelKey.value,
		'No column',
	),
)
</script>

<template>
	<div class="flex flex-col gap-[22px]">
		<div v-if="table.has('caption')" class="flex flex-col gap-1.5">
			<label for="table-caption" class="text-xs font-medium text-toned">Title</label>
			<UInput
				id="table-caption"
				:model-value="caption"
				size="lg"
				placeholder="Shown above the table — optional"
				@update:model-value="
					table.patch({ caption: String($event) === '' ? undefined : String($event) })
				"
			/>
		</div>

		<div class="flex flex-col gap-3.5">
			<p class="text-xs font-semibold text-toned">Data</p>
			<DmsBuilderTableSource :path="path" />

			<template v-if="table.table.value && table.structure.value">
				<DmsBuilderTableColumns :path="path" />

				<div
					v-if="table.has('defaultSort') || table.has('labelKey')"
					class="flex flex-col gap-2"
				>
					<p class="text-xs font-medium text-toned">Rows</p>
					<div class="overflow-hidden rounded-lg border border-default">
						<div
							v-if="table.has('defaultSort')"
							class="flex flex-col gap-1.5 px-3 py-2.5"
						>
							<label class="text-xs text-muted">Come sorted by</label>
							<div class="flex gap-1.5">
								<USelectMenu
									:model-value="sort?.field ?? NONE"
									:items="sortItems"
									value-key="value"
									:icon="sort ? iconOf(sortColumn) : 'i-ph-minus'"
									aria-label="Rows come sorted by"
									class="min-w-0 flex-1"
									@update:model-value="setSortField($event)"
								/>
								<div
									v-if="sort"
									role="group"
									aria-label="Order"
									class="flex shrink-0 rounded-md border border-accented bg-default p-0.5"
								>
									<UButton
										v-for="entry in directions"
										:key="entry.label"
										:label="entry.label"
										size="xs"
										:color="sort.desc === entry.desc ? 'primary' : 'neutral'"
										:variant="sort.desc === entry.desc ? 'soft' : 'ghost'"
										:aria-pressed="sort.desc === entry.desc"
										@click="setDesc(entry.desc)"
									/>
								</div>
							</div>
							<p class="text-xs text-dimmed">{{ sortHint }}</p>
						</div>
						<div
							v-if="table.has('labelKey')"
							class="flex flex-col gap-1.5 px-3 py-2.5"
							:class="table.has('defaultSort') ? 'border-t border-default' : ''"
						>
							<label class="text-xs text-muted">Are called by</label>
							<USelectMenu
								:model-value="labelKey ?? NONE"
								:items="nameItems"
								value-key="value"
								:icon="labelKey ? iconOf(columnNamed(labelKey)) : 'i-ph-minus'"
								aria-label="Rows are called by"
								@update:model-value="
									table.patch({
										labelKey: $event === NONE ? undefined : String($event),
									})
								"
							/>
							<p class="text-xs text-dimmed">In the title of their dialogs.</p>
						</div>
					</div>
				</div>
			</template>
		</div>

		<DmsBuilderTableActions
			v-if="table.table.value && table.structure.value"
			:path="path"
		/>
	</div>
</template>

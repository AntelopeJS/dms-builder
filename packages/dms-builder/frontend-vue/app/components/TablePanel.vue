<script setup lang="ts">
import { computed, watch } from 'vue'
import { dataTypeItem, sortDirections } from '../runtime/catalog'
import { CARD_FIELD_UI, PANEL_CARD } from '../runtime/form-panel'
import { useBuilder } from '../runtime/session'
import {
	columnsTaken,
	SHARED_TABLE_WARNING,
	useTableBlock,
} from '../runtime/table-panel'
import type { ResourceFieldStructure } from '../runtime/types'

/**
 * A table, as someone building a page sets one up: the table it lists — its
 * columns are that table's own, set where the table is —, how its rows come
 * and are named, what it is called, and what people can do with the rows.
 * Forms, tabs and displays are the advanced view's.
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
	return dataTypeItem(column?.dataType?.$dataType).icon
}

function columnNamed(name: string | undefined): ResourceFieldStructure | undefined {
	return table.columns.value.find((column) => column.name === name)
}

/** The columns the table shows on first load, out of all it has. */
const shownCount = computed(
	() => table.columns.value.filter((column) => column.listable).length,
)

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
const sortColumn = computed(() => columnNamed(sort.value?.field))

/** A column and the way it sorts, as one choice: `desc:created`. */
function sortValue(field: string, desc: boolean): string {
	return `${desc ? 'desc' : 'asc'}:${field}`
}

/**
 * Each column the table sorts by, under its name, the two ways it sorts —
 * and the one already chosen even when it is not among them, so it shows as
 * the choice it is.
 */
const sortItems = computed(() => {
	const columns: Array<{ name: string; column?: ResourceFieldStructure }> =
		sortable.value.map((column) => ({ name: column.name, column }))
	const chosen = sort.value?.field
	if (chosen && !columns.some((entry) => entry.name === chosen)) {
		columns.push({ name: chosen, column: columnNamed(chosen) })
	}
	return [
		[
			{
				label: 'None',
				description: 'As the table returns them',
				value: NONE,
				icon: 'i-ph-minus',
			},
		],
		...columns.map(({ name, column }) => [
			{ type: 'label' as const, label: column ? labelOf(column) : name },
			...sortDirections(column?.dataType?.$dataType).map((entry) => ({
				label: entry.label,
				value: sortValue(name, entry.desc),
				icon: entry.desc ? 'i-ph-arrow-down' : 'i-ph-arrow-up',
			})),
		]),
	]
})

function setSort(value: unknown): void {
	const choice = String(value)
	const at = choice.indexOf(':')
	if (choice === NONE || at < 0) {
		table.patch({ defaultSort: undefined })
		return
	}
	const field = choice.slice(at + 1)
	table.patch({
		defaultSort: choice.slice(0, at) === 'desc' ? { field, desc: true } : { field },
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
/**
 * The columns a row can be called by, and the one already chosen even when it
 * is not among them — written in code, or no longer shown — so it shows as the
 * choice it is.
 */
const nameItems = computed(() => {
	const offered = table.columns.value.filter(
		(column) => column.listable && !column.opaque,
	)
	const items = [
		{ label: 'None', value: NONE, icon: 'i-ph-minus' },
		...offered.map((column) => ({
			label: labelOf(column),
			value: column.name,
			icon: iconOf(column),
		})),
	]
	const chosen = labelKey.value
	if (chosen && !offered.some((column) => column.name === chosen)) {
		const column = columnNamed(chosen)
		items.push({
			label: column ? labelOf(column) : chosen,
			value: chosen,
			icon: iconOf(column),
		})
	}
	return items
})
</script>

<template>
	<div class="flex flex-col gap-3">
		<section :class="PANEL_CARD" aria-label="Data">
			<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
				<UIcon name="i-ph-table" class="size-4 text-primary" />
				Data
			</p>
			<DmsBuilderTableSource :path="path" />

			<template v-if="table.table.value && table.structure.value">
				<DmsBuilderTableLink
					:table="table.table.value"
					:summary="`${columnsTaken(shownCount, table.columns.value.length)} shown`"
					:warning="`Columns belong to the table: ${SHARED_TABLE_WARNING}`"
				/>

				<div
					v-if="table.has('defaultSort') || table.has('labelKey')"
					class="flex flex-col gap-2"
				>
					<p class="text-sm text-muted">Rows</p>
					<div class="divide-y divide-default rounded-lg border border-default bg-default">
						<div
							v-if="table.has('defaultSort')"
							class="flex min-h-11 items-center gap-2.5 px-3 py-1.5"
						>
							<span class="flex w-23 shrink-0 items-center gap-1.5 text-sm text-toned">
								Sort
								<UTooltip :text="sortHint">
									<button
										type="button"
										:aria-label="sortHint"
										class="flex text-dimmed hover:text-muted"
									>
										<UIcon name="i-ph-info" class="size-3.5" />
									</button>
								</UTooltip>
							</span>
							<USelectMenu
								:model-value="sort ? sortValue(sort.field, sort.desc) : undefined"
								:items="sortItems"
								value-key="value"
								placeholder="None"
								aria-label="Sort rows by"
								:search-input="false"
								:content="{ align: 'end' }"
								:icon="sort ? (sort.desc ? 'i-ph-arrow-down' : 'i-ph-arrow-up') : undefined"
								:ui="{ content: 'min-w-56', leadingIcon: 'text-primary' }"
								class="min-w-0 flex-1"
								@update:model-value="setSort($event)"
							>
								<template v-if="sort" #default>
									<span class="truncate">
										{{ sortColumn ? labelOf(sortColumn) : sort.field }}
									</span>
								</template>
							</USelectMenu>
						</div>
						<div
							v-if="table.has('labelKey')"
							class="flex min-h-11 items-center gap-2.5 px-3 py-1.5"
						>
							<span class="flex w-23 shrink-0 items-center gap-1.5 text-sm text-toned">
								Row name
								<UTooltip text="Shown in the title of their dialogs.">
									<button
										type="button"
										aria-label="Shown in the title of their dialogs."
										class="flex text-dimmed hover:text-muted"
									>
										<UIcon name="i-ph-info" class="size-3.5" />
									</button>
								</UTooltip>
							</span>
							<USelectMenu
								:model-value="labelKey"
								:items="nameItems"
								value-key="value"
								placeholder="None"
								:icon="labelKey ? iconOf(columnNamed(labelKey)) : undefined"
								aria-label="Name rows by"
								:content="{ align: 'end' }"
								:ui="{ content: 'min-w-48' }"
								class="min-w-0 flex-1"
								@update:model-value="
									table.patch({
										labelKey: $event === NONE ? undefined : String($event),
									})
								"
							/>
						</div>
					</div>
				</div>
			</template>
		</section>

		<section v-if="table.has('caption')" :class="PANEL_CARD" aria-label="On the page">
			<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
				<UIcon name="i-ph-text-t" class="size-4 text-primary" />
				On the page
			</p>
			<UFormField label="Title" :ui="CARD_FIELD_UI">
				<UInput
					class="w-full"
					:model-value="caption"
					size="lg"
					placeholder="Optional"
					@update:model-value="
						table.patch({ caption: String($event) === '' ? undefined : String($event) })
					"
				/>
			</UFormField>
		</section>

		<DmsBuilderTableActions
			v-if="table.table.value && table.structure.value"
			:path="path"
		/>
	</div>
</template>

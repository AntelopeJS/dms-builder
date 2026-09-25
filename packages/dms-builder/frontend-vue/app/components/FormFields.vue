<script setup lang="ts">
import { computed, ref } from 'vue'
import { dataTypeItem, dataTypeItems } from '../runtime/catalog'
import { DEFAULT_DATA_TYPE } from '../runtime/constants'
import { useFormBlock } from '../runtime/form-panel'
import {
	formRows,
	withColumn,
	withEntryMoved,
	withField,
	withoutEntry,
	type FormRow,
} from '../runtime/form-table'
import { useBuilder } from '../runtime/session'
import type { ResourceFieldStructure } from '../runtime/types'

/**
 * What a form asks for, in the order it asks: one line per field, opened for
 * the rest of it.
 *
 * A form saving into a table asks for its columns, and the ones it leaves out
 * are listed under it, a click away. A form sending elsewhere has no columns
 * to offer: its fields are the author's to add.
 */
const props = defineProps<{ path: string }>()

/** The types a field added by hand is most often, offered at a glance. */
const QUICK_TYPES = [DEFAULT_DATA_TYPE, 'number', 'date']
/** The tile beside them that opens the full list of types. */
const MORE_TILE = { value: 'more', label: 'More', icon: 'i-ph-dots-three' }

const builder = useBuilder()
const session = builder.session
const form = useFormBlock(() => props.path)

/** The line opened, by its place in the list. */
const open = ref<string | null>(null)
const adding = ref(false)
const newLabel = ref('')
const newType = ref(DEFAULT_DATA_TYPE)
const moreTypes = ref(false)

const rows = computed(() => formRows(form.config.value.fields))
const fieldCount = computed(() => rows.value.filter((row) => !row.group).length)
const bound = computed(() => form.destination.value.kind === 'table')
/** Fields written by hand: nothing lists the columns they fill. */
const manual = computed(
	() =>
		!bound.value &&
		(form.destination.value.kind === 'address' || rows.value.length > 0),
)
const unasked = computed(() =>
	bound.value
		? form.columns.value.filter((column) => !form.asked.value.has(column.name))
		: [],
)
const needed = form.needed
const neededNames = computed(() => needed.value.map(columnLabel).join(', '))
const served = computed(() => dataTypeItems(session.value.catalog))
const typeTiles = computed(() => [
	...QUICK_TYPES.map((id) => served.value.find((item) => item.value === id)).filter(
		(item) => item !== undefined,
	),
	MORE_TILE,
])

function key(path: number[]): string {
	return path.join('.')
}

function columnOf(entry: Record<string, unknown>): ResourceFieldStructure | undefined {
	return bound.value
		? form.columns.value.find((column) => column.name === entry.id)
		: undefined
}

function columnLabel(column: ResourceFieldStructure): string {
	return column.label ?? column.name
}

function titleOf(row: FormRow): string {
	const label = row.entry.label
	if (typeof label === 'string' && label) return label
	const column = columnOf(row.entry)
	if (column) return columnLabel(column)
	return typeof row.entry.id === 'string' ? row.entry.id : row.group ? 'Group' : 'Field'
}

function typeOf(entry: Record<string, unknown>) {
	const type = entry.type as { $dataType?: unknown } | string | undefined
	const id = typeof type === 'string' ? type : type?.$dataType
	return dataTypeItem(typeof id === 'string' ? id : 'string')
}

function subtitleOf(row: FormRow): string {
	if (row.group) {
		const count = Array.isArray(row.entry.fields) ? row.entry.fields.length : 0
		return `Group · ${count} field${count === 1 ? '' : 's'}`
	}
	const parts = [typeOf(row.entry).label]
	if (row.entry.required === true || columnOf(row.entry)?.required) {
		parts.push('Required')
	}
	const value = row.entry.defaultValue
	if (typeof value === 'string' || typeof value === 'number') {
		parts.push(`default ${value}`)
	}
	return parts.join(' · ')
}

/** A field sent under a name no column of the table has. */
function stray(row: FormRow): boolean {
	return bound.value && !row.group && !!form.structure.value && !columnOf(row.entry)
}

function toggle(row: FormRow): void {
	open.value = open.value === key(row.path) ? null : key(row.path)
}

/**
 * A move swaps two neighbours, and the line opened follows its field — or its
 * group, when the group moves.
 */
function move(row: FormRow, delta: number): void {
	const from = key(row.path)
	const at = row.path[row.path.length - 1] ?? 0
	const to = key([...row.path.slice(0, -1), at + delta])
	form.setFields(withEntryMoved(form.config.value.fields, row.path, delta))
	const line = open.value
	if (line !== null) {
		open.value = moved(line, from, to) ?? moved(line, to, from) ?? line
	}
}

/** Where the line at `line` goes when the entry at `from` goes to `to`. */
function moved(line: string, from: string, to: string): string | undefined {
	return line === from || line.startsWith(`${from}.`)
		? to + line.slice(from.length)
		: undefined
}

function leave(row: FormRow): void {
	form.setFields(withoutEntry(form.config.value.fields, row.path))
	open.value = null
}

function ask(columns: ResourceFieldStructure[]): void {
	let fields: unknown = form.config.value.fields
	for (const column of columns) {
		fields = withColumn(fields, column)
	}
	form.setFields(fields as unknown[])
}

function tileOn(value: string): boolean {
	return value === MORE_TILE.value
		? moreTypes.value
		: !moreTypes.value && newType.value === value
}

function pickTile(value: string): void {
	moreTypes.value = value === MORE_TILE.value
	if (!moreTypes.value) newType.value = value
}

function startAdding(): void {
	adding.value = true
	newLabel.value = ''
	newType.value = DEFAULT_DATA_TYPE
	moreTypes.value = false
}

/** Its key follows from the label, as a field's does in the simple mode. */
function addField(): void {
	const label = newLabel.value.trim()
	if (!label) return
	form.setFields(
		withField(form.config.value.fields, {
			label,
			type: { $dataType: newType.value, config: {} },
		}),
	)
	adding.value = false
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<p class="flex items-center gap-1.5 text-xs font-semibold text-toned">
				Fields
				<UBadge
					v-if="fieldCount"
					:label="fieldCount"
					color="primary"
					variant="soft"
					size="sm"
				/>
			</p>
			<span v-if="rows.length > 1" class="text-xs text-dimmed">
				In the form's order
			</span>
		</div>

		<UAlert
			v-if="needed.length"
			role="alert"
			color="warning"
			variant="subtle"
			icon="i-ph-warning"
			:actions="[
				{
					icon: 'i-ph-plus',
					color: 'warning',
					label:
						needed.length === 1
							? `Add ${neededNames} to the form`
							: 'Add them to the form',
					onClick: () => ask(needed),
				},
			]"
		>
			<template #description>
				The table can't save a row without {{ neededNames }}: every submit will
				fail until {{ needed.length === 1 ? 'it is' : 'they are' }} in the form.
			</template>
		</UAlert>

		<div
			v-if="!bound && !manual"
			class="flex items-center gap-2.5 rounded-lg border border-dashed border-accented px-3 py-3.5 text-xs text-dimmed"
		>
			<UIcon name="i-ph-list-bullets" class="size-4 shrink-0" />
			They appear here once a table is picked.
		</div>

		<div
			v-else-if="rows.length || unasked.length || manual"
			class="overflow-hidden rounded-lg border border-default"
		>
			<div
				v-for="(row, at) in rows"
				:key="key(row.path)"
				class="group"
				:class="[
					at > 0 ? 'border-t border-default' : '',
					open === key(row.path) ? 'bg-elevated' : '',
				]"
			>
				<div class="flex h-12 items-center" :class="row.path.length > 1 ? 'pl-5' : ''">
					<div
						v-if="row.group"
						class="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-2.5"
					>
						<span
							class="flex size-7 shrink-0 items-center justify-center rounded-md border border-default bg-accented text-muted"
						>
							<UIcon name="i-ph-folder-simple" class="size-4" />
						</span>
						<span class="flex min-w-0 flex-col">
							<span class="truncate text-sm font-medium text-default">
								{{ titleOf(row) }}
							</span>
							<span class="truncate text-xs text-dimmed">{{ subtitleOf(row) }}</span>
						</span>
					</div>
					<UButton
						v-else
						color="neutral"
						variant="ghost"
						class="h-full min-w-0 flex-1 rounded-none"
						:aria-expanded="open === key(row.path)"
						@click="toggle(row)"
					>
						<template #leading>
							<span
								class="flex size-7 shrink-0 items-center justify-center rounded-md border"
								:class="
									open === key(row.path)
										? 'border-primary/35 bg-primary/10 text-primary'
										: 'border-default bg-accented text-muted'
								"
							>
								<UIcon :name="typeOf(row.entry).icon" class="size-4" />
							</span>
						</template>
						<span class="flex min-w-0 flex-col text-left">
							<span
								class="truncate"
								:class="open === key(row.path) ? 'text-highlighted' : 'font-normal'"
							>
								{{ titleOf(row) }}
							</span>
							<span
								class="truncate text-xs font-normal"
								:class="stray(row) ? 'text-warning' : 'text-dimmed'"
							>
								{{
									stray(row)
										? `Not a column of ${form.table.value?.ref}`
										: subtitleOf(row)
								}}
							</span>
						</span>
					</UButton>
					<div
						class="flex items-center transition-opacity"
						:class="
							open === key(row.path)
								? ''
								: 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
						"
					>
						<UButton
							icon="i-ph-arrow-up"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="`Move ${titleOf(row)} up`"
							title="Earlier"
							:disabled="(row.path[row.path.length - 1] ?? 0) === 0"
							@click="move(row, -1)"
						/>
						<UButton
							icon="i-ph-arrow-down"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="`Move ${titleOf(row)} down`"
							title="Later"
							:disabled="(row.path[row.path.length - 1] ?? 0) === row.siblings - 1"
							@click="move(row, 1)"
						/>
						<UButton
							v-if="!row.group && open !== key(row.path)"
							icon="i-ph-minus-circle"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="
								bound
									? `Leave ${titleOf(row)} out of the form`
									: `Remove ${titleOf(row)}`
							"
							:title="bound ? 'Leave out' : 'Remove'"
							@click="leave(row)"
						/>
					</div>
					<span class="flex w-8 shrink-0 justify-center text-dimmed">
						<UIcon
							v-if="!row.group"
							:name="open === key(row.path) ? 'i-ph-caret-down' : 'i-ph-caret-right'"
							class="size-4"
						/>
					</span>
				</div>

				<DmsBuilderFormFieldDetail
					v-if="open === key(row.path)"
					:path="path"
					:entry-path="row.path"
					:entry="row.entry"
					:column="columnOf(row.entry)"
					@leave="leave(row)"
				/>
			</div>

			<template v-if="unasked.length">
				<p
					class="flex h-7 items-center bg-elevated px-2.5 text-xs font-medium text-dimmed"
					:class="rows.length ? 'border-t border-default' : ''"
				>
					Not in the form
				</p>
				<UButton
					v-for="column in unasked"
					:key="column.name"
					color="neutral"
					variant="ghost"
					trailing-icon="i-ph-plus"
					block
					class="justify-start rounded-none border-t border-default"
					:aria-label="`Add ${columnLabel(column)} to the form`"
					title="Add to the form"
					@click="ask([column])"
				>
					<template #leading>
						<span
							class="flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed"
							:class="
								column.required
									? 'border-warning/55 text-warning'
									: 'border-accented text-dimmed'
							"
						>
							<UIcon
								:name="dataTypeItem(column.dataType?.$dataType).icon"
								class="size-4"
							/>
						</span>
					</template>
					<span class="flex min-w-0 flex-1 flex-col text-left">
						<span
							class="flex min-w-0 items-center gap-1.5 font-normal"
							:class="column.required ? '' : 'text-muted'"
						>
							<span class="truncate">{{ columnLabel(column) }}</span>
							<UBadge
								v-if="column.required"
								label="Needed"
								color="warning"
								variant="soft"
								size="sm"
							/>
						</span>
						<span class="truncate text-xs font-normal text-dimmed">
							{{ dataTypeItem(column.dataType?.$dataType).label }}
						</span>
					</span>
				</UButton>
			</template>

			<template v-if="manual">
				<div
					v-if="adding"
					class="flex flex-col gap-2.5 bg-elevated p-3"
					:class="rows.length ? 'border-t border-default' : ''"
				>
					<UFormField label="New field">
						<UInput
							class="w-full"
							v-model="newLabel"
							placeholder="Email"
							autofocus
							@keydown.enter="addField"
						/>
					</UFormField>
					<div role="group" aria-label="Type" class="grid grid-cols-4 gap-1">
						<UButton
							v-for="item in typeTiles"
							:key="item.value"
							:icon="item.icon"
							:label="item.label"
							size="xs"
							:color="tileOn(item.value) ? 'primary' : 'neutral'"
							:variant="tileOn(item.value) ? 'soft' : 'outline'"
							block
							class="flex-col"
							:aria-pressed="tileOn(item.value)"
							@click="pickTile(item.value)"
						/>
					</div>
					<USelectMenu
						v-if="moreTypes"
						:model-value="newType"
						:items="served"
						value-key="value"
						placeholder="Choose a data type…"
						aria-label="Other type"
						@update:model-value="newType = String($event)"
					/>
					<div class="flex gap-1.5">
						<UButton
							size="xs"
							label="Add the field"
							:disabled="!newLabel.trim()"
							@click="addField"
						/>
						<UButton
							size="xs"
							color="neutral"
							variant="ghost"
							label="Cancel"
							@click="adding = false"
						/>
					</div>
				</div>
				<UButton
					v-else
					icon="i-ph-plus"
					label="Add field"
					variant="ghost"
					block
					class="h-10 justify-start rounded-none"
					:class="rows.length ? 'border-t border-default' : ''"
					@click="startAdding"
				/>
			</template>
		</div>

		<p v-if="bound" class="text-xs text-dimmed">
			The fields are the table's columns. Open one for its label, help text and
			default value.
		</p>
		<p
			v-else-if="form.destination.value.kind === 'address'"
			class="text-xs leading-relaxed text-dimmed"
		>
			No table says what it takes: the fields are yours to add, and the address
			must accept them.
		</p>
	</div>
</template>

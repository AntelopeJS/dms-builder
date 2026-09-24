<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dataTypeItem, dataTypeItems } from '../runtime/catalog'
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
const QUICK_TYPES = ['string', 'number', 'date']

const builder = useBuilder()
const session = builder.session
const form = useFormBlock(() => props.path)

/** The line opened, by its place in the list. */
const open = ref<string | null>(null)
const adding = ref(false)
const newLabel = ref('')
const newType = ref('string')
const moreTypes = ref(false)

watch(
	() => props.path,
	() => {
		open.value = null
		adding.value = false
	},
)

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
const quickTypes = computed(() =>
	QUICK_TYPES.map((id) => served.value.find((item) => item.value === id)).filter(
		(item) => item !== undefined,
	),
)

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

function move(row: FormRow, delta: number): void {
	form.setFields(withEntryMoved(form.config.value.fields, row.path, delta))
	if (open.value === key(row.path)) {
		const next = [...row.path]
		next[next.length - 1] = (next[next.length - 1] ?? 0) + delta
		open.value = key(next)
	}
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

function startAdding(): void {
	adding.value = true
	newLabel.value = ''
	newType.value = 'string'
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
				<span
					v-if="fieldCount"
					class="rounded-full bg-primary/15 px-1.5 text-[11px] font-medium text-primary"
				>
					{{ fieldCount }}
				</span>
			</p>
			<span v-if="rows.length > 1" class="text-xs text-dimmed">
				In the form's order
			</span>
		</div>

		<div
			v-if="needed.length"
			role="alert"
			class="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5"
		>
			<div class="flex gap-2">
				<UIcon name="i-ph-warning" class="mt-0.5 size-3.5 shrink-0 text-warning" />
				<p class="text-xs leading-relaxed text-toned">
					The table can't save a row without
					<span class="font-medium text-highlighted">{{ neededNames }}</span>:
					every submit will fail until
					{{ needed.length === 1 ? 'it is' : 'they are' }} in the form.
				</p>
			</div>
			<UButton
				icon="i-ph-plus"
				size="xs"
				color="warning"
				:label="
					needed.length === 1
						? `Add ${neededNames} to the form`
						: 'Add them to the form'
				"
				class="self-start"
				@click="ask(needed)"
			/>
		</div>

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
						class="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3"
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
					<button
						v-else
						type="button"
						class="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 text-left"
						:aria-expanded="open === key(row.path)"
						@click="toggle(row)"
					>
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
						<span class="flex min-w-0 flex-col">
							<span
								class="truncate text-sm"
								:class="
									open === key(row.path)
										? 'font-medium text-highlighted'
										: 'text-default'
								"
							>
								{{ titleOf(row) }}
							</span>
							<span
								class="truncate text-xs"
								:class="stray(row) ? 'text-warning' : 'text-dimmed'"
							>
								{{
									stray(row)
										? `Not a column of ${form.table.value?.ref}`
										: subtitleOf(row)
								}}
							</span>
						</span>
					</button>
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
					class="flex h-7 items-center bg-elevated px-3 text-[11px] font-medium text-dimmed"
					:class="rows.length ? 'border-t border-default' : ''"
				>
					Not in the form
				</p>
				<button
					v-for="column in unasked"
					:key="column.name"
					type="button"
					class="flex h-11 w-full items-center gap-2.5 border-t border-default pl-3 text-left transition-colors hover:bg-elevated"
					:aria-label="`Add ${columnLabel(column)} to the form`"
					title="Add to the form"
					@click="ask([column])"
				>
					<span
						class="flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed"
						:class="
							column.required
								? 'border-warning/55 text-warning'
								: 'border-accented text-dimmed'
						"
					>
						<UIcon
							:name="dataTypeItem(column.dataType?.$dataType ?? 'string').icon"
							class="size-4"
						/>
					</span>
					<span class="flex min-w-0 flex-1 flex-col">
						<span
							class="flex min-w-0 items-center gap-1.5 text-sm"
							:class="column.required ? 'text-default' : 'text-muted'"
						>
							<span class="truncate">{{ columnLabel(column) }}</span>
							<span
								v-if="column.required"
								class="inline-flex h-4 shrink-0 items-center rounded bg-warning/15 px-1 text-[10px] font-semibold text-warning"
							>
								Needed
							</span>
						</span>
						<span class="truncate text-xs text-dimmed">
							{{ dataTypeItem(column.dataType?.$dataType ?? 'string').label }}
						</span>
					</span>
					<span
						class="flex w-8 shrink-0 justify-center"
						:class="column.required ? 'text-warning' : 'text-muted'"
					>
						<UIcon name="i-ph-plus" class="size-4" />
					</span>
				</button>
			</template>

			<template v-if="manual">
				<div
					v-if="adding"
					class="flex flex-col gap-2.5 bg-elevated p-3"
					:class="rows.length ? 'border-t border-default' : ''"
				>
					<div class="flex flex-col gap-1.5">
						<label for="form-new-field" class="text-xs font-medium text-toned">
							New field
						</label>
						<UInput
							id="form-new-field"
							v-model="newLabel"
							placeholder="Email"
							autofocus
							@keydown.enter="addField"
						/>
					</div>
					<div role="group" aria-label="Type" class="grid grid-cols-4 gap-1">
						<button
							v-for="item in quickTypes"
							:key="item.value"
							type="button"
							class="flex h-11 flex-col items-center justify-center gap-0.5 rounded-md border text-[11px] transition-colors"
							:class="
								newType === item.value && !moreTypes
									? 'border-primary/45 bg-primary/10 text-primary'
									: 'border-accented bg-default text-muted hover:border-primary/40'
							"
							:aria-pressed="newType === item.value && !moreTypes"
							@click="newType = item.value; moreTypes = false"
						>
							<UIcon :name="item.icon" class="size-[15px]" />
							{{ item.label }}
						</button>
						<button
							type="button"
							class="flex h-11 flex-col items-center justify-center gap-0.5 rounded-md border text-[11px] transition-colors"
							:class="
								moreTypes
									? 'border-primary/45 bg-primary/10 text-primary'
									: 'border-accented bg-default text-muted hover:border-primary/40'
							"
							:aria-pressed="moreTypes"
							@click="moreTypes = true"
						>
							<UIcon name="i-ph-dots-three" class="size-[15px]" />
							More
						</button>
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
					class="h-10 justify-start rounded-none px-3"
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

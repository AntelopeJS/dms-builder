<script setup lang="ts">
import { computed } from 'vue'
import { useBuilder } from '../runtime/session'
import { ACTION_ROUTES, ruled, useTableBlock } from '../runtime/table-panel'
import {
	routeLabel,
	servedWith,
	serves,
	type TableRoute,
} from '../runtime/table-routes'

/**
 * What people can do with the rows a table block lists, where they find it:
 * above the table, or on each row. An action the table's API refuses says so
 * under it, with the switch that makes the API take it.
 */
const props = defineProps<{ path: string }>()

/** Archiving is the block's own switch, not one of its row actions. */
const ARCHIVE = 'archive'
const ARCHIVE_MODE = 'archiveMode'
const RESTORE = 'restore'

interface Action {
	key: string
	label: string
	aria: string
	icon: string
	/** What turning it off is called, under a refusal. */
	gerund: string
}

const ABOVE: Action[] = [
	{ key: 'add', label: 'Add rows', aria: 'Add rows', icon: 'i-ph-plus', gerund: 'adding' },
	{
		key: 'hasSelection',
		label: 'Select several rows',
		aria: 'Select several rows',
		icon: 'i-ph-check-square',
		gerund: 'selecting',
	},
]

const EACH: Action[] = [
	{ key: 'edit', label: 'Edit', aria: 'Edit rows', icon: 'i-ph-pencil-simple', gerund: 'editing' },
	{
		key: 'details',
		label: 'Open read-only',
		aria: 'Open rows read-only',
		icon: 'i-ph-eye',
		gerund: 'opening',
	},
	{
		key: 'duplicate',
		label: 'Duplicate',
		aria: 'Duplicate rows',
		icon: 'i-ph-copy',
		gerund: 'duplicating',
	},
	{ key: 'copyLink', label: 'Copy its link', aria: "Copy a row's link", icon: 'i-ph-link', gerund: 'copying' },
	{ key: ARCHIVE, label: 'Archive', aria: 'Archive rows', icon: 'i-ph-archive', gerund: 'archiving' },
	{
		key: RESTORE,
		label: 'Restore',
		aria: 'Restore archived rows',
		icon: 'i-ph-arrow-counter-clockwise',
		gerund: 'restoring',
	},
	{ key: 'delete', label: 'Delete', aria: 'Delete rows', icon: 'i-ph-trash', gerund: 'deleting' },
]

/** What an API that does not serve a route does to the action through it. */
const REFUSALS: Record<string, string> = {
	create: 'every new row will be refused',
	edit: 'every edit will be refused',
	delete: 'every delete will be refused',
	get: 'no row will open',
	archive: 'no row can be archived',
}

/** How an action's row reads, from one gone wrong to one turned off. */
const TONES = {
	warning: { row: 'bg-warning/5', icon: 'text-warning', label: 'text-default', note: 'text-warning' },
	locked: { row: '', icon: 'text-dimmed opacity-60', label: 'text-dimmed', note: 'text-dimmed' },
	on: { row: '', icon: 'text-primary', label: 'text-default', note: 'text-dimmed' },
	off: { row: '', icon: 'text-dimmed', label: 'text-muted', note: 'text-dimmed' },
}

/** An action as its row shows it. */
interface Row extends Action {
	/** Never on while it is locked. */
	on: boolean
	/** Why its switch cannot be turned on, when it cannot. */
	locked?: string
	note?: string
	tone: keyof typeof TONES
	/** The route the API refuses it through, on the first action refused there. */
	refusal?: { route: TableRoute; label: string }
}

const builder = useBuilder()
const session = builder.session
const table = useTableBlock(() => props.path)

const tableRef = computed(() => table.table.value ?? '')
const archiving = computed(() => table.config.value[ARCHIVE_MODE] === true)
const writing = computed(() => session.value.pending.includes(tableRef.value))

function offers(action: Action): boolean {
	if (action.key === ARCHIVE) return table.has(ARCHIVE_MODE)
	// Bringing an archived row back only means something while archiving is on.
	if (action.key === RESTORE && !archiving.value) return false
	return action.key in table.actions.value
}

function set(key: string, value: boolean): void {
	if (key === ARCHIVE) {
		table.patch({ [ARCHIVE_MODE]: value ? true : undefined })
	} else {
		table.setAction(key, value)
	}
}

function lockOf(key: string): string | undefined {
	// Editing opens a row already, so the block drops the read-only way in —
	// unless editing runs under a rule, which leaves some rows to read only.
	if (key === 'details' && table.isOn('edit') && !ruled(table.action('edit'))) {
		return 'Edit already opens the row'
	}
	if (key === ARCHIVE && !archiving.value && !table.archiveColumn.value) {
		return `${tableRef.value} has no column to mark archived rows`
	}
	return undefined
}

/** What an action does that its name does not say. */
function noteOf(key: string): string | undefined {
	const column = table.archiveColumn.value
	if (key === ARCHIVE && !archiving.value) return 'Set aside, restored later'
	if (key === ARCHIVE) {
		return column
			? `Marked in the column ${column.label || column.name}`
			: `${tableRef.value} has no column to mark archived rows: the page won't load`
	}
	if (key === 'delete') {
		return archiving.value ? 'Archived rows only, for good' : 'Erases it for good'
	}
	return undefined
}

/** Written straight to the table, as its API tab would. */
function serve(route: TableRoute): void {
	void builder.configureResource(tableRef.value, servedWith(table.structure.value, route))
}

const groups = computed(() => {
	// The first action refused through a route says why; the others point to it.
	const explained = new Set<string>()
	function row(action: Action): Row {
		const locked = lockOf(action.key)
		const on =
			!locked && (action.key === ARCHIVE ? archiving.value : table.isOn(action.key))
		const route = ACTION_ROUTES[action.key]
		const refused = on && !!route && !serves(table.structure.value, route)
		const broken = action.key === ARCHIVE && on && !table.archiveColumn.value
		const refusal =
			refused && !explained.has(route) ? { route, label: routeLabel(route) } : undefined
		if (refusal) explained.add(refusal.route)
		return {
			...action,
			on,
			locked,
			note: locked ?? (refused ? 'Refused by the table' : noteOf(action.key)),
			tone: refused || broken ? 'warning' : locked ? 'locked' : on ? 'on' : 'off',
			refusal,
		}
	}
	return [
		{ label: 'Above the table', rows: ABOVE.filter(offers).map(row) },
		{ label: 'On each row', rows: EACH.filter(offers).map(row) },
	].filter((group) => group.rows.length)
})
</script>

<template>
	<div v-if="groups.length" class="flex flex-col gap-2">
		<p class="text-xs font-semibold text-toned">What people can do</p>
		<div class="divide-y divide-default overflow-hidden rounded-lg border border-default">
			<template v-for="group in groups" :key="group.label">
				<p class="flex h-7 items-center bg-elevated px-3 text-xs font-medium text-muted">
					{{ group.label }}
				</p>
				<div v-for="row in group.rows" :key="row.key">
					<div
						class="flex min-h-10 items-center gap-2.5 py-1.5 pr-3"
						:class="[TONES[row.tone].row, row.key === RESTORE ? 'pl-10' : 'pl-3']"
					>
						<UIcon
							:name="row.icon"
							class="size-4 shrink-0"
							:class="TONES[row.tone].icon"
						/>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="text-sm" :class="TONES[row.tone].label">
								{{ row.label }}
							</span>
							<span v-if="row.note" class="text-xs" :class="TONES[row.tone].note">
								{{ row.note }}
							</span>
						</span>
						<USwitch
							:model-value="row.on"
							:disabled="!!row.locked"
							:aria-label="row.aria"
							@update:model-value="set(row.key, $event === true)"
						/>
					</div>

					<UAlert
						v-if="row.refusal"
						role="alert"
						color="warning"
						variant="soft"
						:description="`The API of ${tableRef} has ${row.refusal.label} turned off, so ${REFUSALS[row.refusal.route]}.`"
						class="rounded-none py-2.5 pr-3 pl-9.5"
					>
						<template #actions>
							<UButton
								size="xs"
								color="warning"
								:label="`Turn ${row.refusal.label} on`"
								:loading="writing"
								@click="serve(row.refusal!.route)"
							/>
							<UBadge
								color="primary"
								variant="soft"
								size="sm"
								icon="i-ph-lightning-fill"
								label="Now"
								title="Applies now"
							/>
							<UButton
								size="xs"
								color="neutral"
								variant="link"
								:label="`Turn ${row.gerund} off`"
								class="ml-auto"
								@click="set(row.key, false)"
							/>
						</template>
					</UAlert>
				</div>
			</template>
		</div>
	</div>
</template>

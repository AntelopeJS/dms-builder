<script setup lang="ts">
import { computed } from 'vue'
import { TABLE_ROUTES } from '../runtime/constants'
import { useBuilder } from '../runtime/session'
import {
	ACTION_ROUTES,
	ruled,
	serves,
	useTableBlock,
} from '../runtime/table-panel'

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

const builder = useBuilder()
const session = builder.session
const table = useTableBlock(() => props.path)

const tableRef = computed(() => table.table.value ?? '')
const archiving = computed(() => table.config.value[ARCHIVE_MODE] === true)
const writing = computed(() => session.value.pending.includes(tableRef.value))

function offers(action: Action): boolean {
	return action.key === ARCHIVE ? table.has(ARCHIVE_MODE) : action.key in table.actions.value
}

function on(action: Action): boolean {
	return action.key === ARCHIVE ? archiving.value : table.isOn(action.key)
}

function set(action: Action, value: boolean): void {
	if (action.key === ARCHIVE) {
		table.patch({ [ARCHIVE_MODE]: value ? true : undefined })
	} else {
		table.setAction(action.key, value)
	}
}

/**
 * Editing opens a row already, so the block drops the read-only way in —
 * unless editing runs under a rule, which leaves some rows to read only.
 */
const detailsCovered = computed(
	() => table.isOn('edit') && !ruled(table.action('edit')),
)

/** Why a switch cannot be turned on, when it cannot. */
function lockedBy(action: Action): string | undefined {
	if (action.key === 'details' && detailsCovered.value) {
		return 'Edit already opens the row'
	}
	if (action.key === ARCHIVE && !table.archiveColumn.value && !archiving.value) {
		return `${tableRef.value} has no column to mark archived rows`
	}
	return undefined
}

function routeOf(action: Action): string | undefined {
	return ACTION_ROUTES[action.key]
}

/** The actions that are on and go through a route the API does not serve. */
function refused(action: Action): boolean {
	const route = routeOf(action)
	return (
		!!route &&
		on(action) &&
		!lockedBy(action) &&
		!!table.structure.value &&
		!serves(table.structure.value, route)
	)
}

/** The first action refused for each route says why; the others point to it. */
const explained = computed(() => {
	const seen = new Set<string>()
	const first = new Set<string>()
	for (const action of [...ABOVE, ...EACH]) {
		const route = routeOf(action)
		if (route && offers(action) && refused(action) && !seen.has(route)) {
			seen.add(route)
			first.add(action.key)
		}
	}
	return first
})

function note(action: Action): string | undefined {
	const locked = lockedBy(action)
	if (locked) return locked
	if (refused(action)) return 'Refused by the table'
	if (action.key === ARCHIVE) {
		if (archiving.value && !table.archiveColumn.value) {
			return `${tableRef.value} has no column to mark archived rows: the page won't load`
		}
		const column = table.archiveColumn.value
		return archiving.value && column
			? `Marked in the column ${column.label || column.name}`
			: 'Set aside, restored later'
	}
	if (action.key === 'delete') {
		return archiving.value ? 'Archived rows only, for good' : 'Erases it for good'
	}
	return undefined
}

function warns(action: Action): boolean {
	return (
		refused(action) ||
		(action.key === ARCHIVE && archiving.value && !table.archiveColumn.value)
	)
}

function routeLabel(route: string): string {
	return TABLE_ROUTES.find((entry) => entry.key === route)?.label ?? route
}

/** Written straight to the table, as its API tab would. */
function serve(route: string): void {
	const served =
		table.structure.value?.routes ?? TABLE_ROUTES.map((entry) => entry.key)
	void builder.configureResource(tableRef.value, [...new Set([...served, route])])
}

const groups = computed(() =>
	[
		{ label: 'Above the table', actions: ABOVE.filter(offers) },
		{ label: 'On each row', actions: EACH.filter(offers) },
	].filter((group) => group.actions.length),
)

/** Bringing an archived row back, under archiving and only while it is on. */
const restoring = computed(
	() => archiving.value && RESTORE in table.actions.value,
)
</script>

<template>
	<div v-if="groups.length" class="flex flex-col gap-2">
		<p class="text-xs font-semibold text-toned">What people can do</p>
		<div class="overflow-hidden rounded-lg border border-default">
			<template v-for="(group, index) in groups" :key="group.label">
				<div
					class="flex h-7 items-center bg-elevated px-3 text-[11px] font-medium text-muted"
					:class="index ? 'border-t border-default' : ''"
				>
					{{ group.label }}
				</div>
				<template v-for="action in group.actions" :key="action.key">
					<div
						class="flex min-h-10 items-center gap-2.5 border-t border-default px-3 py-1.5"
						:class="warns(action) ? 'bg-warning/5' : ''"
					>
						<UIcon
							:name="action.icon"
							class="size-4 shrink-0"
							:class="
								warns(action)
									? 'text-warning'
									: lockedBy(action)
										? 'text-dimmed opacity-60'
										: on(action)
											? 'text-primary'
											: 'text-dimmed'
							"
						/>
						<span class="flex min-w-0 flex-1 flex-col">
							<span
								class="text-[13px]"
								:class="
									lockedBy(action)
										? 'text-dimmed'
										: on(action)
											? 'text-default'
											: 'text-muted'
								"
							>
								{{ action.label }}
							</span>
							<span
								v-if="note(action)"
								class="text-xs"
								:class="warns(action) ? 'text-warning' : 'text-dimmed'"
							>
								{{ note(action) }}
							</span>
						</span>
						<USwitch
							:model-value="!lockedBy(action) && on(action)"
							:disabled="!!lockedBy(action)"
							:aria-label="action.aria"
							@update:model-value="set(action, $event === true)"
						/>
					</div>

					<div
						v-if="explained.has(action.key)"
						role="alert"
						class="flex flex-col gap-2.5 bg-warning/5 py-2.5 pl-9.5 pr-3"
					>
						<p class="text-xs leading-relaxed text-toned">
							The API of
							<span class="font-medium text-highlighted">{{ tableRef }}</span>
							has
							<span class="font-medium text-highlighted">{{
								routeLabel(routeOf(action)!)
							}}</span>
							turned off, so {{ REFUSALS[routeOf(action)!] }}.
						</p>
						<div class="flex items-center gap-2">
							<UButton
								size="xs"
								color="warning"
								:label="`Turn ${routeLabel(routeOf(action)!)} on`"
								:loading="writing"
								:disabled="writing"
								@click="serve(routeOf(action)!)"
							/>
							<span
								class="inline-flex h-4 items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary"
								title="Applies now"
							>
								<UIcon name="i-ph-lightning-fill" class="size-2.5" />
								Now
							</span>
							<UButton
								size="xs"
								color="neutral"
								variant="link"
								:label="`Turn ${action.gerund} off`"
								class="ml-auto"
								@click="set(action, false)"
							/>
						</div>
					</div>

					<div
						v-if="action.key === ARCHIVE && restoring"
						class="flex h-10 items-center gap-2.5 border-t border-default py-1.5 pl-10 pr-3"
					>
						<UIcon
							name="i-ph-arrow-counter-clockwise"
							class="size-4 shrink-0"
							:class="table.isOn(RESTORE) ? 'text-primary' : 'text-dimmed'"
						/>
						<span
							class="min-w-0 flex-1 text-[13px]"
							:class="table.isOn(RESTORE) ? 'text-default' : 'text-muted'"
						>
							Restore
						</span>
						<USwitch
							:model-value="table.isOn(RESTORE)"
							aria-label="Restore archived rows"
							@update:model-value="table.setAction(RESTORE, $event === true)"
						/>
					</div>
				</template>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBlockPanel } from '../runtime/block-panel'
import { CARD_FIELD_UI } from '../runtime/form-panel'
import { useBuilder } from '../runtime/session'
import {
	branchingOf,
	defaultLabel,
	isDateField,
	labelFields,
	linksTo,
	nextRanking,
	pickableFields,
	rankingLevels,
	rowsLevel,
	selfRelation,
	TREE_PERIODS,
	treeEndpoint,
	treeProblem,
	treeSource,
	withBranching,
	withRanking,
	type TreeBranching,
	type TreeLevelSpec,
	type TreePeriod,
	type TreeSourceSpec,
} from '../runtime/tree-source'
import type { ResourceStructure } from '../runtime/types'

/**
 * A tree whose items are read from tables, as someone who never wrote a query
 * builds one: the table it reads, then how it branches — by the values of its
 * columns, under the row a column names, or through the tables linked to it —
 * and whether a branch is read only as it opens.
 */
const props = defineProps<{ path: string }>()

const { block, patch } = useBlockPanel(() => props.path)
const builder = useBuilder()
const session = builder.session

const name = computed(() => block.value?.name ?? '')

/** The tree as edited here, held until it is one the DMS can read. */
const edited = ref<TreeSourceSpec | null>(null)
const spec = computed<TreeSourceSpec>(
	() =>
		edited.value ??
		treeSource(session.value.draft, session.value.structure, name.value) ?? { levels: [] },
)
const problem = computed(() => (spec.value.levels.length ? treeProblem(spec.value) : undefined))

const tableOf = (ref: string | undefined): ResourceStructure | undefined =>
	ref ? session.value.resourceStructures[ref] : undefined
const top = computed(() => tableOf(spec.value.levels[0]?.resource))

watch(
	() => spec.value.levels.map((level) => level.resource),
	(refs) => {
		for (const ref of new Set(refs)) {
			void builder.loadResource(ref)
		}
	},
	{ immediate: true },
)

/** Written to the draft once it reads, with the block pointed at its route. */
function update(next: TreeSourceSpec): void {
	edited.value = next
	if (treeProblem(next)) {
		return
	}
	builder.setDraftTree({ name: name.value, ...next })
	patch({
		fetchUrl: treeEndpoint(session.value.pageRef ?? '', name.value),
		fetchUrlMethod: undefined,
		lazyLoad: next.lazy ? true : undefined,
		staticNodes: undefined,
	})
}

/* ---- the table, and how it branches ------------------------------------- */

const BRANCHINGS: Array<{ value: TreeBranching; label: string }> = [
	{ value: 'columns', label: 'By columns' },
	{ value: 'parent', label: 'By its parent' },
	{ value: 'linked', label: 'Linked tables' },
]

/** How it branches, picked before the tree says so itself. */
const pickedBranching = ref<TreeBranching | null>(null)
const branching = computed<TreeBranching>(
	() => pickedBranching.value ?? branchingOf(spec.value),
)

async function pickTable(ref: string): Promise<void> {
	await builder.loadResource(ref)
	const table = tableOf(ref)
	if (!table) {
		return
	}
	const way = pickedBranching.value ?? (selfRelation(table) ? 'parent' : 'columns')
	pickedBranching.value = way
	update(withBranching(spec.value, way, table))
}

function setBranching(next: TreeBranching): void {
	pickedBranching.value = next
	if (top.value) {
		update(withBranching(spec.value, next, top.value))
	}
}

/** The columns of a table, as a menu offers them. */
function columnItems(table: ResourceStructure | undefined, fields = pickableFields(table)) {
	return fields.map((field) => ({
		label: field.label || field.name,
		value: field.name,
	}))
}

/** The columns a row of a table can be named by. */
function labelItems(table: ResourceStructure | undefined) {
	return columnItems(table, labelFields(table))
}

function columnLabel(table: ResourceStructure | undefined, column: string | undefined): string {
	const field = table?.fields.find((entry) => entry.name === column)
	return field?.label || column || ''
}

/* ---- by columns --------------------------------------------------------- */

const PERIOD_WORDS: Record<TreePeriod, string> = {
	day: 'by day',
	month: 'by month',
	quarter: 'by quarter',
	year: 'by year',
}
const periodItems = TREE_PERIODS.map((period) => ({ label: PERIOD_WORDS[period], value: period }))

const ranking = computed(() => rankingLevels(spec.value))
const rows = computed(() => rowsLevel(spec.value))

function isDate(column: string | undefined): boolean {
	return isDateField(top.value?.fields.find((field) => field.name === column))
}

function rank(by: string, every?: TreePeriod): Pick<TreeLevelSpec, 'by' | 'every'> {
	return isDate(by) ? { by, every: every ?? 'month' } : { by }
}

function setRanking(next: Array<Pick<TreeLevelSpec, 'by' | 'every'>>): void {
	const ranked = next.map((level) => level.by ?? '')
	// A row named by what its branch already says is named by nothing new.
	const label = rows.value?.label?.every((column) => ranked.includes(column))
		? defaultLabel(top.value, ranked)
		: rows.value?.label
	update(withRanking(spec.value, next, rows.value ? { label } : undefined))
}

function setRank(at: number, by: string): void {
	setRanking(ranking.value.map((level, index) => (index === at ? rank(by) : level)))
}

function setPeriod(at: number, every: TreePeriod): void {
	setRanking(
		ranking.value.map((level, index) => (index === at ? { by: level.by, every } : level)),
	)
}

function addRank(): void {
	const next = nextRanking(
		top.value,
		ranking.value.map((level) => level.by ?? ''),
	)
	if (next) {
		setRanking([...ranking.value, rank(next)])
	}
}

function removeRank(at: number): void {
	const next = ranking.value.filter((_, index) => index !== at)
	update(
		withRanking(
			spec.value,
			next,
			// With nothing left to rank by, a count would count nothing: the rows show.
			rows.value || !next.length ? { label: rows.value?.label ?? defaultLabel(top.value) } : undefined,
		),
	)
}

const ENDS = [
	{ value: 'rows', label: 'Its rows' },
	{ value: 'count', label: 'Just a count' },
] as const

function setEnd(end: 'rows' | 'count'): void {
	update(
		withRanking(
			spec.value,
			ranking.value,
			end === 'rows' ? { label: rows.value?.label ?? defaultLabel(top.value) } : undefined,
		),
	)
}

/* ---- any level ---------------------------------------------------------- */

function patchLevel(at: number, changes: Partial<TreeLevelSpec>): void {
	update({
		...spec.value,
		levels: spec.value.levels.map((level, index) =>
			index === at ? { ...level, ...changes } : level,
		),
	})
}

function setLabel(at: number, columns: unknown): void {
	const label = Array.isArray(columns) ? columns.map(String) : []
	patchLevel(at, { label })
}

/* ---- by its parent ------------------------------------------------------ */

const found = computed(() => selfRelation(top.value))

/* ---- linked tables ------------------------------------------------------ */

watch(
	branching,
	(way) => {
		if (way === 'linked') {
			for (const table of session.value.resources) {
				void builder.loadResource(table.ref)
			}
		}
	},
	{ immediate: true },
)

const loadedTables = computed(() =>
	Object.values(session.value.resourceStructures),
)

/** The tables linked to the last level, each a level that can go under it. */
const nextLevels = computed(() => {
	const last = spec.value.levels.at(-1)
	if (!last) {
		return []
	}
	return linksTo(loadedTables.value, last.resource).map((link) => ({
		label: `${link.resource}, by ${columnLabel(tableOf(link.resource), link.field)}`,
		icon: 'i-ph-table',
		onSelect: () =>
			update({
				...spec.value,
				levels: [
					...spec.value.levels,
					{
						resource: link.resource,
						link: link.field,
						label: defaultLabel(tableOf(link.resource), [link.field]),
					},
				],
			}),
	}))
})

function removeLastLevel(): void {
	update({ ...spec.value, levels: spec.value.levels.slice(0, -1) })
}

/* ---- read as it opens --------------------------------------------------- */

function setLazy(on: boolean): void {
	const { lazy: _, ...rest } = spec.value
	update(on ? { ...rest, lazy: true } : rest)
}
</script>

<template>
	<div class="flex flex-col gap-3">
		<DmsBuilderTableChoice
			:model-value="spec.levels[0]?.resource"
			:note="branching === 'linked' ? 'The table at the top' : 'Its rows make the tree'"
			label="Table the tree reads"
			empty-title="Pick the table it reads"
			empty-hint="Its rows become the items of the tree. Choose next how they branch."
			@update:model-value="pickTable"
		/>

		<template v-if="top">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm text-muted">How it branches</span>
				<div
					role="group"
					aria-label="How it branches"
					class="grid grid-cols-3 gap-1 rounded-lg border border-accented bg-default p-0.75"
				>
					<button
						v-for="choice in BRANCHINGS"
						:key="choice.value"
						type="button"
						:aria-pressed="branching === choice.value"
						class="h-8 whitespace-nowrap rounded-[5px] px-1 text-[12px] transition-colors"
						:class="
							branching === choice.value
								? 'bg-primary font-semibold text-inverted'
								: 'font-medium text-toned hover:bg-elevated'
						"
						@click="setBranching(choice.value)"
					>
						{{ choice.label }}
					</button>
				</div>
			</div>

			<!-- By columns: the rows grouped by one column, then the next. -->
			<template v-if="branching === 'columns'">
				<div class="flex flex-col gap-1.5">
					<span class="text-sm text-muted">Ranked by</span>
					<div
						v-if="ranking.length"
						class="flex flex-col divide-y divide-default rounded-lg border border-default bg-default"
					>
						<div
							v-for="(level, at) in ranking"
							:key="at"
							class="flex flex-col gap-1.5 px-2.5 py-1.5"
						>
							<div class="flex items-center gap-2">
								<span
									class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
								>
									{{ at + 1 }}
								</span>
								<USelectMenu
									:model-value="level.by"
									:items="columnItems(top)"
									value-key="value"
									size="sm"
									class="min-w-0 flex-1"
									:aria-label="`Column level ${at + 1} ranks by`"
									@update:model-value="setRank(at, String($event))"
								/>
								<UButton
									icon="i-ph-x"
									size="xs"
									color="neutral"
									variant="ghost"
									:aria-label="`Remove level ${at + 1}`"
									@click="removeRank(at)"
								/>
							</div>
							<!-- A date makes one item per instant: it is read by a period. -->
							<div v-if="isDate(level.by)" class="flex items-center gap-2 pl-7 pr-8">
								<USelectMenu
									:model-value="level.every ?? 'month'"
									:items="periodItems"
									value-key="value"
									size="sm"
									class="min-w-0 flex-1"
									:aria-label="`Period of level ${at + 1}`"
									@update:model-value="setPeriod(at, $event as TreePeriod)"
								/>
							</div>
						</div>
					</div>
					<p v-else class="text-[13px]/[18px] text-muted">
						Nothing yet: its rows are listed as they are.
					</p>
					<UButton
						icon="i-ph-plus"
						size="sm"
						color="neutral"
						variant="outline"
						label="Add a level"
						class="self-start"
						:disabled="ranking.length >= pickableFields(top).length"
						@click="addRank"
					/>
				</div>

				<div v-if="ranking.length" class="flex flex-col gap-1.5">
					<span class="text-sm text-muted">At the end of each branch</span>
					<div
						role="group"
						aria-label="At the end of each branch"
						class="grid grid-cols-2 gap-1 rounded-lg border border-accented bg-default p-0.75"
					>
						<button
							v-for="end in ENDS"
							:key="end.value"
							type="button"
							:aria-pressed="(rows ? 'rows' : 'count') === end.value"
							class="h-8 rounded-[5px] px-2 text-[13px] transition-colors"
							:class="
								(rows ? 'rows' : 'count') === end.value
									? 'bg-primary font-semibold text-inverted'
									: 'font-medium text-toned hover:bg-elevated'
							"
							@click="setEnd(end.value)"
						>
							{{ end.label }}
						</button>
					</div>
				</div>

				<UFormField v-if="rows" label="Named by" :ui="CARD_FIELD_UI">
					<USelectMenu
						:model-value="rows.label ?? []"
						:items="labelItems(top)"
						value-key="value"
						multiple
						class="w-full"
						aria-label="Columns a row is named by"
						@update:model-value="setLabel(spec.levels.indexOf(rows), $event)"
					/>
				</UFormField>
			</template>

			<!-- By its parent: each row under the row a column of its own names. -->
			<template v-else-if="branching === 'parent'">
				<div
					v-if="found"
					class="flex gap-2 rounded-md bg-primary/10 px-2.5 py-2 text-xs leading-4 text-primary"
				>
					<UIcon name="i-ph-link-simple" class="mt-px size-3.5 shrink-0" />
					<span>
						Found in {{ top.ref }}: <b class="font-semibold">{{ columnLabel(top, found) }}</b>
						points to another {{ top.ref }}.
					</span>
				</div>
				<UFormField
					label="Under"
					description="The column holding the row each one sits under."
					:ui="CARD_FIELD_UI"
				>
					<USelectMenu
						:model-value="spec.levels[0]?.parent || undefined"
						:items="columnItems(top)"
						value-key="value"
						placeholder="Pick a column"
						class="w-full"
						aria-label="Column naming the row each sits under"
						@update:model-value="patchLevel(0, { parent: String($event) })"
					/>
				</UFormField>
				<UFormField label="Named by" :ui="CARD_FIELD_UI">
					<USelectMenu
						:model-value="spec.levels[0]?.label ?? []"
						:items="labelItems(top)"
						value-key="value"
						multiple
						class="w-full"
						aria-label="Columns a row is named by"
						@update:model-value="setLabel(0, $event)"
					/>
				</UFormField>
			</template>

			<!-- Linked tables: under each row, the rows of a table pointing at it. -->
			<template v-else>
				<div class="flex flex-col gap-1.5">
					<span class="text-sm text-muted">Its levels</span>
					<div
						class="flex flex-col divide-y divide-default rounded-lg border border-default bg-default"
					>
						<div
							v-for="(level, at) in spec.levels"
							:key="at"
							class="flex flex-col gap-1.5 p-2.5"
						>
							<div class="flex items-center gap-2">
								<span
									class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
								>
									{{ at + 1 }}
								</span>
								<span class="min-w-0 flex-1 text-[13px]/[18px] text-default">
									<template v-if="at === 0">
										<b class="font-semibold text-highlighted">{{ level.resource }}</b>, at the top
									</template>
									<template v-else>
										Under each: their
										<b class="font-semibold text-highlighted">{{ level.resource }}</b>, by
										{{ columnLabel(tableOf(level.resource), level.link) }}
									</template>
								</span>
								<UButton
									v-if="at > 0 && at === spec.levels.length - 1"
									icon="i-ph-x"
									size="xs"
									color="neutral"
									variant="ghost"
									:aria-label="`Remove level ${at + 1}`"
									@click="removeLastLevel"
								/>
							</div>
							<div class="flex items-center gap-2 pl-7">
								<span class="shrink-0 text-xs text-dimmed">named by</span>
								<USelectMenu
									:model-value="level.label ?? []"
									:items="labelItems(tableOf(level.resource))"
									value-key="value"
									multiple
									size="sm"
									class="min-w-0 flex-1"
									:aria-label="`Columns level ${at + 1} is named by`"
									@update:model-value="setLabel(at, $event)"
								/>
							</div>
						</div>
					</div>
					<UDropdownMenu v-if="nextLevels.length" :items="nextLevels">
						<UButton
							icon="i-ph-plus"
							size="sm"
							color="neutral"
							variant="outline"
							label="Add a level"
							class="self-start"
						/>
					</UDropdownMenu>
					<p class="text-xs leading-relaxed text-dimmed">
						<template v-if="nextLevels.length">
							A level is a table linked to the one above it.
						</template>
						<template v-else>
							No table points at {{ spec.levels.at(-1)?.resource }} yet: give one a column holding
							a row of it to list them under.
						</template>
					</p>
				</div>
			</template>

			<div class="flex items-start justify-between gap-3">
				<div class="flex flex-col gap-0.5">
					<span class="text-sm text-default">Load a branch when it opens</span>
					<span class="text-xs text-muted">Only what is opened is read: for large tables.</span>
				</div>
				<USwitch
					:model-value="spec.lazy === true"
					aria-label="Load a branch when it opens"
					@update:model-value="setLazy($event === true)"
				/>
			</div>

			<p v-if="problem" role="alert" class="text-xs leading-relaxed text-warning">
				{{ problem }}
			</p>
		</template>
	</div>
</template>

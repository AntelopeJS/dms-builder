<script setup lang="ts">
import {
	type Props,
	type Emits,
	MEASURES,
	BUCKETS,
	FILTER_OPS,
	PREVIEW_X_AXIS,
	MAX_LIMIT,
} from '../build/DataSource'
import { useDataSourcePart1 } from '../build/DataSourcePart1'
import { useDataSourcePart2 } from '../build/DataSourcePart2'

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const dataSourcePart1 = useDataSourcePart1({ props, emit })
const { advanced, resource, measure, measureField, groupBy, bucket, filters, orderBy, direction, limit, periodField, compare, previewing, building, wantsSeries, comparable, coded, numericFields, dateFields, groupableFields, filterableFields, groupsByDate, boundField, sortItems, setSort, setLimit, needsMeasureField, waitingOn, ready, refinements, refined, refine, shownRefinements, summary, endpoint, addFilter } = dataSourcePart1
const dataSourcePart2 = useDataSourcePart2({ ...dataSourcePart1 })
const { removeFilter, pickResource, previewValue, previewDelta, previewPoints, previewSeries } = dataSourcePart2
</script>

<template>
	<div class="flex flex-col gap-3">
		<div
			v-if="coded"
			class="flex flex-col gap-2.5 rounded-lg border border-accented bg-elevated p-2.5"
		>
			<div class="flex items-center gap-2.5">
				<span
					class="flex size-8 shrink-0 items-center justify-center rounded-md bg-accented text-muted"
				>
					<UIcon name="i-ph-code-light" class="size-4" />
				</span>
				<span class="flex min-w-0 flex-1 flex-col">
					<code class="truncate font-mono text-xs text-highlighted">
						GET {{ modelValue }}
					</code>
					<span class="text-xs text-muted">Answered by the page's code</span>
				</span>
			</div>
			<UButton
				icon="i-ph-table-light"
				size="xs"
				color="neutral"
				variant="outline"
				label="Build it here instead"
				class="self-start"
				@click="building = true"
			/>
			<p class="text-xs leading-relaxed text-dimmed">
				Its figures come as the code computes them. Built here instead, it
				reads a table you pick, and the route in the code is left as it is.
			</p>
		</div>

		<template v-else>
			<div
				v-if="resource && !withoutPreview"
				class="flex flex-col gap-2.5 rounded-lg border border-default bg-elevated/60 p-3"
			>
				<div class="flex items-start justify-between gap-2">
					<p class="text-sm text-default">{{ summary }}</p>
					<span class="shrink-0 text-xs text-dimmed">
						{{ previewing ? 'Reading…' : 'Preview' }}
					</span>
				</div>
				<div
					v-if="previewValue !== undefined"
					class="flex items-baseline gap-2"
				>
					<span class="text-2xl font-semibold tabular-nums text-highlighted">
						{{ previewValue.toLocaleString() }}
					</span>
					<DmsTrendBadge v-if="previewDelta !== undefined" :delta="previewDelta" />
				</div>

				<DmsChart
					v-if="previewPoints.length"
					type="column"
					:static-dataset="previewSeries"
					height="180px"
					:show-legend="false"
					:x-axis="PREVIEW_X_AXIS"
				/>
				<p
					v-else-if="previewValue === undefined && !previewing"
					class="text-xs text-dimmed"
				>
					{{ ready ? 'No rows match.' : waitingOn }}
				</p>
			</div>

			<DmsBuilderTableChoice
				:model-value="resource"
				note="The table it measures"
				label="Table it measures"
				empty-title="Pick the table it measures"
				empty-hint="Its rows are counted or added up. Choose next what is measured, and how it is split."
				@update:model-value="pickResource"
			/>

			<div
				v-if="resource"
				class="divide-y divide-default overflow-hidden rounded-lg border border-default"
			>
				<div class="flex items-center gap-2 px-2.5 py-1.5">
					<span class="w-18 shrink-0 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-dimmed uppercase">Measure</span>
					<USelectMenu
						v-model="measure"
						:items="MEASURES"
						value-key="value"
						aria-label="Measure"
						class="min-w-0 flex-1"
					/>
					<USelectMenu
						v-if="needsMeasureField"
						:model-value="measureField"
						:items="numericFields"
						value-key="value"
						placeholder="of…"
						aria-label="Measured column"
						class="min-w-0 flex-1"
						@update:model-value="measureField = $event"
					/>
				</div>
				<div v-if="wantsSeries" class="flex items-center gap-2 px-2.5 py-1.5">
					<span class="w-18 shrink-0 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-dimmed uppercase">Split by</span>
					<USelectMenu
						:model-value="groupBy"
						:items="groupableFields"
						value-key="value"
						placeholder="Grouped by…"
						aria-label="Split by"
						class="min-w-0 flex-1"
						@update:model-value="groupBy = $event"
					/>
					<USelectMenu
						v-if="groupsByDate"
						v-model="bucket"
						:items="BUCKETS"
						value-key="value"
						aria-label="Period of each group"
						class="w-28 shrink-0"
					/>
				</div>
			</div>

			<div v-if="resource && refinements.length" class="flex flex-col gap-1.5">
				<p class="text-xs text-muted">Refine it</p>
				<div role="group" aria-label="Refine it" class="flex flex-wrap gap-x-4 gap-y-1.5">
					<UCheckbox
						v-for="entry in refinements"
						:key="entry.kind"
						:model-value="refined(entry.kind)"
						:label="entry.label"
						size="sm"
						@update:model-value="refine(entry.kind, $event === true)"
					/>
				</div>
			</div>

			<div
				v-if="resource && shownRefinements.length"
				class="divide-y divide-default overflow-hidden rounded-lg border border-default"
			>
				<template v-for="entry in shownRefinements" :key="entry.kind">
					<div
						v-if="entry.kind === 'sort'"
						class="flex items-center gap-2 px-2.5 py-1.5"
					>
						<span class="w-18 shrink-0 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-dimmed uppercase">Sorted</span>
						<USelectMenu
							:model-value="`${orderBy}:${direction}`"
							:items="sortItems"
							value-key="value"
							aria-label="Sorted"
							class="min-w-0 flex-1"
							@update:model-value="setSort($event)"
						/>
					</div>

					<div
						v-else-if="entry.kind === 'top'"
						class="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted"
					>
						<span class="w-18 shrink-0 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-dimmed uppercase">Keep</span>
						<span>the first</span>
						<UInput
							type="number"
							size="sm"
							class="w-20"
							:min="1"
							:max="MAX_LIMIT"
							placeholder="all"
							aria-label="How many groups to keep"
							:model-value="limit"
							@update:model-value="setLimit($event)"
						/>
						<span>{{ groupsByDate ? 'periods' : 'groups' }}</span>
					</div>

					<div
						v-else-if="entry.kind === 'conditions'"
						class="flex flex-col gap-1.5 px-2.5 py-1.5"
					>
						<div
							v-for="(filter, at) in filters"
							:key="at"
							class="flex items-center gap-1.5"
						>
							<span class="w-18 shrink-0 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-dimmed uppercase">
								{{ at ? 'and' : 'Where' }}
							</span>
							<USelectMenu
								v-model="filter.field"
								:items="filterableFields"
								value-key="value"
								aria-label="Condition column"
								class="min-w-0 flex-1"
							/>
							<USelectMenu
								v-model="filter.op"
								:items="FILTER_OPS"
								value-key="value"
								aria-label="Condition test"
								class="w-24 shrink-0"
							/>
							<UInput
								v-model="filter.value"
								size="sm"
								aria-label="Condition value"
								class="min-w-0 flex-1"
							/>
							<UButton
								icon="i-ph-x-light"
								size="xs"
								color="neutral"
								variant="ghost"
								aria-label="Remove this condition"
								@click="removeFilter(at)"
							/>
						</div>
						<UButton
							icon="i-ph-plus-light"
							size="xs"
							variant="link"
							label="Add a condition"
							class="self-start px-0"
							@click="addFilter"
						/>
					</div>

					<div
						v-else-if="entry.kind === 'period'"
						class="flex items-baseline gap-2 px-2.5 py-2"
					>
						<span class="w-18 shrink-0 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-dimmed uppercase">Period</span>
						<div class="flex min-w-0 flex-1 flex-col gap-2">
							<div class="flex items-center gap-2">
								<span class="text-sm text-default">The page's period</span>
								<template v-if="!groupsByDate">
									<span class="text-xs text-muted">on</span>
									<USelectMenu
										:model-value="boundField"
										:items="dateFields"
										value-key="value"
										aria-label="Column the period bounds"
										class="min-w-0 flex-1"
										@update:model-value="periodField = $event"
									/>
								</template>
							</div>
							<p class="text-xs leading-relaxed text-dimmed">
								Its figures change with the period chosen on the page.
							</p>
							<USwitch
								v-if="comparable"
								v-model="compare"
								label="Compare with the previous period"
								description="Drawn dashed beside it, and gives the variation."
							/>
						</div>
					</div>
				</template>
			</div>

			<p v-if="advanced" class="truncate font-mono text-xs text-dimmed">
				{{ endpoint }}
			</p>
		</template>
	</div>
</template>

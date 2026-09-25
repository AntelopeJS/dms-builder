<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { descriptorOf, heldBlockOptions } from '../runtime/catalog'
import {
	chartTypeLabel,
	COLOUR_OPTION,
	FORMAT_LABELS,
	heldBlock,
	LINE_CHART_TYPES,
	LOOK_SWITCHES,
	MAIN_CHART_TYPES,
	THEME_COLOURS,
} from '../runtime/chart-card'
import { describeSource, sourceQuery } from '../runtime/data-source'
import { findNode } from '../runtime/draft'
import { mergePatch } from '../runtime/object'
import { useBuilder } from '../runtime/session'
import type { OptionSchema } from '../runtime/types'

/**
 * A chart card, as someone building a page sets one up: what it is called, the
 * chart it draws with, then three parts that fold away behind a line each —
 * what it measures, its headline figure, and how it looks. Routes and scopes
 * are the advanced view's.
 */
const props = defineProps<{ path: string }>()

type Part = 'data' | 'headline' | 'look'

const builder = useBuilder()
const session = builder.session

const block = computed(() =>
	session.value.draft ? findNode(session.value.draft, props.path) : undefined,
)
const config = computed<Record<string, unknown>>(() => block.value?.config ?? {})
const options = computed<Record<string, OptionSchema>>(
	() => descriptorOf(session.value.catalog, block.value?.type)?.config ?? {},
)

function has(key: string): boolean {
	return key in options.value
}

function text(key: string): string {
	const value = config.value[key]
	return typeof value === 'string' ? value : ''
}

function patch(values: Record<string, unknown>): void {
	builder.patchConfig(props.path, values)
}

function write(key: string, value: unknown): void {
	patch({ [key]: value === '' ? undefined : value })
}

/** What folds open: what it measures, first, since a card shows nothing without it. */
const open = ref(new Set<Part>(['data']))

function toggle(part: Part): void {
	const next = new Set(open.value)
	if (next.has(part)) {
		next.delete(part)
	} else {
		next.add(part)
	}
	open.value = next
}

/* ---- the chart it draws with ------------------------------------------- */

const chart = computed(() => heldBlock(config.value.chart))
const chartTypes = computed(() => options.value.chart?.ui?.blockTypes ?? [])
const mainTypes = computed(() =>
	MAIN_CHART_TYPES.filter((type) => chartTypes.value.includes(type)),
)
const otherTypes = computed(() =>
	chartTypes.value.filter((type) => !MAIN_CHART_TYPES.includes(type)),
)
/** The other types, shown while asked for or while one of them is drawn. */
const showingOthers = ref(false)
const othersShown = computed(
	() =>
		showingOthers.value ||
		(!!chart.value.type && otherTypes.value.includes(chart.value.type)),
)

function typeOf(type: string): { label: string; icon: string } {
	const descriptor = descriptorOf(session.value.catalog, type)
	return {
		label: chartTypeLabel(descriptor?.label, type),
		icon: descriptor?.icon ?? 'i-ph-chart-bar',
	}
}

/** Drawn another way, the chart keeps what it was set to. */
function setChartType(type: string): void {
	patch({ chart: { $block: { type, config: chart.value.config } } })
}

const chartOptions = computed<Record<string, OptionSchema>>(
	() => descriptorOf(session.value.catalog, chart.value.type)?.config ?? {},
)

function chartValue(key: string): unknown {
	return chart.value.config[key]
}

function setChartOption(key: string, value: unknown): void {
	patch({
		chart: {
			$block: {
				type: chart.value.type,
				config: mergePatch(chart.value.config, { [key]: value }),
			},
		},
	})
}

/* ---- what it measures -------------------------------------------------- */

const source = computed(() =>
	block.value
		? sourceQuery(session.value.draft, session.value.structure, block.value.name)
		: undefined,
)

watch(
	() => source.value?.resource,
	(ref) => {
		if (ref) void builder.loadResource(ref)
	},
	{ immediate: true },
)

/** A route the card reads that the builder did not write: the page's code's. */
const coded = computed(() => !!text('fetchUrl') && !source.value)

const dataSummary = computed(() => {
	if (coded.value) {
		return "From the page's code"
	}
	const fields = source.value?.resource
		? (session.value.resourceStructures[source.value.resource]?.fields ?? [])
		: []
	return describeSource(source.value, fields) ?? 'Nothing measured yet'
})

const fetchUi = computed(() => options.value.fetchUrl?.ui ?? {})
const draw = computed(() =>
	chart.value.type && LINE_CHART_TYPES.has(chart.value.type) ? 'line' : 'columns',
)

/* ---- its headline figure ----------------------------------------------- */

const formats = computed(() =>
	(options.value.valueFormat?.enum ?? []).map((value) => String(value)),
)
const format = computed(() => text('valueFormat') || formats.value[0] || 'number')
const currency = computed(() => format.value === 'currency')

/** The source answers the period before, which is what a variation is taken from. */
const compares = computed(() => source.value?.compare === true)
/**
 * A source built here that does not compare has no variation to show; one in
 * the page's code may send one, and only the code says whether.
 */
const variationLocked = computed(() => !!source.value && !compares.value)
const showsVariation = computed(
	() => config.value.showDelta === true && !variationLocked.value,
)

const headlineSummary = computed(() => {
	const shown = FORMAT_LABELS[format.value] ?? format.value
	const unit = currency.value && text('currencyCode') ? ` in ${text('currencyCode')}` : ''
	return `${shown}${unit} · ${showsVariation.value ? 'variation shown' : 'no variation'}`
})

/* ---- how it looks ------------------------------------------------------ */

const colour = computed(() => {
	const value = chartValue(COLOUR_OPTION)
	return typeof value === 'string' ? value : undefined
})
const themed = computed(() =>
	THEME_COLOURS.find((entry) => entry.name === (colour.value ?? 'primary')),
)
/** A colour of its own, typed in: shown while asked for or while one is set. */
const typingColour = ref(false)
const customColour = computed(
	() =>
		typingColour.value ||
		(chartValue(COLOUR_OPTION) !== undefined && !themed.value),
)

const lookSwitches = computed(() =>
	LOOK_SWITCHES.filter((entry) => entry.key in chartOptions.value),
)

const lookSummary = computed(() => {
	const parts = [themed.value?.name ?? 'Own colour']
	if ('showTooltip' in chartOptions.value) {
		parts.push(chartValue('showTooltip') === true ? 'figures on hover' : 'no hover figures')
	}
	if (has('showLegend')) {
		parts.push(config.value.showLegend === true ? 'legend' : 'no legend')
	}
	return parts.join(' · ')
})

/** The chart's other options, the ones a card does not set for it. */
const HANDLED_CHART_OPTIONS = new Set([
	COLOUR_OPTION,
	...LOOK_SWITCHES.map((entry) => entry.key),
])
const moreChartOptions = computed(() =>
	options.value.chart
		? heldBlockOptions(options.value.chart, chartOptions.value, false).filter(
				([key]) => !HANDLED_CHART_OPTIONS.has(key),
			)
		: [],
)
const showingMore = ref(false)
</script>

<template>
	<div class="flex flex-col gap-[22px]">
		<div class="flex flex-col gap-3">
			<div v-if="has('title')" class="flex flex-col gap-1.5">
				<label for="chart-title" class="text-xs font-medium text-toned">
					Title
					<span v-if="!options.title?.optional" class="text-warning">*</span>
				</label>
				<UInput
					id="chart-title"
					:model-value="text('title')"
					size="lg"
					placeholder="Shown at the top of the card"
					@update:model-value="write('title', String($event))"
				/>
			</div>
			<div v-if="has('description')" class="flex flex-col gap-1.5">
				<label for="chart-description" class="text-xs font-medium text-toned">
					Description
				</label>
				<UTextarea
					id="chart-description"
					:model-value="text('description')"
					:rows="2"
					placeholder="Shown under the title — optional"
					@update:model-value="write('description', String($event))"
				/>
			</div>
		</div>

		<div v-if="chartTypes.length" class="flex flex-col gap-2">
			<p class="text-xs font-semibold text-toned">
				Chart
				<span v-if="!chart.type" class="text-warning">*</span>
			</p>
			<div role="group" aria-label="How it draws" class="grid grid-cols-3 gap-1.5">
				<button
					v-for="type in [...mainTypes, ...(othersShown ? otherTypes : [])]"
					:key="type"
					type="button"
					class="flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-lg border transition-colors"
					:class="
						chart.type === type
							? 'border-primary/50 bg-primary/10 text-primary'
							: 'border-accented text-muted hover:border-primary/40'
					"
					:aria-pressed="chart.type === type"
					@click="setChartType(type)"
				>
					<UIcon :name="typeOf(type).icon" class="size-5" />
					<span
						class="max-w-full truncate px-1 text-xs font-medium"
						:class="chart.type === type ? 'text-primary' : 'text-toned'"
					>
						{{ typeOf(type).label }}
					</span>
				</button>
			</div>
			<UButton
				v-if="otherTypes.length && !othersShown"
				size="xs"
				color="neutral"
				variant="link"
				trailing-icon="i-ph-caret-down"
				:label="`More types: ${otherTypes
					.slice(0, 3)
					.map((type) => typeOf(type).label.toLowerCase())
					.join(', ')}…`"
				class="self-start px-0"
				@click="showingOthers = true"
			/>
		</div>

		<div class="flex flex-col gap-2.5">
			<DmsBuilderFoldCard
				v-if="has('fetchUrl') && block"
				icon="i-ph-table"
				title="Data"
				:summary="dataSummary"
				:open="open.has('data')"
				@toggle="toggle('data')"
			>
				<DmsBuilderDataSource
					:key="block.name"
					:model-value="config.fetchUrl"
					:response-shape="fetchUi.responseShape"
					:period-option="fetchUi.periodOption"
					:block-name="block.name"
					:draw="draw"
					@patch="patch($event)"
				/>
			</DmsBuilderFoldCard>

			<DmsBuilderFoldCard
				v-if="has('valueFormat') || has('showDelta')"
				icon="i-ph-trend-up"
				title="Headline"
				:summary="headlineSummary"
				:open="open.has('headline')"
				@toggle="toggle('headline')"
			>
				<div v-if="formats.length" class="flex flex-col gap-1.5">
					<p class="text-xs font-medium text-toned">Shown as</p>
					<div
						role="group"
						aria-label="Shown as"
						class="flex rounded-md border border-accented bg-default p-0.5"
					>
						<UButton
							v-for="entry in formats"
							:key="entry"
							:label="FORMAT_LABELS[entry] ?? entry"
							size="xs"
							:color="format === entry ? 'primary' : 'neutral'"
							:variant="format === entry ? 'soft' : 'ghost'"
							:aria-pressed="format === entry"
							class="flex-1 justify-center"
							@click="write('valueFormat', entry === formats[0] ? undefined : entry)"
						/>
					</div>
				</div>
				<div
					v-if="currency && has('currencyCode')"
					class="flex items-center gap-2"
				>
					<label for="chart-currency" class="text-xs text-muted">In</label>
					<UInput
						id="chart-currency"
						:model-value="text('currencyCode')"
						placeholder="EUR"
						class="w-20"
						@update:model-value="write('currencyCode', String($event).toUpperCase())"
					/>
					<span class="text-xs text-dimmed">Three letters: EUR, USD, GBP…</span>
				</div>
				<div v-if="has('showDelta')" class="flex items-center gap-3">
					<UIcon
						name="i-ph-arrow-up-right"
						class="size-4 shrink-0"
						:class="showsVariation ? 'text-primary' : 'text-dimmed'"
					/>
					<div class="flex min-w-0 flex-1 flex-col">
						<span
							class="text-[13px]"
							:class="variationLocked ? 'text-dimmed' : 'text-default'"
						>
							Show the variation
						</span>
						<span class="text-xs text-dimmed">
							{{
								variationLocked
									? 'Needs the comparison with the previous period, in Data.'
									: coded
										? 'The code decides whether it sends one.'
										: 'How far the figure moved since the period before.'
							}}
						</span>
					</div>
					<USwitch
						:model-value="showsVariation"
						:disabled="variationLocked"
						aria-label="Show the variation"
						@update:model-value="write('showDelta', $event === true ? true : undefined)"
					/>
				</div>
				<div
					v-if="has('primaryLabel') || has('comparisonLabel')"
					class="grid gap-2"
					:class="compares || text('comparisonLabel') ? 'grid-cols-2' : 'grid-cols-1'"
				>
					<div v-if="has('primaryLabel')" class="flex min-w-0 flex-col gap-1.5">
						<label for="chart-primary" class="text-xs font-medium text-toned">
							{{ compares ? 'This period' : 'Series name' }}
						</label>
						<UInput
							id="chart-primary"
							:model-value="text('primaryLabel')"
							placeholder="In the tooltip and legend"
							@update:model-value="write('primaryLabel', String($event))"
						/>
					</div>
					<div
						v-if="has('comparisonLabel') && (compares || text('comparisonLabel'))"
						class="flex min-w-0 flex-col gap-1.5"
					>
						<label for="chart-previous" class="text-xs font-medium text-toned">
							Previous period
						</label>
						<UInput
							id="chart-previous"
							:model-value="text('comparisonLabel')"
							placeholder="Last period"
							@update:model-value="write('comparisonLabel', String($event))"
						/>
					</div>
				</div>
			</DmsBuilderFoldCard>

			<DmsBuilderFoldCard
				icon="i-ph-sliders-horizontal"
				title="Look"
				:summary="lookSummary"
				:dot="themed?.swatch"
				:open="open.has('look')"
				@toggle="toggle('look')"
			>
				<div v-if="COLOUR_OPTION in chartOptions" class="flex flex-col gap-1.5">
					<p class="text-xs font-medium text-toned">Colour</p>
					<div role="group" aria-label="Colour" class="flex items-center gap-2.5 px-0.5 py-1">
						<button
							v-for="entry in THEME_COLOURS"
							:key="entry.name"
							type="button"
							class="size-[22px] rounded-full ring-offset-2 ring-offset-(--ui-bg) transition-shadow"
							:class="[
								entry.swatch,
								themed?.name === entry.name && !customColour
									? 'ring-2 ring-(--ui-text-highlighted)'
									: '',
							]"
							:aria-label="entry.name"
							:title="entry.name"
							:aria-pressed="themed?.name === entry.name && !customColour"
							@click="setChartOption(COLOUR_OPTION, entry.name === 'primary' ? undefined : entry.name); typingColour = false"
						/>
						<button
							type="button"
							class="flex size-[22px] items-center justify-center rounded-full border border-dashed border-accented text-muted"
							aria-label="Another colour"
							title="Another colour"
							:aria-pressed="customColour"
							@click="typingColour = true"
						>
							<UIcon name="i-ph-plus" class="size-3" />
						</button>
					</div>
					<UInput
						v-if="customColour"
						:model-value="colour ?? ''"
						size="sm"
						placeholder="primary-600, #1f7aec…"
						aria-label="Own colour"
						@update:model-value="setChartOption(COLOUR_OPTION, String($event) || undefined)"
					/>
				</div>

				<div
					v-if="has('showLegend') || lookSwitches.length"
					class="-mx-3 border-y border-default"
				>
					<div
						v-if="has('showLegend')"
						class="flex h-10 items-center gap-2.5 px-3"
					>
						<UIcon
							name="i-ph-list-bullets"
							class="size-4 shrink-0"
							:class="config.showLegend === true ? 'text-primary' : 'text-dimmed'"
						/>
						<span class="min-w-0 flex-1 text-[13px] text-default">Legend</span>
						<USwitch
							:model-value="config.showLegend === true"
							aria-label="Legend"
							@update:model-value="write('showLegend', $event === true ? true : undefined)"
						/>
					</div>
					<div
						v-for="entry in lookSwitches"
						:key="entry.key"
						class="flex h-10 items-center gap-2.5 border-t border-default px-3 first:border-t-0"
					>
						<UIcon
							:name="entry.icon"
							class="size-4 shrink-0"
							:class="chartValue(entry.key) === true ? 'text-primary' : 'text-dimmed'"
						/>
						<span class="min-w-0 flex-1 text-[13px] text-default">{{ entry.label }}</span>
						<USwitch
							:model-value="chartValue(entry.key) === true"
							:aria-label="entry.label"
							@update:model-value="setChartOption(entry.key, $event === true ? true : undefined)"
						/>
					</div>
				</div>

				<DmsBuilderOption
					v-if="has('icon')"
					name="icon"
					:schema="options.icon!"
					:model-value="config.icon"
					@update:model-value="write('icon', $event)"
				/>

				<div v-if="moreChartOptions.length" class="flex flex-col gap-3">
					<button
						type="button"
						class="flex min-h-11 items-center gap-2.5 rounded-lg border border-default px-3 py-2 text-left"
						:aria-expanded="showingMore"
						@click="showingMore = !showingMore"
					>
						<UIcon name="i-ph-sliders" class="size-4 shrink-0 text-muted" />
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="text-[13px] text-default">More options</span>
							<span class="truncate text-xs text-dimmed">Height, width, value range, axes</span>
						</span>
						<UIcon
							:name="showingMore ? 'i-ph-caret-down' : 'i-ph-caret-right'"
							class="size-3.5 text-dimmed"
						/>
					</button>
					<template v-if="showingMore">
						<DmsBuilderOption
							v-for="[key, nested] in moreChartOptions"
							:key="key"
							:name="key"
							:schema="nested"
							:model-value="chartValue(key)"
							@update:model-value="setChartOption(key, $event)"
						/>
					</template>
				</div>
			</DmsBuilderFoldCard>
		</div>
	</div>
</template>

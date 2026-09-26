<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBlockPanel } from '../runtime/block-panel'
import { descriptorOf, heldBlockOptions, switchOn } from '../runtime/catalog'
import {
	chartTypeLabel,
	COLOUR_OPTION,
	FORMAT_LABELS,
	heldBlock,
	LINE_CHART_TYPES,
	LOOK_SWITCHES,
	MAIN_CHART_TYPES,
} from '../runtime/chart-card'
import { THEME_COLORS } from '../runtime/constants'
import { describeSource, sourceQuery } from '../runtime/data-source'
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

const builder = useBuilder()
const session = builder.session

const { block, config, options, has, text, patch, write } = useBlockPanel(
	() => props.path,
)

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
	(options.value.valueFormat?.enum ?? []).map((value) => ({
		label: FORMAT_LABELS[String(value)] ?? String(value),
		value: String(value),
	})),
)
const format = computed(
	() => text('valueFormat') || formats.value[0]?.value || 'number',
)
const currency = computed(() => format.value === 'currency')

/** The source answers the period before, which is what a variation is taken from. */
const compares = computed(() => source.value?.compare === true)
/**
 * A source built here that does not compare has no variation to show; one in
 * the page's code may send one, and only the code says whether.
 */
const variationLocked = computed(() => !!source.value && !compares.value)
const showsVariation = computed(
	() =>
		switchOn(config.value.showDelta, options.value.showDelta) &&
		!variationLocked.value,
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
/** The theme's colour it is drawn in, primary until set; none for one of its own. */
const themed = computed(() =>
	THEME_COLORS.find((name) => name === (colour.value ?? 'primary')),
)

function chartOn(key: string): boolean {
	return switchOn(chartValue(key), chartOptions.value[key])
}

const legendOn = computed(() =>
	switchOn(config.value.showLegend, options.value.showLegend),
)

const lookSwitches = computed(() =>
	LOOK_SWITCHES.filter((entry) => entry.key in chartOptions.value),
)

const lookSummary = computed(() => {
	const parts = [themed.value ?? 'Own colour']
	if ('showTooltip' in chartOptions.value) {
		parts.push(chartOn('showTooltip') ? 'figures on hover' : 'no hover figures')
	}
	if (has('showLegend')) {
		parts.push(legendOn.value ? 'legend' : 'no legend')
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
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-3">
			<UFormField
				v-if="has('title')"
				label="Title"
				:required="!options.title?.optional"
			>
				<UInput
					:model-value="text('title')"
					size="lg"
					placeholder="Shown at the top of the card"
					class="w-full"
					@update:model-value="write('title', String($event))"
				/>
			</UFormField>
			<UFormField v-if="has('description')" label="Description">
				<UTextarea
					:model-value="text('description')"
					:rows="2"
					placeholder="Shown under the title — optional"
					class="w-full"
					@update:model-value="write('description', String($event))"
				/>
			</UFormField>
		</div>

		<UFormField v-if="chartTypes.length" label="Chart" :required="!chart.type">
			<div role="group" aria-label="How it draws" class="grid grid-cols-3 gap-1.5">
				<UButton
					v-for="type in [...mainTypes, ...(othersShown ? otherTypes : [])]"
					:key="type"
					:icon="typeOf(type).icon"
					:label="typeOf(type).label"
					:color="chart.type === type ? 'primary' : 'neutral'"
					:variant="chart.type === type ? 'subtle' : 'outline'"
					:aria-pressed="chart.type === type"
					:ui="{ leadingIcon: 'size-5', label: 'max-w-full text-xs' }"
					class="h-14 flex-col justify-center"
					@click="setChartType(type)"
				/>
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
				class="mt-2 px-0"
				@click="showingOthers = true"
			/>
		</UFormField>

		<div class="flex flex-col gap-2.5">
			<DmsBuilderFoldCard
				v-if="has('fetchUrl') && block"
				icon="i-ph-table"
				title="Data"
				:summary="dataSummary"
				default-open
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
			>
				<UFormField v-if="formats.length" label="Shown as">
					<DmsSegmented
						:model-value="format"
						:items="formats"
						aria-label="Shown as"
						size="xs"
						@update:model-value="
							write('valueFormat', $event === formats[0]?.value ? undefined : $event)
						"
					/>
				</UFormField>
				<UFormField
					v-if="currency && has('currencyCode')"
					label="In"
					help="Three letters: EUR, USD, GBP…"
					orientation="horizontal"
					class="justify-start"
				>
					<UInput
						:model-value="text('currencyCode')"
						placeholder="EUR"
						class="w-20"
						@update:model-value="write('currencyCode', String($event).toUpperCase())"
					/>
				</UFormField>
				<div v-if="has('showDelta')" class="flex items-center gap-3">
					<UIcon
						name="i-ph-arrow-up-right"
						class="size-4 shrink-0"
						:class="showsVariation ? 'text-primary' : 'text-dimmed'"
					/>
					<div class="flex min-w-0 flex-1 flex-col">
						<span
							class="text-sm"
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
						@update:model-value="write('showDelta', $event === true)"
					/>
				</div>
				<div
					v-if="has('primaryLabel') || has('comparisonLabel')"
					class="grid gap-2"
					:class="compares || text('comparisonLabel') ? 'grid-cols-2' : 'grid-cols-1'"
				>
					<UFormField
						v-if="has('primaryLabel')"
						:label="compares ? 'This period' : 'Series name'"
						class="min-w-0"
					>
						<UInput
							:model-value="text('primaryLabel')"
							placeholder="In the tooltip and legend"
							class="w-full"
							@update:model-value="write('primaryLabel', String($event))"
						/>
					</UFormField>
					<UFormField
						v-if="has('comparisonLabel') && (compares || text('comparisonLabel'))"
						label="Previous period"
						class="min-w-0"
					>
						<UInput
							:model-value="text('comparisonLabel')"
							placeholder="Last period"
							class="w-full"
							@update:model-value="write('comparisonLabel', String($event))"
						/>
					</UFormField>
				</div>
			</DmsBuilderFoldCard>

			<DmsBuilderFoldCard
				icon="i-ph-sliders-horizontal"
				title="Look"
				:summary="lookSummary"
				:dot="themed"
			>
				<DmsBuilderOption
					v-if="COLOUR_OPTION in chartOptions"
					:name="COLOUR_OPTION"
					:schema="chartOptions[COLOUR_OPTION]!"
					:model-value="chartValue(COLOUR_OPTION)"
					@update:model-value="setChartOption(COLOUR_OPTION, $event)"
				/>

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
							:class="legendOn ? 'text-primary' : 'text-dimmed'"
						/>
						<span class="min-w-0 flex-1 text-sm text-default">Legend</span>
						<USwitch
							:model-value="legendOn"
							aria-label="Legend"
							@update:model-value="write('showLegend', $event === true)"
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
							:class="chartOn(entry.key) ? 'text-primary' : 'text-dimmed'"
						/>
						<span class="min-w-0 flex-1 text-sm text-default">{{ entry.label }}</span>
						<USwitch
							:model-value="chartOn(entry.key)"
							:aria-label="entry.label"
							@update:model-value="setChartOption(entry.key, $event === true)"
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

				<UCollapsible
					v-if="moreChartOptions.length"
					v-model:open="showingMore"
					class="flex flex-col gap-3"
				>
					<UButton
						color="neutral"
						variant="outline"
						leading-icon="i-ph-sliders"
						:trailing-icon="showingMore ? 'i-ph-caret-down' : 'i-ph-caret-right'"
						block
						:ui="{ leadingIcon: 'size-4 text-muted', trailingIcon: 'size-4 text-dimmed' }"
						class="min-h-11 justify-start gap-2.5 px-3 text-left"
					>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="font-normal text-default">More options</span>
							<span class="truncate text-xs font-normal text-dimmed">Height, width, value range, axes</span>
						</span>
					</UButton>
					<template #content>
						<div class="flex flex-col gap-3">
							<DmsBuilderOption
								v-for="[key, nested] in moreChartOptions"
								:key="key"
								:name="key"
								:schema="nested"
								:model-value="chartValue(key)"
								@update:model-value="setChartOption(key, $event)"
							/>
						</div>
					</template>
				</UCollapsible>
			</DmsBuilderFoldCard>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useFigureBlock } from '../runtime/figure-block'
import { trendSummary } from '../runtime/figure-panel'

/**
 * How far a card's figures moved since the period before, and their course
 * drawn under them. What a switch turns on is set under it, and a switch the
 * card's source cannot answer is offered off, saying why.
 */
const props = defineProps<{ path: string }>()

const { has, value, set, source, coded, comparable } = useFigureBlock(() => props.path)

/** A query built here answers a variation only when it compares two periods. */
const variationLocked = computed(() => !!source.value && source.value.compare !== true)
const variation = computed(() => value('showDelta') === true && !variationLocked.value)
const variationHint = computed(() => {
	if (variationLocked.value) {
		return comparable.value
			? 'Needs the comparison with the previous period, in Data.'
			: 'Rows read from a table have no previous period to compare with.'
	}
	return coded.value
		? 'The code decides whether it sends one.'
		: 'How far the figure moved since the period before.'
})

/** No query built here answers a figure's course; the page's code may. */
const sparklineLocked = computed(() => !!source.value)
const sparkline = computed(() => value('showSparkline') === true && !sparklineLocked.value)
const sparklineHint = computed(() => {
	if (sparklineLocked.value) {
		return 'A figure read from a table has none yet.'
	}
	return coded.value ? 'The code decides whether it sends one.' : 'The figure over time, drawn under it.'
})
</script>

<template>
	<DmsBuilderFoldCard
		v-if="has('showDelta') || has('showSparkline')"
		icon="i-ph-trend-up-light"
		title="Trend"
		:summary="trendSummary(variation, sparkline)"
	>
		<template v-if="has('showDelta')">
			<div class="flex items-center gap-3">
				<UIcon
					name="i-ph-arrow-up-right-light"
					class="size-4 shrink-0"
					:class="variation ? 'text-primary' : 'text-dimmed'"
				/>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="text-sm" :class="variationLocked ? 'text-dimmed' : 'text-default'">
						Show the variation
					</span>
					<span class="text-xs text-dimmed">{{ variationHint }}</span>
				</div>
				<USwitch
					:model-value="variation"
					:disabled="variationLocked"
					aria-label="Show the variation"
					@update:model-value="set('showDelta', $event === true)"
				/>
			</div>
			<div v-if="variation" class="flex flex-col gap-3 border-l border-default pl-3">
				<div v-if="has('invert')" class="flex items-center gap-3">
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="text-sm text-default">A drop is good news</span>
						<span class="text-xs text-dimmed">Shown green when the figure falls.</span>
					</div>
					<USwitch
						:model-value="value('invert') === true"
						aria-label="A drop is good news"
						@update:model-value="set('invert', $event === true ? true : undefined)"
					/>
				</div>
				<UFormField v-if="has('compareLabel')" label="Label beside it">
					<UInput
						:model-value="String(value('compareLabel') ?? '')"
						placeholder="vs previous period"
						class="w-full"
						@update:model-value="set('compareLabel', String($event))"
					/>
				</UFormField>
			</div>
		</template>

		<template v-if="has('showSparkline')">
			<div class="flex items-center gap-3">
				<UIcon
					name="i-ph-chart-line-light"
					class="size-4 shrink-0"
					:class="sparkline ? 'text-primary' : 'text-dimmed'"
				/>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="text-sm" :class="sparklineLocked ? 'text-dimmed' : 'text-default'">
						Show the sparkline
					</span>
					<span class="text-xs text-dimmed">{{ sparklineHint }}</span>
				</div>
				<USwitch
					:model-value="sparkline"
					:disabled="sparklineLocked"
					aria-label="Show the sparkline"
					@update:model-value="set('showSparkline', $event === true)"
				/>
			</div>
			<div v-if="sparkline && has('sparklineAccent')" class="border-l border-default pl-3">
				<DmsBuilderColourChips
					:model-value="value('sparklineAccent')"
					label="Colour"
					auto="Like the trend"
					@update:model-value="set('sparklineAccent', $event)"
				/>
			</div>
		</template>
	</DmsBuilderFoldCard>
</template>

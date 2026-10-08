<script setup lang="ts">
import { computed } from 'vue'
import { useFigureBlock } from '../runtime/figure-block'
import { rankingSummary } from '../runtime/figure-panel'
import { CARD_FIELD_UI, PANEL_CARD } from '../runtime/form-panel'

/**
 * A top list, as someone building a page sets one up: what it lists, what it
 * is called, then its figures' format, its ranking and its trend, each folded
 * behind a line saying how it is set. Its height, the colour of its period
 * badge, routes and the rows shown without a source are the advanced view's.
 */
const props = defineProps<{ path: string }>()

const { block, config, options, has, text, write, value, set, patch } = useFigureBlock(
	() => props.path,
)

const fetchUi = computed(() => options.value.fetchUrl?.ui ?? {})

const ranked = computed(() => value('showRank') === true)
const highlighted = computed(() => {
	const count = value('highlightTopN')
	return typeof count === 'number' ? count : 0
})

function setHighlighted(count: number | null | undefined): void {
	if (typeof count === 'number' && count >= 0) {
		set('highlightTopN', count)
	}
}
</script>

<template>
	<div class="flex flex-col gap-3">
		<section v-if="has('fetchUrl') && block" :class="PANEL_CARD" aria-label="Data">
			<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
				<UIcon name="i-ph-table-light" class="size-4 text-primary" />
				Data
			</p>
			<DmsBuilderDataSource
				:key="block.name"
				:model-value="config.fetchUrl"
				:response-shape="fetchUi.responseShape"
				:period-option="fetchUi.periodOption"
				:block-name="block.name"
				@patch="patch($event)"
			/>
		</section>

		<DmsBuilderOnThePage :path="path">
			<UFormField v-if="has('emptyLabel')" label="When empty" :ui="CARD_FIELD_UI">
				<UInput
					class="w-full"
					:model-value="text('emptyLabel')"
					size="lg"
					placeholder="No data"
					@update:model-value="write('emptyLabel', String($event))"
				/>
			</UFormField>
		</DmsBuilderOnThePage>

		<DmsBuilderValueFold :path="path" />

		<DmsBuilderFoldCard
			v-if="has('showRank')"
			icon="i-ph-list-numbers-light"
			title="Ranking"
			:summary="rankingSummary(ranked, highlighted)"
		>
			<div class="flex items-center gap-3">
				<UIcon
					name="i-ph-ranking-light"
					class="size-4 shrink-0"
					:class="ranked ? 'text-primary' : 'text-dimmed'"
				/>
				<span class="min-w-0 flex-1 text-sm text-default">Show the rank</span>
				<USwitch
					:model-value="ranked"
					aria-label="Show the rank"
					@update:model-value="set('showRank', $event === true)"
				/>
			</div>
			<div v-if="ranked" class="flex flex-col gap-3 border-l border-default pl-3">
				<div v-if="has('highlightTopN')" class="flex items-center justify-between gap-3">
					<label :for="`${path}:highlight`" class="text-sm text-default">
						Highlight the first
					</label>
					<UInputNumber
						:id="`${path}:highlight`"
						:model-value="highlighted"
						:min="0"
						size="sm"
						:increment="{ 'aria-label': 'Highlight one more' }"
						:decrement="{ 'aria-label': 'Highlight one fewer' }"
						class="w-24 shrink-0"
						@update:model-value="setHighlighted"
					/>
				</div>
				<DmsBuilderColourChips
					v-if="has('rankColor') && highlighted > 0"
					:model-value="value('rankColor')"
					label="Colour"
					@update:model-value="set('rankColor', $event)"
				/>
			</div>
		</DmsBuilderFoldCard>

		<DmsBuilderTrendFold :path="path" />
	</div>
</template>

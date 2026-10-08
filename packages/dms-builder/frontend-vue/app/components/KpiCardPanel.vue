<script setup lang="ts">
import { computed } from 'vue'
import { useFigureBlock } from '../runtime/figure-block'
import { PANEL_CARD } from '../runtime/form-panel'

/**
 * A KPI card, as someone building a page sets one up: what it measures, what
 * it is called and how it looks, then its figure's format and its trend, each
 * folded behind a line saying how it is set. Routes, scopes and the values
 * shown without a source are the advanced view's.
 */
const props = defineProps<{ path: string }>()

const { block, config, options, has, value, set, patch } = useFigureBlock(() => props.path)

const fetchUi = computed(() => options.value.fetchUrl?.ui ?? {})

/** The card's two looks, each drawn as the card it makes. */
const STYLES = [
	{ value: 'default', label: 'Card' },
	{ value: 'stat', label: 'Compact' },
] as const

const style = computed(() => String(value('variant') ?? STYLES[0].value))
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

		<DmsBuilderOnThePage :path="path" with-icon>
			<div v-if="has('variant')" class="flex flex-col gap-1.5">
				<span class="text-sm text-muted">Style</span>
				<div role="group" aria-label="Style" class="grid grid-cols-2 gap-2">
					<button
						v-for="item in STYLES"
						:key="item.value"
						type="button"
						:aria-pressed="style === item.value"
						class="flex flex-col items-center gap-1.5 rounded-md border px-1.5 py-2.5 text-[13px] font-medium transition-colors"
						:class="
							style === item.value
								? 'border-primary bg-primary/10 text-highlighted'
								: 'border-accented text-toned hover:bg-default'
						"
						@click="set('variant', item.value)"
					>
						<!-- The card it makes: its name over its figure, its icon in a
						tile, or both quieter and smaller. -->
						<span
							aria-hidden="true"
							class="flex h-8.5 w-23 items-start gap-1.5 rounded-[5px] border border-current/25 px-1.5 py-1.25 opacity-70"
						>
							<span class="flex flex-1 flex-col gap-1">
								<span
									class="rounded-xs bg-current/40"
									:class="item.value === 'stat' ? 'h-0.75 w-7.5' : 'h-1 w-6.5'"
								/>
								<span class="h-2.25 w-10 rounded-xs bg-current" />
							</span>
							<span
								class="shrink-0 bg-current/30"
								:class="item.value === 'stat' ? 'size-1.75 rounded-[1px]' : 'size-3.25 rounded-[3px]'"
							/>
						</span>
						{{ item.label }}
					</button>
				</div>
			</div>
		</DmsBuilderOnThePage>

		<DmsBuilderValueFold :path="path" />
		<DmsBuilderTrendFold :path="path" />
	</div>
</template>

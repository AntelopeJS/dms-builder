<script setup lang="ts">
import { computed } from 'vue'
import { FORMAT_LABELS } from '../runtime/chart-card'
import { useFigureBlock } from '../runtime/figure-block'
import { CURRENCIES, currencyCode, currencyLabel, valueSummary } from '../runtime/figure-panel'

/**
 * How a card writes its figures: a number, a currency, a share, or rounded off;
 * which currency only once it is one.
 */
const props = defineProps<{ path: string }>()

const { options, has, value, set } = useFigureBlock(() => props.path)

const formats = computed(() =>
	(options.value.valueFormat?.enum ?? []).map((format) => ({
		label: FORMAT_LABELS[String(format)] ?? String(format),
		value: String(format),
	})),
)
const format = computed(() => String(value('valueFormat') ?? formats.value[0]?.value ?? ''))
const code = computed(() => String(value('currencyCode') ?? ''))

/** The usual ones, and the card's own when it is not among them. */
const currencies = computed(() =>
	(CURRENCIES.includes(code.value) || !code.value ? CURRENCIES : [code.value, ...CURRENCIES]).map(
		(entry) => ({ label: currencyLabel(entry), value: entry }),
	),
)

function typed(text: string): void {
	const entry = currencyCode(text)
	if (entry) {
		set('currencyCode', entry)
	}
}
</script>

<template>
	<DmsBuilderFoldCard
		v-if="has('valueFormat') && formats.length"
		icon="i-ph-hash"
		title="Value"
		:summary="valueSummary(format, code)"
	>
		<UFormField label="Shown as">
			<DmsSegmented
				:model-value="format"
				:items="formats"
				aria-label="Shown as"
				size="xs"
				@update:model-value="set('valueFormat', $event)"
			/>
		</UFormField>
		<UFormField
			v-if="format === 'currency' && has('currencyCode')"
			label="Currency"
			help="Another one? Type its three letters."
		>
			<USelectMenu
				:model-value="code"
				:items="currencies"
				value-key="value"
				create-item
				aria-label="Currency"
				class="w-full"
				@update:model-value="set('currencyCode', $event)"
				@create="typed"
			/>
		</UFormField>
	</DmsBuilderFoldCard>
</template>

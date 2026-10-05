/**
 * A KPI card or a top list, as its panel reads and writes it: an option unset
 * reads as what the card does without it, and one set back to that is unset
 * again, so the page's code says only what differs.
 */
import { computed } from 'vue'
import { useBlockPanel } from './block-panel'
import { COMPARED_SHAPES, sourceQuery } from './data-source'
import { FIGURE_DEFAULTS } from './figure-panel'
import { useBuilder } from './session'

export function useFigureBlock(path: () => string) {
	const builder = useBuilder()
	const session = builder.session
	const panel = useBlockPanel(path)
	const { block, config, patch } = panel

	const defaults = computed(() => FIGURE_DEFAULTS[block.value?.type ?? ''] ?? {})

	function value(key: string): unknown {
		return config.value[key] ?? defaults.value[key]
	}

	function set(key: string, next: unknown): void {
		patch({ [key]: next === '' || next === defaults.value[key] ? undefined : next })
	}

	/** The query the card reads, when the builder wrote it. */
	const source = computed(() =>
		block.value
			? sourceQuery(session.value.draft, session.value.structure, block.value.name)
			: undefined,
	)
	/** A route the card reads that the builder did not write: the page's code's. */
	const coded = computed(
		() => typeof config.value.fetchUrl === 'string' && config.value.fetchUrl !== '' && !source.value,
	)
	/** Whether what the query answers has room for the period before. */
	const comparable = computed(
		() => !!source.value?.response && COMPARED_SHAPES.includes(source.value.response),
	)

	return { ...panel, value, set, source, coded, comparable }
}

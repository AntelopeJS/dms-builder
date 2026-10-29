import { computed, watch } from 'vue'
import { isBound, sourceQuery } from '../runtime/data-source'
import type { QueryPoint } from '../runtime/types'
import { pointsOf, itemPoints, type QueryFilter } from './DataSource'
import type { useDataSourcePart1 } from './DataSourcePart1'

export function useDataSourcePart2(scope: ReturnType<typeof useDataSourcePart1>) {
	const { builder, session, resource, measure, measureField, groupBy, bucket, filters, orderBy, direction, limit, followPeriod, periodField, compare, preview, queryName, coded, ready, refine, apply, readPreview } = scope

	function removeFilter(index: number): void {
		filters.value = filters.value.filter((_, at) => at !== index)
		if (!filters.value.length) {
			refine('conditions', false)
		}
	}

	function pickResource(value: string): void {
		resource.value = value
		measureField.value = undefined
		groupBy.value = undefined
		periodField.value = undefined
		filters.value = []
		void builder.loadResource(value)
	}

	/** The headline figure the body carries, for the arrangements that have one. */
	const previewValue = computed(() => {
		const value = preview.value?.body?.value
		return typeof value === 'number' ? value : undefined
	})

	const previewDelta = computed(() => {
		const delta = preview.value?.body?.delta
		return typeof delta === 'number' ? delta : undefined
	})

	/**
	 * The points behind the body, wherever its arrangement put them: a plain route
	 * answers them directly, a card hands them over inside a chart series, and a
	 * ranking lists them as entries.
	 */
	const previewPoints = computed(() => {
		const body = preview.value?.body
		const series = pointsOf(body?.series)
		return series.length ? series : itemPoints(body?.items)
	})
	const previousPoints = computed(() =>
		pointsOf(preview.value?.body?.comparisonSeries),
	)

	/** What the preview draws: the points, and the period before dashed beside them. */
	const previewSeries = computed(() => {
		const series: Array<{ name: string; data: QueryPoint[]; strokeDashArray?: number }> =
			[{ name: 'This period', data: previewPoints.value }]
		if (previousPoints.value.length) {
			series.push({
				name: 'Previous period',
				data: previousPoints.value,
				strokeDashArray: 4,
			})
		}
		return series
	})

	/* ---- reopened ----------------------------------------------------------- */

	/**
	 * Fill the editor from the source the block already reads, so reopening a page
	 * shows what was configured rather than an empty form that would overwrite it.
	 */
	function hydrate(): void {
		const written = sourceQuery(
			session.value.draft,
			session.value.structure,
			queryName.value,
		)
		if (!written?.resource) {
			return
		}
		resource.value = written.resource
		void builder.loadResource(written.resource)
		const params = (written.params ?? {}) as Record<string, unknown>
		measure.value = (params.op as string) ?? 'count'
		measureField.value = params.field as string | undefined
		groupBy.value = params.groupBy as string | undefined
		bucket.value = (params.bucket as string | undefined) ?? bucket.value
		orderBy.value = params.orderBy === 'measure' ? 'measure' : 'group'
		direction.value = params.direction === 'desc' ? 'desc' : 'asc'
		limit.value = typeof params.limit === 'number' ? params.limit : undefined
		const where = Array.isArray(params.where)
			? (params.where as QueryFilter[])
			: []
		filters.value = where
			.filter((entry) => !isBound(entry.value))
			.map((entry) => ({
				field: entry.field,
				op: entry.op,
				value: String(entry.value),
			}))
		// A bound value is how a period is written, so finding one is how the editor
		// knows the source follows the page's period — and on which column.
		const bound = where.find((entry) => isBound(entry.value))
		followPeriod.value = bound !== undefined
		periodField.value = bound && bound.field !== groupBy.value ? bound.field : undefined
		compare.value = written.compare === true
	}

	hydrate()
	// Read what the source already answers: reopened, the editor otherwise said "No
	// rows match." over a table it had not asked anything yet. Only read — the
	// source is what the block holds, and writing it back would be an edit.
	if (ready.value && !coded.value) {
		void readPreview()
	}

	// Re-read whenever the choices settle, so the numbers on screen are the ones the
	// saved page would show rather than the ones a previous choice produced.
	watch(
		[
			resource,
			measure,
			measureField,
			groupBy,
			bucket,
			orderBy,
			direction,
			limit,
			followPeriod,
			periodField,
			compare,
			filters,
		],
		() => {
			void apply()
		},
		{ deep: true },
	)
	return {
		removeFilter,
		pickResource,
		previewValue,
		previewDelta,
		previewPoints,
		previousPoints,
		previewSeries,
		hydrate,
	}
}

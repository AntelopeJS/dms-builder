import { computed, ref } from 'vue'
import { pageRoutePath } from '#dms-core/app/utils/pageRoutes'
import {
	COMPARED_SHAPES,
	DATE_TYPES,
	describeSource,
	sourceQuery,
} from '../runtime/data-source'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import type { AddQueryInput, QueryPreview } from '../runtime/types'
import {
	MAX_LIMIT,
	PAGE_PERIOD_SCOPE,
	REFINEMENTS,
	PROP,
	RANKED_SHAPES,
	RESPONSE_SHAPES,
	type Refinement,
	type DraftFilter,
	type QueryFilter,
	type Props,
	type EmitFn,
} from './DataSource'

export function useDataSourcePart1(scope: { props: Readonly<Props>; emit: EmitFn }) {
	const { props, emit } = scope

	const builder = useBuilder()
	const session = builder.session
	// The route the source is served at is for whoever reads the code.
	const { advanced } = useBuilderMode()

	const resource = ref<string | undefined>(undefined)
	const measure = ref('count')
	const measureField = ref<string | undefined>(undefined)
	const groupBy = ref<string | undefined>(undefined)
	const bucket = ref<string | undefined>('month')
	const filters = ref<DraftFilter[]>([])
	const ranked = computed(() => RANKED_SHAPES.has(String(props.responseShape)))
	const defaultOrderBy = computed<'group' | 'measure'>(() =>
		ranked.value ? 'measure' : 'group',
	)
	const defaultDirection = computed<'asc' | 'desc'>(() =>
		ranked.value ? 'desc' : 'asc',
	)
	const orderBy = ref<'group' | 'measure'>(defaultOrderBy.value)
	const direction = ref<'asc' | 'desc'>(defaultDirection.value)
	const limit = ref<number | undefined>(undefined)
	const followPeriod = ref(false)
	/** The date column a period bounds, when the groups are not dates themselves. */
	const periodField = ref<string | undefined>(undefined)
	const compare = ref(false)
	const preview = ref<QueryPreview | null>(null)
	const previewing = ref(false)
	/** The refinements ticked and not set yet, which keep their row open. */
	const opened = ref(new Set<Refinement>())
	/** Whether someone chose to build here a source the page's code answered. */
	const building = ref(false)

	/** One number, or one point per group: what the block declared it reads. */
	const wantsSeries = computed(() => props.responseShape !== 'value')

	/**
	 * The arrangement the query is created with, taken from the block's own
	 * declaration: the block knows one envelope and reads nothing else, so asking the
	 * engine for anything but that one leaves it fetching what it cannot display.
	 *
	 * Narrowed rather than forwarded as it arrives: the declaration crosses the wire
	 * as a string, and an arrangement this engine has no helper for would be written
	 * into the page and then quietly served as bare points.
	 */
	const responseShape = computed(() =>
		RESPONSE_SHAPES.find((shape) => shape === props.responseShape),
	)

	/** Whether the block's arrangement has somewhere to put the period before. */
	const comparable = computed(
		() => !!responseShape.value && COMPARED_SHAPES.includes(responseShape.value),
	)

	/** A query named after the block that reads it, so the two stay recognizable. */
	const queryName = computed(() => props.blockName)

	/**
	 * A block pointed at a route this editor did not write — one in the page's
	 * code, or one it cannot read back — until someone chooses to build it here.
	 */
	const coded = computed(
		() =>
			!building.value &&
			typeof props.modelValue === 'string' &&
			props.modelValue !== '' &&
			!sourceQuery(session.value.draft, session.value.structure, queryName.value),
	)

	const fields = computed(
		() => session.value.resourceStructures[resource.value ?? '']?.fields ?? [],
	)

	function fieldsOfType(types: string[]) {
		return fields.value
			.filter((field) => types.includes(field.dataType?.$dataType ?? ''))
			.map((field) => ({ label: field.label || field.name, value: field.name }))
	}

	const numericFields = computed(() =>
		fieldsOfType(['number', 'price', 'percentage']),
	)
	const dateFields = computed(() => fieldsOfType(DATE_TYPES))
	const groupableFields = computed(() => [
		...fieldsOfType(['string', 'select', 'number', 'price', 'percentage']),
		...dateFields.value,
	])
	const filterableFields = computed(() =>
		fields.value.map((field) => ({
			label: field.label || field.name,
			value: field.name,
		})),
	)

	/** Whether the chosen grouping is a date, which is what a period bucket needs. */
	const groupsByDate = computed(() =>
		dateFields.value.some((field) => field.value === groupBy.value),
	)

	/** The column the page's period bounds: the dates grouped by, or the one picked. */
	const boundField = computed(() =>
		groupsByDate.value
			? groupBy.value
			: (periodField.value ?? dateFields.value[0]?.value),
	)

	const groupLabel = computed(
		() =>
			groupableFields.value.find((field) => field.value === groupBy.value)?.label ??
			'Group',
	)

	/**
	 * How the groups come, as one choice: along their own axis — dates oldest or
	 * newest first, names from A or from Z — or by what was measured.
	 */
	const sortItems = computed(() => [
		...(groupsByDate.value
			? [
					{ label: 'Oldest first', value: 'group:asc' },
					{ label: 'Newest first', value: 'group:desc' },
				]
			: [
					{ label: `${groupLabel.value}, A to Z`, value: 'group:asc' },
					{ label: `${groupLabel.value}, Z to A`, value: 'group:desc' },
				]),
		{ label: 'Largest first', value: 'measure:desc' },
		{ label: 'Smallest first', value: 'measure:asc' },
	])

	function setSort(value: unknown): void {
		const [by, way] = String(value).split(':')
		orderBy.value = by === 'measure' ? 'measure' : 'group'
		direction.value = way === 'desc' ? 'desc' : 'asc'
	}

	/** A whole number of groups the engine accepts, or none: keep every group. */
	function setLimit(value: string | number): void {
		const count = Math.round(Number(value))
		limit.value =
			value === '' || !Number.isFinite(count) || count < 1
				? undefined
				: Math.min(count, MAX_LIMIT)
	}

	const needsMeasureField = computed(() => measure.value !== 'count')

	/** What the source still waits on, said where its preview would be. */
	const waitingOn = computed(() =>
		needsMeasureField.value && !measureField.value
			? 'Choose what to measure.'
			: 'Choose how to split the rows.',
	)

	const ready = computed(() => {
		if (!resource.value) {
			return false
		}
		if (needsMeasureField.value && !measureField.value) {
			return false
		}
		return !wantsSeries.value || Boolean(groupBy.value)
	})

	/* ---- refining it -------------------------------------------------------- */

	const refinements = computed(() =>
		REFINEMENTS.filter((entry) => {
			if (entry.kind === 'sort' || entry.kind === 'top') {
				return wantsSeries.value && !!groupBy.value
			}
			if (entry.kind === 'period') {
				return !!props.periodOption && dateFields.value.length > 0
			}
			return filterableFields.value.length > 0
		}),
	)

	/** Ticked while its row is open, or while what it sets differs from without it. */
	function refined(kind: Refinement): boolean {
		if (opened.value.has(kind)) {
			return true
		}
		switch (kind) {
			case 'sort':
				return (
					orderBy.value !== defaultOrderBy.value ||
					direction.value !== defaultDirection.value
				)
			case 'top':
				return limit.value !== undefined
			case 'conditions':
				return filters.value.length > 0
			case 'period':
				return followPeriod.value
		}
	}

	function refine(kind: Refinement, on: boolean): void {
		const next = new Set(opened.value)
		if (on) {
			next.add(kind)
		} else {
			next.delete(kind)
		}
		opened.value = next
		if (kind === 'sort' && !on) {
			orderBy.value = defaultOrderBy.value
			direction.value = defaultDirection.value
		}
		if (kind === 'top' && !on) {
			limit.value = undefined
		}
		if (kind === 'conditions') {
			if (on && !filters.value.length) {
				addFilter()
			}
			if (!on) {
				filters.value = []
			}
		}
		if (kind === 'period') {
			followPeriod.value = on
			if (!on) {
				compare.value = false
			}
		}
	}

	const shownRefinements = computed(() =>
		refinements.value.filter((entry) => refined(entry.kind)),
	)

	/* ---- the query ---------------------------------------------------------- */

	/** The parameters the engine compiles, assembled from the choices above. */
	function queryParams(): Record<string, unknown> {
		const where: QueryFilter[] = filters.value
			.filter((filter) => filter.field && filter.value !== '')
			.map((filter) => ({
				field: filter.field,
				op: filter.op,
				value: filter.value,
			}))
		if (followPeriod.value && boundField.value) {
			// A period is two bounds the route reads per request, which is what the
			// page's period selector already sends.
			where.push(
				{ field: boundField.value, op: 'ge', value: { $param: { name: 'from' } } },
				{ field: boundField.value, op: 'le', value: { $param: { name: 'to' } } },
			)
		}
		const params: Record<string, unknown> = {}
		if (where.length > 0) {
			params.where = where
		}
		if (needsMeasureField.value) {
			params.op = measure.value
			params.field = measureField.value
		}
		if (!wantsSeries.value) {
			return params
		}
		params.groupBy = groupBy.value
		if (groupsByDate.value && bucket.value) {
			params.bucket = bucket.value
			params.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
		}
		if (measure.value === 'count') {
			params.op = 'count'
		}
		// Written even when they are the defaults, the way the engine reads a series
		// back: sent again, the same parameters have to build the same chain.
		params.orderBy = orderBy.value
		params.direction = direction.value
		if (limit.value !== undefined) {
			params.limit = limit.value
		}
		return params
	}

	/** Whether the route answers the period before too: bound, and asked to. */
	const compares = computed(
		() => comparable.value && followPeriod.value && compare.value,
	)

	function queryInput(): AddQueryInput {
		return {
			name: queryName.value,
			resource: resource.value as string,
			template: wantsSeries.value
				? 'series'
				: measure.value === 'count'
					? 'count'
					: 'aggregate',
			params: queryParams(),
			response: responseShape.value,
			...(compares.value ? { compare: true } : {}),
		}
	}

	/** What the source measures, in the words the block's panel folds it under. */
	const summary = computed(() =>
		describeSource(
			{
				name: queryName.value,
				resource: resource.value,
				params: queryParams(),
				compare: compares.value,
			},
			fields.value,
		),
	)

	/**
	 * The URL the generated route will answer at, which is what the block reads: a
	 * page's routes are served under the DMS's page prefix, not at the page's path.
	 */
	const endpoint = computed(() =>
		pageRoutePath(
			session.value.pageRef ?? '',
			`/stats/${queryName.value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`,
		),
	)

	async function apply(): Promise<void> {
		if (!ready.value) {
			return
		}
		const input = queryInput()
		const patch: Record<string, unknown> = { [PROP]: endpoint.value }
		if (props.periodOption) {
			// Binding a period means two options: the source, and the scope the block
			// follows. Writing one without the other leaves a chart asking for bounds
			// nobody sends.
			patch[props.periodOption] = followPeriod.value ? PAGE_PERIOD_SCOPE : undefined
		}
		// The source and the block's pointer to it, and every choice picked on the
		// way to a source that reads right, are one step to undo.
		builder.grouped(`source:${input.name}`, () => {
			builder.setDraftQuery(input)
			emit('patch', patch)
		})
		await readPreview()
	}

	async function readPreview(): Promise<void> {
		if (props.withoutPreview) {
			return
		}
		previewing.value = true
		try {
			preview.value = await builder.previewQuery(queryInput(), periodArgs())
		} finally {
			previewing.value = false
		}
	}

	/**
	 * Stand-in bounds for the preview, since no period selector is running here:
	 * the last twelve months, and the twelve before them for a comparison.
	 */
	function periodArgs(): Record<string, unknown> {
		if (!followPeriod.value) {
			return {}
		}
		const to = new Date()
		const from = new Date(to)
		from.setFullYear(from.getFullYear() - 1)
		const args: Record<string, unknown> = {
			from: from.toISOString(),
			to: to.toISOString(),
		}
		if (compares.value) {
			const before = new Date(from)
			before.setFullYear(before.getFullYear() - 1)
			args.compareFrom = before.toISOString()
			args.compareTo = from.toISOString()
		}
		return args
	}

	function addFilter(): void {
		filters.value = [
			...filters.value,
			{ field: filterableFields.value[0]?.value ?? '', op: 'eq', value: '' },
		]
	}
	return {
		builder,
		session,
		advanced,
		resource,
		measure,
		measureField,
		groupBy,
		bucket,
		filters,
		ranked,
		defaultOrderBy,
		defaultDirection,
		orderBy,
		direction,
		limit,
		followPeriod,
		periodField,
		compare,
		preview,
		previewing,
		opened,
		building,
		wantsSeries,
		responseShape,
		comparable,
		queryName,
		coded,
		fields,
		fieldsOfType,
		numericFields,
		dateFields,
		groupableFields,
		filterableFields,
		groupsByDate,
		boundField,
		groupLabel,
		sortItems,
		setSort,
		setLimit,
		needsMeasureField,
		waitingOn,
		ready,
		refinements,
		refined,
		refine,
		shownRefinements,
		queryParams,
		compares,
		queryInput,
		summary,
		endpoint,
		apply,
		readPreview,
		periodArgs,
		addFilter,
	}
}

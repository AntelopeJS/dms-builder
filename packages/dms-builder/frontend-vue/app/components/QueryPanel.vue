<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { describeSource, type SourceQuery } from '../runtime/data-source'
import { findNode, walkDraft } from '../runtime/draft'
import { blockKind, blockTitle } from '../runtime/naming'
import { useBuilder } from '../runtime/session'
import type { AddQueryInput, QueryPreview } from '../runtime/types'

/**
 * The data sources of the page, a workspace of their own: each one read as a
 * sentence, with where it answers, which blocks read it and what it answers
 * now. They are part of the page's draft — added, changed or removed with the
 * rest, on Save — and one a block still reads cannot be removed from under it.
 */

interface Source {
	name: string
	query?: SourceQuery
	/** Written by hand in the page's code: read here, changed there. */
	opaque: boolean
	endpoint: string
	/** Changed in the draft: written with the next save. */
	unsaved: boolean
}

const builder = useBuilder()
const session = builder.session

const selected = ref<string | null>(null)
const composing = ref(false)
const preview = ref<QueryPreview | null>(null)
const reading = ref(false)

/** A source's route, under the page, as a block points at it. */
function routeOf(name: string): string {
	return `/stats/${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`
}

/** The sources the change list holds a change of, by name. */
const changed = computed(
	() =>
		new Set(
			builder.unsaved.value
				.filter((change) => change.group === 'data' && change.kind !== 'removed')
				.map((change) => change.id.split(':').slice(2).join(':')),
		),
)

const sources = computed<Source[]>(() => {
	const drafted = session.value.draft?.queries
	const served = session.value.structure?.queries ?? []
	const listed: Source[] = []
	for (const query of served) {
		if (query.opaque) {
			listed.push({
				name: query.name,
				opaque: true,
				endpoint: query.endpoint,
				unsaved: false,
			})
			continue
		}
		// A draft listing its own sources has the last word on these.
		const now = drafted ? drafted.find((entry) => entry.name === query.name) : query
		if (now) {
			listed.push({
				name: query.name,
				query: now as SourceQuery,
				opaque: false,
				endpoint: now.endpoint ?? query.endpoint,
				unsaved: changed.value.has(query.name),
			})
		}
	}
	for (const query of drafted ?? []) {
		if (!served.some((entry) => entry.name === query.name)) {
			listed.push({
				name: query.name,
				query,
				opaque: false,
				endpoint: query.endpoint ?? routeOf(query.name),
				unsaved: true,
			})
		}
	}
	return listed
})

const current = computed(() =>
	sources.value.find((source) => source.name === selected.value),
)

watch(
	sources,
	(listed) => {
		if (!composing.value && !listed.some((source) => source.name === selected.value)) {
			selected.value = listed[0]?.name ?? null
		}
	},
	{ immediate: true },
)

/**
 * Which blocks read each source, by the URL they fetch.
 *
 * Discovered from the draft rather than recorded anywhere: a block points at its
 * data by URL, so what reads a source is whatever carries that URL — including a
 * block someone wired by hand.
 */
const readers = computed(() => {
	const found = new Map<string, string[]>()
	const page = session.value.pageRef ?? ''
	walkDraft(session.value.draft?.blocks ?? [], (block, path) => {
		for (const url of stringsIn(block.config)) {
			if (url.startsWith(page)) {
				const endpoint = url.slice(page.length)
				found.set(endpoint, [...(found.get(endpoint) ?? []), path])
			}
		}
	})
	return found
})

function stringsIn(value: unknown, found: string[] = []): string[] {
	if (typeof value === 'string') {
		found.push(value)
	} else if (Array.isArray(value)) {
		for (const entry of value) stringsIn(entry, found)
	} else if (value !== null && typeof value === 'object') {
		for (const entry of Object.values(value as Record<string, unknown>)) {
			stringsIn(entry, found)
		}
	}
	return found
}

function readersOf(source: Source): string[] {
	return readers.value.get(source.endpoint) ?? []
}

function fieldsOf(source: Source | undefined) {
	const ref_ = source?.query?.resource
	return ref_ ? (session.value.resourceStructures[ref_]?.fields ?? []) : []
}

function sentence(source: Source): string {
	if (source.opaque) {
		return 'Written in the page’s code'
	}
	return describeSource(source.query, fieldsOf(source)) ?? 'Not set up yet'
}

function usage(source: Source): string {
	if (source.opaque) {
		return 'in code'
	}
	const count = readersOf(source).length
	return count ? `${count} block${count === 1 ? '' : 's'}` : 'unused'
}

// What each source measures is said with its table's own labels.
watch(
	() => sources.value.map((source) => source.query?.resource ?? ''),
	(refs) => {
		for (const ref_ of refs) {
			if (ref_) void builder.loadResource(ref_)
		}
	},
	{ immediate: true },
)

const usedBy = computed(() => {
	const draft = session.value.draft
	const source = current.value
	if (!draft || !source) {
		return []
	}
	return readersOf(source).map((path) => {
		const block = findNode(draft, path)
		return {
			path,
			title: block ? blockTitle(block, session.value.catalog) : path,
			kind: block ? blockKind(block, session.value.catalog) : '',
		}
	})
})

function goTo(path: string): void {
	builder.setWorkspace('page')
	builder.select(path)
}

async function read(): Promise<void> {
	const query = current.value?.query
	if (!query?.resource || !query.template) {
		return
	}
	reading.value = true
	try {
		preview.value = await builder.previewQuery(query as AddQueryInput)
	} finally {
		reading.value = false
	}
}

watch(selected, () => {
	preview.value = null
})

/** What the preview answered, as rows: its figure, then its series or its list. */
const previewRows = computed<Array<[string, string]>>(() => {
	const body = preview.value?.body
	if (!body) {
		return []
	}
	const rows: Array<[string, string]> = []
	if (typeof body.value === 'number') {
		rows.push(['Value', body.value.toLocaleString()])
	}
	const series = Array.isArray(body.series) ? body.series : []
	for (const point of (series as Array<{ x: unknown; y: unknown }>).slice(0, 12)) {
		rows.push([String(point.x), Number(point.y).toLocaleString()])
	}
	const items = Array.isArray(body.items) ? body.items : []
	for (const item of (items as Array<Record<string, unknown>>).slice(0, 12)) {
		rows.push([String(item.label ?? item.name ?? ''), String(item.value ?? '')])
	}
	return rows
})

function remove(source: Source): void {
	builder.removeDraftQuery(source.name)
	selected.value = null
}

/* ---- a new source ------------------------------------------------------- */

const name = ref('')
const resource = ref<string | undefined>(undefined)
const template = ref('count')
const field = ref<string | undefined>(undefined)
const op = ref('sum')

const templates = computed(() => session.value.queryTemplates)
const needsField = computed(() => template.value === 'aggregate')
const fields = computed(() =>
	(session.value.resourceStructures[resource.value ?? '']?.fields ?? []).map(
		(entry) => ({ label: entry.label || entry.name, value: entry.name }),
	),
)
const taken = computed(() =>
	sources.value.some((source) => source.name === name.value.trim()),
)
const valid = computed(
	() =>
		/^[a-zA-Z][a-zA-Z0-9]*$/.test(name.value.trim()) &&
		!taken.value &&
		!!resource.value &&
		(!needsField.value || !!field.value),
)

onMounted(() => {
	void builder.loadQueryTemplates()
})

function startNew(): void {
	composing.value = true
	selected.value = null
	name.value = ''
	resource.value = undefined
	template.value = 'count'
	field.value = undefined
}

function pick(source: Source): void {
	composing.value = false
	selected.value = source.name
}

function pickResource(value: string): void {
	resource.value = value
	void builder.loadResource(value)
}

function create(): void {
	if (!valid.value || !resource.value) {
		return
	}
	const input: AddQueryInput = {
		name: name.value.trim(),
		resource: resource.value,
		template: template.value,
		params: needsField.value ? { op: op.value, field: field.value } : {},
		endpoint: routeOf(name.value.trim()),
	}
	builder.setDraftQuery(input)
	composing.value = false
	selected.value = input.name
}
</script>

<template>
	<div class="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
		<aside
			class="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-default bg-(--dms-bg-sidebar) p-3"
			aria-label="Data sources"
		>
			<div class="flex items-center justify-between gap-2 px-1">
				<DmsEyebrow>{{ sources.length }} on this page</DmsEyebrow>
				<UButton
					icon="i-ph-plus-light"
					label="Source"
					size="sm"
					:variant="composing ? 'soft' : 'solid'"
					aria-label="New data source"
					@click="startNew"
				/>
			</div>
			<div class="flex flex-col gap-0.5">
				<button
					v-for="source in sources"
					:key="source.name"
					type="button"
					class="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-elevated"
					:class="selected === source.name ? 'bg-primary/10' : ''"
					:aria-current="selected === source.name ? 'true' : undefined"
					@click="pick(source)"
				>
					<span class="flex items-center gap-2">
						<span
							class="min-w-0 flex-1 truncate font-mono text-[12.5px] font-semibold"
							:class="selected === source.name ? 'text-primary' : 'text-highlighted'"
						>
							{{ source.name }}
						</span>
						<span
							v-if="source.unsaved"
							class="size-1.5 shrink-0 rounded-full bg-warning"
							title="Not saved yet"
						/>
						<span class="shrink-0 font-mono text-[10.5px] text-dimmed">
							{{ usage(source) }}
						</span>
					</span>
					<span class="line-clamp-2 text-[11.5px] leading-snug text-muted">
						{{ sentence(source) }}
					</span>
				</button>
			</div>
			<p v-if="!sources.length && !composing" class="px-2 text-xs text-muted">
				No data source yet. A chart, a figure or a list reads its data from one.
			</p>
		</aside>

		<section class="flex min-h-0 min-w-0 flex-col overflow-y-auto">
			<!-- A new source: named, then built from a table. -->
			<div v-if="composing" class="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
				<p class="text-lg font-semibold text-highlighted">New data source</p>
				<UFormField
					label="Name"
					:error="taken ? 'Another source of the page has this name.' : undefined"
					help="Names its route: letters and digits, starting with a letter."
				>
					<UInput
						v-model="name"
						placeholder="inStockCount"
						class="w-full font-mono"
						autofocus
					/>
				</UFormField>
				<UFormField label="From">
					<USelectMenu
						:model-value="resource"
						:items="
							session.resources.map((entry) => ({ label: entry.ref, value: entry.ref }))
						"
						value-key="value"
						placeholder="Pick a table…"
						class="w-full"
						@update:model-value="pickResource($event)"
					/>
				</UFormField>
				<UFormField label="Measure">
					<div class="flex gap-2">
						<USelectMenu
							v-model="template"
							:items="templates.map((entry) => ({ label: entry.title, value: entry.id }))"
							value-key="value"
							class="min-w-0 flex-1"
						/>
						<template v-if="needsField">
							<USelectMenu
								v-model="op"
								:items="['sum', 'avg', 'min', 'max']"
								class="w-28"
							/>
							<USelectMenu
								:model-value="field"
								:items="fields"
								value-key="value"
								placeholder="of…"
								class="min-w-0 flex-1"
								@update:model-value="field = $event"
							/>
						</template>
					</div>
				</UFormField>
				<div class="flex gap-2">
					<UButton label="Add the source" :disabled="!valid" @click="create" />
					<UButton
						label="Cancel"
						color="neutral"
						variant="ghost"
						@click="composing = false"
					/>
				</div>
				<p class="text-xs text-muted">
					Added to the page's draft: its route is written with the next save. A
					block then reads it from its Data tab.
				</p>
			</div>

			<div v-else-if="current" class="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
				<header class="flex items-start gap-3">
					<span
						class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-(--dms-accent-tint) text-primary ring-1 ring-(--dms-accent-line) ring-inset"
					>
						<UIcon
							:name="current.opaque ? 'i-ph-code-light' : 'i-ph-function-light'"
							class="size-[19px]"
						/>
					</span>
					<div class="min-w-0 flex-1">
						<p class="flex items-center gap-2">
							<b class="truncate font-mono text-lg font-semibold text-highlighted">
								{{ current.name }}
							</b>
							<UBadge
								v-if="current.unsaved"
								color="warning"
								variant="soft"
								size="sm"
								label="unsaved"
							/>
						</p>
						<p class="text-sm text-toned">{{ sentence(current) }}</p>
					</div>
				</header>

				<div class="flex flex-col gap-1.5">
					<DmsEyebrow>Answers at</DmsEyebrow>
					<code
						class="truncate rounded-md border border-default bg-elevated px-2.5 py-1.5 font-mono text-xs text-toned"
					>
						GET {{ session.pageRef }}{{ current.endpoint }}
					</code>
				</div>

				<div class="flex flex-col gap-1.5">
					<DmsEyebrow>Used by · {{ usedBy.length }}</DmsEyebrow>
					<ul
						v-if="usedBy.length"
						class="flex flex-col divide-y divide-default rounded-lg border border-default"
					>
						<li
							v-for="reader in usedBy"
							:key="reader.path"
							class="flex items-center gap-2 px-3 py-2"
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[13px] font-semibold text-highlighted">
									{{ reader.title }}
								</span>
								<span class="block text-xs text-muted">{{ reader.kind }}</span>
							</span>
							<UButton
								label="Select"
								size="xs"
								color="neutral"
								variant="outline"
								@click="goTo(reader.path)"
							/>
						</li>
					</ul>
					<p v-else class="text-xs text-muted">No block of this page reads it.</p>
				</div>

				<div v-if="!current.opaque" class="flex flex-col gap-1.5">
					<div class="flex items-center justify-between">
						<DmsEyebrow>Preview</DmsEyebrow>
						<UButton
							icon="i-ph-play-light"
							:label="reading ? 'Reading…' : 'Read it now'"
							size="xs"
							color="neutral"
							variant="ghost"
							:loading="reading"
							@click="read"
						/>
					</div>
					<table
						v-if="previewRows.length"
						class="w-full overflow-hidden rounded-lg border border-default text-xs"
					>
						<tbody>
							<tr
								v-for="[label, value] in previewRows"
								:key="label"
								class="border-t border-default first:border-t-0"
							>
								<td class="px-3 py-1.5 text-muted">{{ label }}</td>
								<td class="px-3 py-1.5 text-right font-mono text-highlighted">
									{{ value }}
								</td>
							</tr>
						</tbody>
					</table>
					<p v-else-if="preview" class="text-xs text-muted">No rows match.</p>
				</div>

				<div class="flex flex-col gap-1.5 border-t border-default pt-4">
					<!-- A source a block reads cannot go from under it: the block would
					be left asking for an address nothing answers. -->
					<UButton
						icon="i-ph-trash-light"
						label="Remove the source"
						size="sm"
						color="error"
						variant="soft"
						class="self-start"
						:disabled="current.opaque || usedBy.length > 0"
						@click="remove(current)"
					/>
					<p v-if="current.opaque" class="text-xs text-muted">
						Written in the page’s code: change or remove it there.
					</p>
					<p v-else-if="usedBy.length" class="text-xs text-muted">
						Read by {{ usedBy.length }} block{{ usedBy.length === 1 ? '' : 's' }}:
						point {{ usedBy.length === 1 ? 'it' : 'them' }} elsewhere first.
					</p>
				</div>
			</div>

			<div
				v-else
				class="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center"
			>
				<span
					class="grid size-10 place-items-center rounded-lg bg-elevated text-muted ring-1 ring-default ring-inset"
				>
					<UIcon name="i-ph-function-light" class="size-5" />
				</span>
				<p class="text-sm font-semibold text-highlighted">No source picked</p>
				<p class="max-w-sm text-xs text-muted">
					A data source measures a table — a count, a sum, a ranking — for the
					charts, figures and lists of the page.
				</p>
			</div>
		</section>
	</div>
</template>

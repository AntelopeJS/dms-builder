<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { errorDetail } from '../runtime/errors'
import {
	answerItem,
	currentAnswer,
	draftFromMapped,
	draftFromProposal,
	forgetMappingDraft,
	includeResource,
	mappedTableViewsOf,
	mergedDraft,
	type MappingDraft,
	pointingAt,
	remapInput,
	type ResourceDraft,
	ruleSentence,
	settledInput,
	storedMappingDraft,
	storeMappingDraft,
	unanswered,
	unsavedRelations,
} from '../runtime/database'
import type {
	AnalysisState,
	MappedRelation,
	MappingProposal,
	MapResourcesResult,
	OpenItem,
	ProposedKind,
	ProposedResource,
} from '../runtime/database-types'

/**
 * A connection's mapping, decided in the builder: the analysis runs, its
 * proposal comes back with every choice marked as a catalog fact or a default
 * and the questions it could not decide asked at the relation they are about,
 * the integrator settles it, and
 * Apply sends one `MapResources` once they have read what it writes. The
 * relations the module maps already are listed too, and one changed there is
 * mapped again on its own. Nothing is written before the integrator says so.
 */

const props = defineProps<{ connection: string; module: string }>()
const emit = defineEmits<{ unsaved: [count: number] }>()

const POLL_MS = 1000

type Selection = { kind: 'proposed' | 'mapped'; relation: string }

const api = useBuilderApi()
const state = ref<AnalysisState | null>(null)
const draft = ref<MappingDraft | null>(null)
const mapped = ref<MappedRelation[]>([])
const mappedDrafts = ref<Record<string, ResourceDraft>>({})
/** The mapped relations as last read, which an unsaved draft differs from. */
const mappedRead = ref<Record<string, ResourceDraft>>({})
const selected = ref<Selection | null>(null)
const schemas = ref<string[]>([])
const problem = ref('')
const busy = ref(false)
const confirming = ref(false)
const applied = ref<MapResourcesResult | null>(null)
const remapped = ref<{ titles: string[]; page?: string; relabelled: string[] } | null>(null)
const remapProblem = ref('')
/** What reading the mapping warned about: a mapped relation the database no longer has. */
const mappedWarnings = ref<string[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false

const proposal = computed<MappingProposal | undefined>(() => state.value?.proposal)
const open = computed(() => (proposal.value && draft.value ? unanswered(proposal.value, draft.value) : []))
const schemasItem = computed(() => open.value.find((item) => item.kind === 'schemas'))
const tableViews = computed(() => draft.value?.resources.filter((entry) => entry.include && entry.tableView) ?? [])
const statsOnly = computed(() => draft.value?.resources.filter((entry) => entry.include && !entry.tableView) ?? [])
const left = computed(() => draft.value?.resources.filter((entry) => !entry.include) ?? [])
const mappedTableViews = computed(() => mappedTableViewsOf(mapped.value))
const unsaved = computed(() => unsavedRelations(mappedDrafts.value, mappedRead.value))
const summary = computed(() =>
	proposal.value && draft.value ? settledInput(proposal.value, draft.value, mappedTableViews.value) : undefined,
)

const currentIndex = computed(() =>
	selected.value?.kind === 'proposed'
		? (draft.value?.resources.findIndex((entry) => entry.relation === selected.value?.relation) ?? -1)
		: -1,
)
const currentProposed = computed<ProposedResource | undefined>(() => {
	const relation = selected.value?.relation
	if (selected.value?.kind === 'mapped') {
		return mapped.value.find((entry) => entry.resource.relation === relation)?.resource
	}
	return (
		proposal.value?.resources.find((entry) => entry.relation === relation) ??
		proposal.value?.open.find((item) => item.resource?.relation === relation)?.resource
	)
})

function stopPolling(): void {
	if (timer) clearTimeout(timer)
	timer = undefined
}

function failed(message: string): void {
	problem.value = message
	if (state.value?.status === 'running') {
		state.value = { ...state.value, status: 'failed', error: message }
	}
}

async function loadMapped(): Promise<void> {
	const result = await api.mapping(props.connection, props.module)
	if (disposed) return
	if (!result.ok) {
		problem.value = JSON.stringify(result.error)
		return
	}
	mapped.value = result.data
	mappedWarnings.value = (result.warnings ?? []).map((warning) => warning.message)
	mappedRead.value = Object.fromEntries(
		result.data.map((entry) => [entry.resource.relation, draftFromMapped(entry)]),
	)
	mappedDrafts.value = Object.fromEntries(
		result.data.map((entry) => [entry.resource.relation, draftFromMapped(entry)]),
	)
}

async function poll(id: string): Promise<void> {
	const result = await api.analysis(id)
	if (disposed) return
	if (!result.ok) {
		failed(JSON.stringify(result.error))
		return
	}
	state.value = result.data
	if (result.data.status === 'running') {
		timer = setTimeout(() => void poll(id), POLL_MS)
		return
	}
	if (result.data.proposal) {
		draft.value = mergedDraft(result.data.proposal, storedMappingDraft(props.connection, props.module))
	}
}

async function analyse(only?: string[]): Promise<void> {
	stopPolling()
	problem.value = ''
	applied.value = null
	confirming.value = false
	const result = await api.analyseDatabase(props.connection, props.module, only)
	if (disposed) return
	if (!result.ok) {
		failed(JSON.stringify(result.error))
		return
	}
	state.value = result.data
	await poll(result.data.id)
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
	if (unsaved.value.length) event.preventDefault()
}

watch(draft, (value) => value && storeMappingDraft(value), { deep: true })
watch(
	() => unsaved.value.length,
	(count) => {
		emit('unsaved', count)
		if (count) remapped.value = null
	},
	{ immediate: true },
)
onMounted(() => {
	void loadMapped()
	window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
	disposed = true
	stopPolling()
	window.removeEventListener('beforeunload', onBeforeUnload)
	emit('unsaved', 0)
})

function answer(item: OpenItem, value: unknown): void {
	if (draft.value) answerItem(draft.value, item, value)
}

function openFor(relation: string): OpenItem[] {
	return open.value.filter((item) => item.relation === relation)
}

function discardDraft(): void {
	if (!proposal.value) return
	forgetMappingDraft(props.connection, props.module)
	draft.value = draftFromProposal(proposal.value)
}

function proposedRule(relation: string): { rule: string; kind: ProposedKind } | undefined {
	const proposed = proposal.value?.resources.find((entry) => entry.relation === relation)
	return proposed && { rule: proposed.tableView.rule, kind: proposed.tableView.kind }
}

function select(kind: Selection['kind'], relation: string): void {
	selected.value = { kind, relation }
	remapProblem.value = ''
}

async function apply(): Promise<void> {
	if (!summary.value) return
	busy.value = true
	problem.value = ''
	const result = await api.mapDatabase(summary.value)
	busy.value = false
	confirming.value = false
	if (!result.ok) {
		problem.value = JSON.stringify(result.error)
		return
	}
	applied.value = result.data
	forgetMappingDraft(props.connection, props.module)
	await loadMapped()
}

/** The relations whose label a remap changes, as the columns pointing at them must show. */
function relabelledBy(relations: string[]): string[] {
	const changed = relations.filter(
		(relation) => mappedDrafts.value[relation]?.label !== mappedRead.value[relation]?.label,
	)
	const pointing = changed.flatMap((relation) => pointingAt(null, mapped.value, relation))
	return [...new Set(pointing.map((column) => column.split('.').slice(0, -1).join('.')))]
		.filter((relation) => !relations.includes(relation))
		.map((relation) => mappedDrafts.value[relation]?.title ?? relation)
}

async function remap(): Promise<void> {
	const relations = unsaved.value
	if (!relations.length) return
	busy.value = true
	remapped.value = null
	remapProblem.value = ''
	const resources = relations.map((relation) => mappedDrafts.value[relation]!)
	const result = await api.mapDatabase(
		remapInput(props.connection, props.module, resources, mappedTableViews.value),
	)
	busy.value = false
	if (!result.ok) {
		remapProblem.value = errorDetail(result.error).join(' ') || JSON.stringify(result.error)
		return
	}
	remapped.value = {
		titles: resources.map((resource) => resource.title),
		page: relations.length === 1 ? result.data.resources[0]?.page : undefined,
		relabelled: relabelledBy(relations),
	}
	await loadMapped()
}
</script>

<template>
	<div class="flex flex-col gap-4 p-6">
		<header class="flex items-center gap-3">
			<div class="min-w-0 flex-1">
				<p class="text-xl font-semibold tracking-tight text-highlighted">{{ connection }}</p>
				<p class="font-mono text-xs text-muted">
					<template v-if="proposal">{{ proposal.database.engine }} · {{ proposal.database.role }} · </template>
					saved in module {{ module }}
				</p>
			</div>
			<UButton
				v-if="proposal && draft && !applied"
				label="Start over from the suggestion"
				color="neutral"
				variant="ghost"
				size="sm"
				@click="discardDraft"
			/>
			<UButton
				icon="i-ph-magnifying-glass-light"
				:label="proposal ? 'Analyse again' : 'Analyse'"
				:loading="state?.status === 'running'"
				@click="analyse()"
			/>
		</header>

		<p v-if="problem" class="text-xs text-error">{{ problem }}</p>
		<p v-for="warning in mappedWarnings" :key="warning" class="text-xs text-warning">{{ warning }}</p>

		<div v-if="state?.status === 'running'" class="text-xs text-muted" aria-live="polite">
			{{ state.progress.described }} of {{ state.progress.relations }} relations described,
			{{ state.progress.profiled }} of {{ state.progress.toProfile }} profiled<template v-if="state.progress.timeouts">,
			{{ state.progress.timeouts }} measures out of time</template>.
		</div>
		<p v-else-if="state?.status === 'failed'" class="text-xs text-error">The analysis failed: {{ state.error }}</p>

		<div
			v-if="applied"
			class="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-toned"
		>
			<b class="font-semibold text-highlighted">Applied.</b>
			{{ applied.resources.length }} tables added. Their pages appear in the menu under
			{{ connection.toUpperCase() }} within a few seconds.
		</div>

		<section
			v-if="proposal && draft && !applied && schemasItem"
			class="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
		>
			<span class="min-w-0 flex-1 text-toned">{{ schemasItem.question }}</span>
			<USelect
				v-model="schemas"
				multiple
				:items="schemasItem.options.map((option) => ({ label: option.title, value: String(option.value) }))"
				placeholder="Schemas"
				size="xs"
				class="w-64"
			/>
			<UButton label="Analyse these" size="xs" :disabled="!schemas.length" @click="analyse(schemas)" />
		</section>

		<div v-if="(proposal && draft && !applied) || mapped.length" class="grid min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-4">
			<aside class="flex flex-col gap-3" aria-label="Tables">
				<template v-if="proposal && draft && !applied">
					<template v-for="group in [
						{ title: 'Pages', entries: tableViews },
						{ title: 'Stats only, no page', entries: statsOnly },
						{ title: 'Not added', entries: left },
					]" :key="group.title">
						<DmsEyebrow v-if="group.entries.length">{{ group.title }} ({{ group.entries.length }})</DmsEyebrow>
						<div v-for="entry in group.entries" :key="entry.relation" class="flex items-center gap-2">
							<UCheckbox
								:model-value="entry.include"
								:aria-label="`Add ${entry.relation}`"
								@update:model-value="includeResource(draft, entry.relation, $event === true)"
							/>
							<UButton
								color="neutral"
								variant="ghost"
								size="xs"
								class="min-w-0 flex-1 justify-start font-mono"
								:class="selected?.relation === entry.relation ? 'bg-primary/10 text-primary' : ''"
								@click="select('proposed', entry.relation)"
							>
								{{ entry.relation }}
							</UButton>
							<UBadge v-if="openFor(entry.relation).length" color="warning" variant="subtle" size="sm">
								{{ openFor(entry.relation).length }} to decide
							</UBadge>
							<UTooltip
								v-if="proposedRule(entry.relation)?.kind === 'default'"
								:text="ruleSentence(proposedRule(entry.relation)!.rule)"
							>
								<UBadge color="warning" variant="subtle" size="sm">
									suggested
								</UBadge>
							</UTooltip>
						</div>
					</template>
					<template v-if="proposal.excluded.length">
						<DmsEyebrow>Skipped automatically ({{ proposal.excluded.length }})</DmsEyebrow>
						<p v-for="entry in proposal.excluded" :key="entry.relation" class="text-[11px] text-muted">
							<span class="font-mono">{{ entry.relation }}</span>: {{ entry.reason }} ({{ ruleSentence(entry.rule) }})
						</p>
					</template>
				</template>
				<template v-if="mapped.length">
					<DmsEyebrow>Already added ({{ mapped.length }})</DmsEyebrow>
					<UButton
						v-for="entry in mapped"
						:key="entry.resource.relation"
						color="neutral"
						variant="ghost"
						size="xs"
						class="justify-start font-mono"
						:class="selected?.relation === entry.resource.relation ? 'bg-primary/10 text-primary' : ''"
						@click="select('mapped', entry.resource.relation)"
					>
						{{ entry.resource.relation }}
						<UBadge v-if="unsaved.includes(entry.resource.relation)" color="warning" variant="subtle" size="sm">
							unsaved
						</UBadge>
					</UButton>
				</template>
			</aside>

			<section class="min-w-0">
				<template v-if="selected?.kind === 'proposed' && draft && currentIndex >= 0">
					<DmsBuilderDatabaseRelation
						v-model:resource="draft.resources[currentIndex]"
						:connection="connection"
						:proposed="currentProposed"
						:open="openFor(selected.relation)"
						:pointing="pointingAt(draft, mapped, selected.relation)"
						@answer="answer"
					/>
				</template>
				<template v-else-if="selected?.kind === 'mapped' && mappedDrafts[selected.relation]">
					<DmsBuilderDatabaseRelation
						v-model:resource="mappedDrafts[selected.relation]"
						:connection="connection"
						:proposed="currentProposed"
						:pointing="pointingAt(draft, mapped, selected.relation)"
					/>
					<div class="mt-3 flex flex-wrap items-center gap-3" aria-live="polite">
						<UButton
							:label="busy ? 'Applying…' : unsaved.length > 1 ? `Apply changes (${unsaved.length} tables)` : 'Apply changes'"
							size="sm"
							:loading="busy"
							:disabled="!unsaved.length"
							@click="remap"
						/>
						<span v-if="remapProblem" class="text-xs text-error">{{ remapProblem }}</span>
						<span
							v-else-if="remapped"
							class="rounded-md border border-success/40 bg-success/10 px-2 py-1 text-xs text-toned"
						>
							Saved {{ remapped.titles.join(', ') }}. The pages update once the module reloads, in a few seconds.
							<template v-if="remapped.relabelled.length">
								The columns pointing at them in {{ remapped.relabelled.join(', ') }} show the new label too.
							</template>
							<a v-if="remapped.page" :href="`/${remapped.page}`" class="text-primary underline">Open the page</a>
						</span>
						<span v-else-if="unsaved.length" class="text-xs text-warning">
							Not saved yet: {{ unsaved.map((relation) => mappedDrafts[relation]?.title).join(', ') }}.
						</span>
						<span v-else class="text-xs text-muted">No changes to apply.</span>
					</div>
				</template>
				<p v-else class="text-xs text-muted">Pick a table to see its columns, or apply the suggestion as it stands.</p>
			</section>
		</div>

		<footer v-if="proposal && draft && !applied && summary" class="flex flex-col gap-3 border-t border-default pt-3">
			<div v-if="confirming" class="flex flex-col gap-1 rounded-md border border-default bg-elevated px-3 py-2 text-xs text-toned">
				<p class="font-semibold text-highlighted">Applying will:</p>
				<p v-for="entry in summary.resources" :key="entry.relation">
					· <span class="font-mono">{{ entry.relation }}</span>:
					{{ entry.tableView ? `add a page${entry.writable ? ' where rows can be edited' : ', read-only'}` : 'add it to stats, with no page' }},
					with {{ entry.fields.length }} columns
				</p>
				<p v-if="summary.excluded?.length">
					· remember {{ summary.excluded.length }} tables as not added, so the next analysis does not suggest them
				</p>
				<template v-if="open.length">
					<p>· leave {{ open.length }} questions open for next time, applied meanwhile as:</p>
					<p v-for="item in open" :key="item.id" class="pl-3">
						<span class="font-mono">{{ item.column ? `${item.relation}.${item.column}` : item.relation ?? connection }}</span>:
						{{ currentAnswer(draft, item) }}
					</p>
				</template>
			</div>
			<div class="flex items-center gap-3">
				<template v-if="confirming">
					<UButton label="Confirm" :loading="busy" @click="apply" />
					<UButton label="Back" color="neutral" variant="ghost" @click="confirming = false" />
				</template>
				<UButton v-else label="Apply" @click="confirming = true" />
				<span class="text-xs text-muted">
					Adds {{ tableViews.length }} tables with a page and {{ statsOnly.length }} for stats only.
				</span>
			</div>
		</footer>
	</div>
</template>

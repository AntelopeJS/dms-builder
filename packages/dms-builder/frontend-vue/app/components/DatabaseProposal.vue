<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import {
	answerItem,
	draftFromMapped,
	draftFromProposal,
	forgetMappingDraft,
	includeResource,
	mappedTableViewsOf,
	mergedDraft,
	type MappingDraft,
	remapInput,
	type ResourceDraft,
	ruleSentence,
	settledInput,
	storedMappingDraft,
	storeMappingDraft,
	unanswered,
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
 * and the questions it could not decide on top, the integrator settles it, and
 * Apply sends one `MapResources` once they have read what it writes. The
 * relations the module maps already are listed too, and one changed there is
 * mapped again on its own. Nothing is written before the integrator says so.
 */

const props = defineProps<{ connection: string; module: string }>()

const POLL_MS = 1000
const KIND_COLORS: Record<ProposedKind, 'neutral' | 'warning'> = { fact: 'neutral', default: 'warning' }

type Selection = { kind: 'proposed' | 'mapped'; relation: string }

const api = useBuilderApi()
const state = ref<AnalysisState | null>(null)
const draft = ref<MappingDraft | null>(null)
const mapped = ref<MappedRelation[]>([])
const mappedDrafts = ref<Record<string, ResourceDraft>>({})
const selected = ref<Selection | null>(null)
const schemas = ref<string[]>([])
const problem = ref('')
const busy = ref(false)
const confirming = ref(false)
const applied = ref<MapResourcesResult | null>(null)
const remapped = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false

const proposal = computed<MappingProposal | undefined>(() => state.value?.proposal)
const open = computed(() => (proposal.value && draft.value ? unanswered(proposal.value, draft.value) : []))
const tableViews = computed(() => draft.value?.resources.filter((entry) => entry.include && entry.tableView) ?? [])
const statsOnly = computed(() => draft.value?.resources.filter((entry) => entry.include && !entry.tableView) ?? [])
const left = computed(() => draft.value?.resources.filter((entry) => !entry.include) ?? [])
const mappedTableViews = computed(() => mappedTableViewsOf(mapped.value))
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

watch(draft, (value) => value && storeMappingDraft(value), { deep: true })
onMounted(() => void loadMapped())
onBeforeUnmount(() => {
	disposed = true
	stopPolling()
})

function answer(item: OpenItem, value: unknown): void {
	if (draft.value) answerItem(draft.value, item, value)
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
	remapped.value = ''
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

async function remap(relation: string): Promise<void> {
	const resource = mappedDrafts.value[relation]
	if (!resource) return
	busy.value = true
	problem.value = ''
	const result = await api.mapDatabase(
		remapInput(props.connection, props.module, resource, mappedTableViews.value),
	)
	busy.value = false
	if (!result.ok) {
		problem.value = JSON.stringify(result.error)
		return
	}
	remapped.value = relation
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
					maps into {{ module }}
				</p>
			</div>
			<UButton
				v-if="proposal && draft && !applied"
				label="Discard my changes"
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
			{{ applied.resources.length }} relations mapped. The pages appear once the module reloads; stats pages
			are made in the page workspace, or by the assistant.
		</div>

		<template v-if="proposal && draft && !applied">
			<section v-if="open.length" class="flex flex-col gap-2">
				<p class="text-sm font-semibold text-highlighted">To decide ({{ open.length }})</p>
				<div
					v-for="item in open"
					:key="item.id"
					class="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
				>
					<span class="min-w-0 flex-1 text-toned">{{ item.question }}</span>
					<template v-if="item.kind === 'schemas'">
						<USelect
							v-model="schemas"
							multiple
							:items="item.options.map((option) => ({ label: option.title, value: String(option.value) }))"
							placeholder="Schemas"
							size="xs"
							class="w-64"
						/>
						<UButton label="Analyse these" size="xs" :disabled="!schemas.length" @click="analyse(schemas)" />
					</template>
					<USelect
						v-else
						:items="item.options.map((option) => ({ label: option.title, value: JSON.stringify(option.value) }))"
						placeholder="Answer"
						size="xs"
						class="w-64"
						@update:model-value="answer(item, JSON.parse($event as string))"
					/>
				</div>
			</section>
		</template>

		<div v-if="(proposal && draft && !applied) || mapped.length" class="grid min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-4">
			<aside class="flex flex-col gap-3" aria-label="Relations">
				<template v-if="proposal && draft && !applied">
					<template v-for="group in [
						{ title: 'TableViews', entries: tableViews },
						{ title: 'Stats only', entries: statsOnly },
						{ title: 'Left out', entries: left },
					]" :key="group.title">
						<DmsEyebrow v-if="group.entries.length">{{ group.title }} ({{ group.entries.length }})</DmsEyebrow>
						<div v-for="entry in group.entries" :key="entry.relation" class="flex items-center gap-2">
							<UCheckbox
								:model-value="entry.include"
								:aria-label="`Map ${entry.relation}`"
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
							<UTooltip v-if="proposedRule(entry.relation)" :text="ruleSentence(proposedRule(entry.relation)!.rule)">
								<UBadge :color="KIND_COLORS[proposedRule(entry.relation)!.kind]" variant="subtle" size="sm">
									{{ proposedRule(entry.relation)!.kind }}
								</UBadge>
							</UTooltip>
						</div>
					</template>
					<template v-if="proposal.excluded.length">
						<DmsEyebrow>Excluded by the analysis ({{ proposal.excluded.length }})</DmsEyebrow>
						<p v-for="entry in proposal.excluded" :key="entry.relation" class="text-[11px] text-muted">
							<span class="font-mono">{{ entry.relation }}</span>: {{ entry.reason }} ({{ ruleSentence(entry.rule) }})
						</p>
					</template>
				</template>
				<template v-if="mapped.length">
					<DmsEyebrow>Mapped ({{ mapped.length }})</DmsEyebrow>
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
					</UButton>
				</template>
			</aside>

			<section class="min-w-0">
				<template v-if="selected?.kind === 'proposed' && draft && currentIndex >= 0">
					<DmsBuilderDatabaseRelation
						v-model:resource="draft.resources[currentIndex]"
						:connection="connection"
						:proposed="currentProposed"
					/>
				</template>
				<template v-else-if="selected?.kind === 'mapped' && mappedDrafts[selected.relation]">
					<DmsBuilderDatabaseRelation
						v-model:resource="mappedDrafts[selected.relation]"
						:connection="connection"
						:proposed="currentProposed"
					/>
					<div class="mt-3 flex items-center gap-3">
						<UButton label="Map again" size="sm" :loading="busy" @click="remap(selected.relation)" />
						<span v-if="remapped === selected.relation" class="text-xs text-success">Mapped again.</span>
						<span v-else class="text-xs text-muted">Rewrites this relation and its page from these choices.</span>
					</div>
				</template>
				<p v-else class="text-xs text-muted">Pick a relation to see its columns, or apply the proposal as it stands.</p>
			</section>
		</div>

		<footer v-if="proposal && draft && !applied && summary" class="flex flex-col gap-3 border-t border-default pt-3">
			<div v-if="confirming" class="flex flex-col gap-1 rounded-md border border-default bg-elevated px-3 py-2 text-xs text-toned">
				<p class="font-semibold text-highlighted">Apply writes, in one change:</p>
				<p v-for="entry in summary.resources" :key="entry.relation">
					· <span class="font-mono">{{ entry.relation }}</span>:
					{{ entry.tableView ? `a TableView page${entry.writable ? ', editable' : ', read-only'}` : 'stats only, no page' }},
					{{ entry.fields.length }} columns
				</p>
				<p v-if="summary.excluded?.length">
					· {{ summary.excluded.length }} relations recorded as left out, so the next analysis does not propose them
				</p>
				<p v-if="open.length">· {{ open.length }} questions stay open and come back next time</p>
			</div>
			<div class="flex items-center gap-3">
				<template v-if="confirming">
					<UButton label="Write it" :loading="busy" @click="apply" />
					<UButton label="Back" color="neutral" variant="ghost" @click="confirming = false" />
				</template>
				<UButton v-else label="Apply" @click="confirming = true" />
				<span class="text-xs text-muted">
					Maps {{ tableViews.length }} TableViews and {{ statsOnly.length }} stats-only relations.
				</span>
			</div>
		</footer>
	</div>
</template>

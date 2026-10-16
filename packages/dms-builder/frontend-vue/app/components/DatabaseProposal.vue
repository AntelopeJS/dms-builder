<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import {
	answerItem,
	forgetMappingDraft,
	includeResource,
	mergedDraft,
	type MappingDraft,
	settledInput,
	storedMappingDraft,
	storeMappingDraft,
	unanswered,
} from '../runtime/database'
import type {
	AnalysisState,
	MappingProposal,
	MapResourcesResult,
	OpenItem,
	ProposedKind,
} from '../runtime/database-types'

/**
 * A connection's mapping, decided in the builder: the analysis runs, its
 * proposal comes back with every choice marked as a catalog fact or a default
 * and the questions it could not decide on top, the integrator settles it, and
 * Apply sends one `MapResources`. Nothing is written before Apply.
 */

const props = defineProps<{ connection: string; module: string }>()

const POLL_MS = 1000
const KIND_COLORS: Record<ProposedKind, 'neutral' | 'warning'> = { fact: 'neutral', default: 'warning' }

const api = useBuilderApi()
const state = ref<AnalysisState | null>(null)
const draft = ref<MappingDraft | null>(null)
const selected = ref<string | null>(null)
const problem = ref('')
const applying = ref(false)
const applied = ref<MapResourcesResult | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

const proposal = computed<MappingProposal | undefined>(() => state.value?.proposal)
const open = computed(() => (proposal.value && draft.value ? unanswered(proposal.value, draft.value) : []))
const tableViews = computed(() => draft.value?.resources.filter((entry) => entry.include && entry.tableView) ?? [])
const statsOnly = computed(() => draft.value?.resources.filter((entry) => entry.include && !entry.tableView) ?? [])
const left = computed(() => draft.value?.resources.filter((entry) => !entry.include) ?? [])
const currentIndex = computed(
	() => draft.value?.resources.findIndex((entry) => entry.relation === selected.value) ?? -1,
)
const current = computed(() => draft.value?.resources[currentIndex.value])
const currentProposed = computed(() =>
	proposal.value?.resources.find((entry) => entry.relation === selected.value) ??
	proposal.value?.open.find((item) => item.resource?.relation === selected.value)?.resource,
)

function stopPolling(): void {
	if (timer) clearTimeout(timer)
	timer = undefined
}

async function poll(id: string): Promise<void> {
	const result = await api.analysis(id)
	if (!result.ok) {
		problem.value = JSON.stringify(result.error)
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

async function analyse(schemas?: string[]): Promise<void> {
	stopPolling()
	problem.value = ''
	applied.value = null
	const result = await api.analyseDatabase(props.connection, props.module, schemas)
	if (!result.ok) {
		problem.value = JSON.stringify(result.error)
		return
	}
	state.value = result.data
	await poll(result.data.id)
}

watch(draft, (value) => value && storeMappingDraft(value), { deep: true })
onBeforeUnmount(stopPolling)

function answer(item: OpenItem, value: unknown): void {
	if (!draft.value) return
	if (item.kind === 'schemas') {
		void analyse([String(value)])
		return
	}
	answerItem(draft.value, item, value)
}

function badge(kind: ProposedKind | undefined): 'neutral' | 'warning' {
	return KIND_COLORS[kind ?? 'fact']
}

function ruleOf(relation: string): { rule: string; kind: ProposedKind } | undefined {
	const proposed = proposal.value?.resources.find((entry) => entry.relation === relation)
	return proposed && { rule: proposed.tableView.rule, kind: proposed.tableView.kind }
}

async function apply(): Promise<void> {
	if (!proposal.value || !draft.value) return
	applying.value = true
	problem.value = ''
	const result = await api.mapDatabase(settledInput(proposal.value, draft.value))
	applying.value = false
	if (!result.ok) {
		problem.value = JSON.stringify(result.error)
		return
	}
	applied.value = result.data
	forgetMappingDraft(props.connection)
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

		<template v-else-if="proposal && draft">
			<section v-if="open.length" class="flex flex-col gap-2">
				<p class="text-sm font-semibold text-highlighted">To decide ({{ open.length }})</p>
				<div
					v-for="item in open"
					:key="item.id"
					class="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
				>
					<span class="min-w-0 flex-1 text-toned">{{ item.question }}</span>
					<USelect
						:items="item.options.map((option) => ({ label: option.title, value: JSON.stringify(option.value) }))"
						placeholder="Answer"
						size="xs"
						class="w-64"
						@update:model-value="answer(item, JSON.parse($event as string))"
					/>
				</div>
			</section>

			<div class="grid min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-4">
				<aside class="flex flex-col gap-3" aria-label="Relations">
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
								:class="selected === entry.relation ? 'bg-primary/10 text-primary' : ''"
								@click="selected = entry.relation"
							>
								{{ entry.relation }}
							</UButton>
							<UTooltip v-if="ruleOf(entry.relation)" :text="`Rule ${ruleOf(entry.relation)!.rule}`">
								<UBadge :color="badge(ruleOf(entry.relation)!.kind)" variant="subtle" size="sm">
									{{ ruleOf(entry.relation)!.kind }}
								</UBadge>
							</UTooltip>
						</div>
					</template>
					<template v-if="proposal.excluded.length">
						<DmsEyebrow>Excluded by the analysis ({{ proposal.excluded.length }})</DmsEyebrow>
						<p v-for="entry in proposal.excluded" :key="entry.relation" class="text-[11px] text-muted">
							<span class="font-mono">{{ entry.relation }}</span>: {{ entry.reason }} ({{ entry.rule }})
						</p>
					</template>
				</aside>

				<section class="min-w-0">
					<DmsBuilderDatabaseRelation
						v-if="current"
						v-model:resource="draft.resources[currentIndex]"
						:connection="connection"
						:proposed="currentProposed"
					/>
					<p v-else class="text-xs text-muted">Pick a relation to see its columns, or apply the proposal as it stands.</p>
				</section>
			</div>

			<footer class="flex items-center gap-3 border-t border-default pt-3">
				<UButton label="Apply" :loading="applying" @click="apply" />
				<span class="text-xs text-muted">
					Maps {{ tableViews.length }} TableViews and {{ statsOnly.length }} stats-only relations in one change.
					<template v-if="open.length">{{ open.length }} questions stay open and come back next time.</template>
				</span>
			</footer>
		</template>
	</div>
</template>

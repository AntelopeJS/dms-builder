<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { ASSISTANT_ACTIONS_KEY, type AssistantActions, assistantDashboardMessage } from '../runtime/database-build'
import { refusalText } from '../runtime/database-connect'
import { relabelledBy } from '../runtime/database-remap'
import {
	answerItem,
	draftFromMapped,
	draftFromProposal,
	forgetMappingDraft,
	includeResource,
	type KeptDraft,
	keptDraft,
	keptMappedDrafts,
	mappedTableViewsOf,
	mergedDraft,
	type MappingDraft,
	pointingAt,
	progressText,
	remapInput,
	type ResourceDraft,
	settledInput,
	storedMappedDrafts,
	storedMappingDraft,
	storeMappedDrafts,
	storeMappingDraft,
	unanswered,
	unsavedRelations,
} from '../runtime/database'
import { ruleSentence } from '../runtime/database-rules'
import { questionText } from '../runtime/database-server-text'
import { t } from '../runtime/i18n'
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
 * A connection's mapping, decided in the builder: the analysis proposes it, each choice marked
 * a catalog fact or a default, with its open questions at the relation they are about. The
 * integrator settles it and Apply sends one `MapResources`. Relations the module maps already
 * are listed, and one changed there is mapped again on its own. Nothing is written before.
 */

/** `job`: an analysis already run, whose state is read instead of analysing again. */
const props = defineProps<{ connection: string; module: string; job?: string }>()
const emit = defineEmits<{ unsaved: [count: number] }>()

const POLL_MS = 1000

type Selection = { kind: 'proposed' | 'mapped'; relation: string }

const api = useBuilderApi()
const assistant = inject<AssistantActions | null>(ASSISTANT_ACTIONS_KEY, null)
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
/** The assistant took over after the mapping was applied. */
const handedOff = ref(false)
const remapped = ref<{ titles: string[]; page?: string; relabelled: string[]; warnings: string[] } | null>(null)
const appliedWarnings = ref<string[]>([])
const remapProblem = ref('')
const mappedWarnings = ref<string[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false

const proposal = computed<MappingProposal | undefined>(() => state.value?.proposal)
const open = computed(() => (proposal.value && draft.value ? unanswered(proposal.value, draft.value) : []))
const schemasItem = computed(() => open.value.find((item) => item.kind === 'schemas'))
const tableViews = computed(() => draft.value?.resources.filter((entry) => entry.include && entry.tableView) ?? [])
const statsOnly = computed(() => draft.value?.resources.filter((entry) => entry.include && !entry.tableView) ?? [])
const left = computed(() => draft.value?.resources.filter((entry) => !entry.include) ?? [])
const groups = computed(() => [
	{ key: 'pages', title: t('database.proposal.group_pages', { count: tableViews.value.length }), entries: tableViews.value },
	{ key: 'stats', title: t('database.proposal.group_stats', { count: statsOnly.value.length }), entries: statsOnly.value },
	{ key: 'left', title: t('database.proposal.group_left', { count: left.value.length }), entries: left.value },
])
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

/** The unsaved drafts, from the browser and the panel, without those `sent` holds as they were sent. */
function unsavedDrafts(): Record<string, KeptDraft> {
	return Object.fromEntries(
		unsaved.value.map((relation) => [relation, keptDraft(mappedDrafts.value[relation]!, mappedRead.value[relation])]),
	)
}

function draftsToKeep(sent: Record<string, string>): Record<string, KeptDraft> {
	const kept: Record<string, KeptDraft> = {
		...storedMappedDrafts(props.connection, props.module),
		...unsavedDrafts(),
	}
	return Object.fromEntries(
		Object.entries(kept).filter(([relation, change]) => sent[relation] !== JSON.stringify(change.draft)),
	)
}

/** Drops a mapped relation's change not applied yet, back to what was read. */
function discard(relation: string): void {
	const read = mappedRead.value[relation]
	if (read) {
		mappedDrafts.value[relation] = JSON.parse(JSON.stringify(read)) as ResourceDraft
	}
}

/**
 * Reads the module's mapped relations again. The changes not applied yet are kept: those of other
 * relations, and those made to a relation while what `sent` holds for it was being written.
 */
async function loadMapped(sent: Record<string, string> = {}): Promise<void> {
	const result = await api.mapping(props.connection, props.module)
	if (disposed) return
	if (!result.ok) {
		problem.value = refusalText(result.error)
		return
	}
	const kept = draftsToKeep(sent)
	mapped.value = result.data
	mappedWarnings.value = (result.warnings ?? []).map((warning) => warning.message)
	mappedRead.value = Object.fromEntries(
		result.data.map((entry) => [entry.resource.relation, draftFromMapped(entry)]),
	)
	const editedWhileSent = Object.fromEntries(
		Object.entries(kept)
			.filter(([relation]) => relation in sent && relation in mappedRead.value)
			.map(([relation, change]) => [relation, keptDraft(change.draft, mappedRead.value[relation])]),
	)
	mappedDrafts.value = keptMappedDrafts(mappedRead.value, { ...kept, ...editedWhileSent })
}

async function poll(id: string): Promise<void> {
	const result = await api.analysis(id)
	if (disposed) return
	if (!result.ok) {
		failed(refusalText(result.error))
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
		failed(refusalText(result.error))
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
	mappedDrafts,
	() => {
		if (!Object.keys(mappedRead.value).length) return
		storeMappedDrafts(props.connection, props.module, unsavedDrafts())
	},
	{ deep: true },
)
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
	if (props.job) void poll(props.job)
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

/** A page's address in the DMS, from its ref, which starts with a slash or not. */
function pageHref(page: string): string {
	return page.startsWith('/') ? page : `/${page}`
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
		problem.value = refusalText(result.error)
		return
	}
	applied.value = result.data
	appliedWarnings.value = (result.warnings ?? []).map((warning) => warning.message)
	forgetMappingDraft(props.connection, props.module)
	if (props.job && !result.warnings?.some((warning) => warning.code === 'module_not_loaded')) {
		handOff()
	}
	await loadMapped()
}

/** Starts the assistant on the dashboard, once. */
function handOff(): void {
	if (handedOff.value || !assistant?.isAvailable) return
	handedOff.value = true
	assistant.startConversation(assistantDashboardMessage(props.connection, props.module), { mode: 'plan', send: true })
}

async function remap(): Promise<void> {
	const relations = unsaved.value
	if (!relations.length) return
	busy.value = true
	remapped.value = null
	remapProblem.value = ''
	const resources = relations.map(
		(relation) => JSON.parse(JSON.stringify(mappedDrafts.value[relation])) as ResourceDraft,
	)
	const sent = Object.fromEntries(resources.map((resource) => [resource.relation, JSON.stringify(resource)]))
	const result = await api.mapDatabase(
		remapInput(props.connection, props.module, resources, mappedTableViews.value),
	)
	busy.value = false
	if (!result.ok) {
		remapProblem.value = refusalText(result.error)
		return
	}
	remapped.value = {
		titles: resources.map((resource) => resource.title),
		page: relations.length === 1 ? result.data.resources[0]?.page : undefined,
		relabelled: relabelledBy(relations, mappedDrafts.value, mappedRead.value, mapped.value),
		warnings: (result.warnings ?? []).map((warning) => warning.message),
	}
	await loadMapped(sent)
}
</script>

<template>
	<div class="flex flex-col gap-4 p-6">
		<header class="flex items-center gap-3">
			<div class="min-w-0 flex-1">
				<p class="text-xl font-semibold tracking-tight text-highlighted">{{ connection }}</p>
				<p class="font-mono text-xs text-muted">
					<template v-if="proposal">{{ proposal.database.engine }} · {{ proposal.database.role }} · </template>
					{{ t('database.proposal.saved_in', { module }) }}
				</p>
			</div>
			<UButton
				v-if="proposal && draft && !applied"
				:label="t('database.proposal.start_over')"
				color="neutral"
				variant="ghost"
				size="sm"
				@click="discardDraft"
			/>
			<UButton
				icon="i-ph-magnifying-glass-light"
				:label="proposal ? t('database.proposal.analyse_again') : t('database.proposal.analyse')"
				:loading="state?.status === 'running'"
				@click="analyse()"
			/>
		</header>

		<p v-if="problem" class="text-xs text-error">{{ problem }}</p>
		<p v-for="warning in mappedWarnings" :key="warning" class="text-xs text-warning">{{ warning }}</p>

		<div v-if="state?.status === 'running'" class="text-xs text-muted" aria-live="polite">
			{{ progressText(state.progress) }}
		</div>
		<p v-else-if="state?.status === 'failed'" class="text-xs text-error">
			{{ t('database.proposal.failed', { error: state.error }) }}
		</p>

		<DmsBuilderDatabaseApplied
			v-if="applied"
			:tables="applied.resources.length"
			:connection="connection"
			:module="module"
			:warnings="appliedWarnings"
			:handed-off="handedOff"
			:can-hand-off="!!job && !!assistant?.isAvailable"
			@hand-off="handOff"
		/>

		<section
			v-if="proposal && draft && !applied && schemasItem"
			class="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
		>
			<span class="min-w-0 flex-1 text-toned">{{ questionText(schemasItem) }}</span>
			<USelect
				v-model="schemas"
				multiple
				:items="schemasItem.options.map((option) => ({ label: option.title, value: String(option.value) }))"
				:placeholder="t('database.proposal.schemas_placeholder')"
				size="xs"
				class="w-64"
			/>
			<UButton :label="t('database.proposal.analyse_these')" size="xs" :disabled="!schemas.length" @click="analyse(schemas)" />
		</section>

		<div v-if="(proposal && draft && !applied) || mapped.length" class="grid min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-4">
			<aside class="flex flex-col gap-3" :aria-label="t('database.proposal.tables_label')">
				<template v-if="proposal && draft && !applied">
					<template v-for="group in groups" :key="group.key">
						<DmsEyebrow v-if="group.entries.length">{{ group.title }}</DmsEyebrow>
						<div v-for="entry in group.entries" :key="entry.relation" class="flex items-center gap-2">
							<UCheckbox
								:model-value="entry.include"
								:aria-label="t('database.proposal.add_aria', { relation: entry.relation })"
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
								{{ t('database.proposal.to_decide', { count: openFor(entry.relation).length }) }}
							</UBadge>
							<UTooltip
								v-if="proposedRule(entry.relation)?.kind === 'default'"
								:text="ruleSentence(proposedRule(entry.relation)!.rule)"
							>
								<UBadge color="warning" variant="subtle" size="sm">
									{{ t('database.proposal.suggested') }}
								</UBadge>
							</UTooltip>
						</div>
					</template>
					<template v-if="proposal.excluded.length">
						<DmsEyebrow>{{ t('database.proposal.skipped', { count: proposal.excluded.length }) }}</DmsEyebrow>
						<p v-for="entry in proposal.excluded" :key="entry.relation" class="text-[11px] text-muted">
							<span class="font-mono">{{ entry.relation }}</span>{{ t('database.proposal.colon') }} {{
								t('database.proposal.skipped_entry', { reason: entry.reason, rule: ruleSentence(entry.rule) })
							}}
						</p>
					</template>
				</template>
				<template v-if="mapped.length">
					<DmsEyebrow>{{ t('database.proposal.already_added', { count: mapped.length }) }}</DmsEyebrow>
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
							{{ t('database.proposal.unsaved') }}
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
							:label="
								busy
									? t('database.proposal.applying')
									: unsaved.length > 1
										? t('database.proposal.apply_changes_many', { count: unsaved.length })
										: t('database.proposal.apply_changes')
							"
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
							{{ t('database.proposal.saved', { titles: remapped.titles.join(', ') }) }}
							<template v-if="remapped.relabelled.length">
								{{ t('database.proposal.relabelled', { relations: remapped.relabelled.join(', ') }) }}
							</template>
							<template v-for="warning in remapped.warnings" :key="warning">{{ warning }}. </template>
							<a v-if="remapped.page" :href="pageHref(remapped.page)" class="text-primary underline">{{ t('database.proposal.open_page') }}</a>
						</span>
						<span v-else-if="unsaved.length" class="text-xs text-warning">
							{{ t('database.proposal.not_saved', { titles: unsaved.map((relation) => mappedDrafts[relation]?.title).join(', ') }) }}
						</span>
						<span v-else class="text-xs text-muted">{{ t('database.proposal.no_changes') }}</span>
						<UButton
							v-if="selected && unsaved.includes(selected.relation) && !busy"
							:label="t('database.proposal.discard')"
							size="xs"
							color="neutral"
							variant="ghost"
							@click="discard(selected.relation)"
						/>
					</div>
				</template>
				<p v-else class="text-xs text-muted">{{ t('database.proposal.pick_table') }}</p>
			</section>
		</div>

		<footer v-if="proposal && draft && !applied && summary" class="flex flex-col gap-3 border-t border-default pt-3">
			<DmsBuilderDatabaseApplySummary
				v-if="confirming"
				:summary="summary"
				:open="open"
				:draft="draft"
				:mapped-table-views="mappedTableViews"
				:connection="connection"
			/>
			<div class="flex items-center gap-3">
				<template v-if="confirming">
					<UButton :label="t('database.proposal.confirm')" :loading="busy" @click="apply" />
					<UButton :label="t('database.proposal.back')" color="neutral" variant="ghost" @click="confirming = false" />
				</template>
				<UButton v-else :label="t('database.proposal.apply')" @click="confirming = true" />
				<span class="text-xs text-muted">
					{{ t('database.proposal.adds', { pages: tableViews.length, stats: statsOnly.length }) }}
				</span>
			</div>
		</footer>
	</div>
</template>

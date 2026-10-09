<script setup lang="ts">
import { computed } from 'vue'
import type { ChangeGroup, ChangeKind, DraftChange } from '../runtime/changes'
import { ROLES_PAGE_PATH } from '../runtime/constants'
import { findNode } from '../runtime/draft'
import { blockTitle } from '../runtime/naming'
import { clockTime } from '../runtime/save-status'
import { useBuilder } from '../runtime/session'

/**
 * Every pending edit in plain words, grouped by what it reaches, each one
 * revertible on its own; then who would stop seeing what once it is saved;
 * then what Save will do, step by step; then what was already written straight
 * to the project and is not part of the draft.
 */

const GROUPS: { id: ChangeGroup; label: string }[] = [
	{ id: 'page', label: 'This page' },
	{ id: 'menu', label: 'Menu' },
	{ id: 'data', label: 'Data sources' },
]

const KIND_ICONS: Record<ChangeKind, string> = {
	added: 'i-ph-plus-light',
	removed: 'i-ph-minus-light',
	edited: 'i-ph-pencil-simple-light',
	moved: 'i-ph-arrows-down-up-light',
}

const KIND_TONES: Record<ChangeKind, string> = {
	added: 'bg-success/10 text-success',
	removed: 'bg-error/10 text-error',
	edited: 'bg-primary/10 text-primary',
	moved: 'bg-info/10 text-info',
}

const builder = useBuilder()
const session = builder.session

const groups = computed(() =>
	GROUPS.map((group) => ({
		...group,
		entries: builder.unsaved.value.filter((change) => change.group === group.id),
	})).filter((group) => group.entries.length > 0),
)

/** The blocks Save would stop at, by name. */
const toFix = computed(() => {
	const draft = session.value.draft
	return builder.problems.value.map((path) => {
		const block = draft ? findNode(draft, path) : undefined
		return {
			path,
			title: block ? blockTitle(block, session.value.catalog) : path,
		}
	})
})

const applied = computed(() => [...session.value.applied].reverse())

/**
 * The roles settings, beside the editor rather than instead of it: the draft
 * stays open, and who sees what is read again on the way back.
 */
function openRoles(): void {
	window.open(ROLES_PAGE_PATH, '_blank', 'noopener')
}

function go(change: DraftChange): void {
	if (change.path) {
		builder.select(change.path)
	}
}

type StepState = 'done' | 'running' | 'fix' | 'waiting'

const STEP_ICONS: Record<StepState, string> = {
	done: 'i-ph-check-circle-light',
	running: 'i-ph-circle-notch',
	fix: 'i-ph-warning-circle-light',
	waiting: 'i-ph-circle-dashed-light',
}

const STEP_TONES: Record<StepState, string> = {
	done: 'text-success',
	running: 'animate-spin text-primary',
	fix: 'text-warning',
	waiting: 'text-dimmed',
}

/** What Save does, in order, and how far it got. */
const steps = computed<{ label: string; state: StepState }[]>(() => {
	const saving = session.value.saving
	return [
		{
			label: 'Every block has its required settings',
			state: toFix.value.length ? 'fix' : 'done',
		},
		{
			label: 'Check the page compiles',
			state: saving ? 'running' : 'waiting',
		},
		{
			label: 'Write the files, then reload the page',
			state: 'waiting',
		},
	]
})
</script>

<template>
	<div class="flex flex-col gap-5">
		<p v-if="!builder.dirty.value" class="text-sm text-muted">
			Everything on this page is saved.
			<template v-if="session.lastSave?.outcome === 'saved'">
				Last saved at {{ clockTime(session.lastSave.at) }}.
			</template>
		</p>
		<p v-else-if="session.dirtySince" class="text-xs text-muted">
			Kept in this editor since {{ clockTime(session.dirtySince) }}. Nothing is
			written until you save.
		</p>

		<section v-for="group in groups" :key="group.id" class="flex flex-col gap-1">
			<DmsEyebrow>{{ `${group.label} · ${group.entries.length}` }}</DmsEyebrow>
			<ul class="flex flex-col">
				<li
					v-for="change in group.entries"
					:key="change.id"
					class="group flex items-start gap-2.5 border-b border-(--ui-border-muted) py-2.5 last:border-b-0"
				>
					<span
						class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md"
						:class="KIND_TONES[change.kind]"
					>
						<UIcon :name="KIND_ICONS[change.kind]" class="size-3.5" />
					</span>
					<button
						type="button"
						class="min-w-0 flex-1 text-left"
						:class="change.path ? 'cursor-pointer' : 'cursor-default'"
						:title="change.path ? 'Go to the block' : undefined"
						@click="go(change)"
					>
						<span class="block truncate text-[13px] font-semibold text-highlighted">
							{{ change.title }}
						</span>
						<span
							v-if="change.before !== undefined"
							class="flex min-w-0 items-center gap-1.5 font-mono text-[11px]"
						>
							<span class="truncate text-error line-through">{{ change.before }}</span>
							<UIcon name="i-ph-arrow-right-light" class="size-3 shrink-0 text-dimmed" />
							<span class="truncate text-success">{{ change.after }}</span>
						</span>
						<span v-else-if="change.detail" class="block truncate text-xs text-muted">
							{{ change.detail }}
						</span>
					</button>
					<UButton
						icon="i-ph-arrow-counter-clockwise-light"
						size="xs"
						color="neutral"
						variant="ghost"
						:aria-label="`Revert: ${change.title}`"
						title="Put this one back"
						@click="builder.revert(change)"
					/>
				</li>
			</ul>
		</section>

		<!-- Saving does not ask the roles: what they would stop seeing is said
		here, before it, with the way to give it back. -->
		<section v-if="builder.accessWarnings.value.length" class="flex flex-col gap-1">
			<DmsEyebrow>{{ `Who sees it · ${builder.accessWarnings.value.length}` }}</DmsEyebrow>
			<ul class="flex flex-col">
				<li
					v-for="warning in builder.accessWarnings.value"
					:key="warning.id"
					class="flex items-start gap-2.5 border-b border-(--ui-border-muted) py-2.5 last:border-b-0"
					:data-access-warning="warning.id"
				>
					<span
						class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-warning/10 text-warning"
					>
						<UIcon name="i-ph-lock-simple-light" class="size-3.5" />
					</span>
					<button
						type="button"
						class="min-w-0 flex-1 text-left"
						:class="warning.path ? 'cursor-pointer' : 'cursor-default'"
						:title="warning.path ? 'Go to the block' : undefined"
						@click="warning.path && builder.select(warning.path)"
					>
						<span class="block text-[13px] font-semibold text-highlighted">
							{{ warning.title }}
						</span>
						<span class="block text-xs text-muted">{{ warning.detail }}</span>
					</button>
				</li>
			</ul>
			<UButton
				icon="i-ph-arrow-square-out-light"
				label="Open Roles"
				size="xs"
				color="neutral"
				variant="outline"
				class="self-start"
				@click="openRoles"
			/>
		</section>

		<section v-if="builder.dirty.value" class="flex flex-col gap-2">
			<DmsEyebrow>On save</DmsEyebrow>
			<ul class="flex flex-col gap-1.5">
				<li
					v-for="step in steps"
					:key="step.label"
					class="flex items-center gap-2 text-[12.5px]"
					:class="step.state === 'waiting' ? 'text-muted' : 'text-toned'"
				>
					<UIcon
						:name="STEP_ICONS[step.state]"
						class="size-4 shrink-0"
						:class="STEP_TONES[step.state]"
					/>
					{{ step.label }}
				</li>
			</ul>
			<ul v-if="toFix.length" class="flex flex-col gap-1 pl-6">
				<li
					v-for="entry in toFix"
					:key="entry.path"
					class="flex items-center gap-2 text-xs text-warning"
				>
					<span class="min-w-0 flex-1 truncate">{{ entry.title }} needs a setting</span>
					<UButton
						label="Go to block"
						size="xs"
						color="neutral"
						variant="outline"
						@click="builder.select(entry.path)"
					/>
				</li>
			</ul>
		</section>

		<section v-if="applied.length" class="flex flex-col gap-1">
			<DmsEyebrow>{{ `Already written · ${applied.length}` }}</DmsEyebrow>
			<p class="text-xs text-muted">
				Written to the project when they were made, for every page. Saving and
				discarding leave them as they are.
			</p>
			<ul class="flex flex-col">
				<li
					v-for="entry in applied"
					:key="entry.id"
					class="flex items-center gap-2 border-b border-(--ui-border-muted) py-2 text-[12.5px] text-toned last:border-b-0"
				>
					<UIcon name="i-ph-lightning-light" class="size-3.5 shrink-0 text-dimmed" />
					<span class="min-w-0 flex-1 truncate">{{ entry.title }}</span>
					<span
						v-if="entry.scope"
						class="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-1.5 font-mono text-[10px] text-warning"
					>
						{{ entry.scope }}
					</span>
					<span class="shrink-0 font-mono text-[10.5px] text-dimmed">
						{{ clockTime(entry.at) }}
					</span>
				</li>
			</ul>
		</section>
	</div>
</template>

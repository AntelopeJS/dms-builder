<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDmsRouter } from '#dms/frontend-module'
import { opensPage } from '../runtime/access'
import { CHROME_CLASS } from '../runtime/constants'
import { describeError, errorDetail } from '../runtime/errors'
import { clockTime } from '../runtime/save-status'
import { useBuilder } from '../runtime/session'
import { useThemeEditor } from '../runtime/theme'

/**
 * What the editor has to say over the page, one strip each, stacked: none of
 * them hides another. A save that failed while the page also changed on disk
 * is two things to know, and each has its own way forward.
 */

const builder = useBuilder()
const session = builder.session
const theme = useThemeEditor()
const router = useDmsRouter()

const title = computed(
	() =>
		(session.value.draft?.page?.displayName as string | undefined) ??
		session.value.structure?.page.displayName ??
		session.value.pageRef ??
		'This page',
)

const message = computed(() =>
	session.value.error
		? describeError(session.value.error, session.value.draft)
		: '',
)
/** The module's own wording, folded away until someone asks for it. */
const detail = computed(() =>
	session.value.error ? errorDetail(session.value.error) : [],
)
const detailOpen = ref(false)
watch(
	() => session.value.error,
	() => {
		detailOpen.value = false
	},
)

/* ---- leaving with changes nobody saved -------------------------------- */

/**
 * Often opened from outside the frame (⌘B, the DMS header button), where
 * adoptOverlays does not catch it: the class keeps the teleported dialog on
 * the DMS look.
 */
const LEAVE_UI = { content: CHROME_CLASS, overlay: CHROME_CLASS }

/** Whose changes leaving would drop: the page's, the theme's, or both. */
const unsavedSentence = computed(() => {
	if (builder.pageDirty.value && theme.dirty.value) {
		return `${title.value} and the theme have changes nobody has saved.`
	}
	return `${theme.dirty.value ? 'The theme' : title.value} has changes nobody has saved.`
})

/** The theme belongs to the whole project, so it comes back on any page; a page draft only with its page. */
const keptSentence = computed(() => {
	const pageDirty = builder.pageDirty.value
	const returnClause =
		pageDirty && theme.dirty.value
			? "the page's come back next time you edit this page and the theme's next time you open the editor"
			: pageDirty
				? 'they are offered again next time you edit this page'
				: 'they come back next time you open the editor, on any page'
	return `Kept on this device, ${returnClause}, for seven days. Nothing is written until they are saved.`
})

const restoredThemeSentence = computed(() => {
	const restoredDraft = theme.state.value.restoredDraft
	if (!restoredDraft) {
		return ''
	}
	const since = `kept on this device since ${clockTime(restoredDraft.at)}`
	return restoredDraft.stale ? `${since}, on top of the theme's files, which changed since.` : `${since}.`
})

/** A save that failed can be tried again from where it is said. */
const retry = computed(
	() =>
		session.value.lastSave?.outcome === 'failed' &&
		!session.value.conflict &&
		builder.dirty.value,
)

/** Back to the page being edited: the router had already moved on. */
async function stay(): Promise<void> {
	const page = builder.stayOnPage()
	if (page) {
		await router.push(page)
	}
}

/** The draft as JSON, to keep somewhere before reloading drops it. */
async function copyDraft(): Promise<void> {
	await navigator.clipboard?.writeText(JSON.stringify(session.value.draft ?? {}, null, 2))
	builder.notify('Copied the draft as JSON')
}

/**
 * The DMS's own strip, the one its role preview pins under the header: a
 * tinted band holding a sentence, its icon inside it so a narrow screen wraps
 * the words rather than the icon away from them, and its actions after it.
 */
const STRIP =
	'flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b py-1.5 ps-4 pe-3 text-[12.5px] text-toned'
const ACCENT = `${STRIP} border-(--dms-accent-line) bg-(--dms-accent-tint)`
const WARNING = `${STRIP} border-(--dms-warning-line) bg-(--dms-warning-tint)`
const ERROR = `${STRIP} border-(--dms-error-line) bg-(--dms-error-tint)`
const INFO = `${STRIP} border-(--dms-info-line) bg-(--dms-info-tint)`
const SENTENCE = 'flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1'
const ACTIONS = 'ms-auto flex shrink-0 flex-wrap items-center gap-1.5'

/* ---- looking at the page as a role ------------------------------------- */

const viewed = builder.viewedAs
const roleItems = computed(() =>
	(session.value.access?.roles ?? []).map((role) => ({
		label: role.name,
		value: role.id,
		icon: 'i-ph-user-circle-light',
	})),
)
/** The role does not open the page at all, under the permission the draft gives it. */
const pageHidden = computed(() => {
	const access = session.value.access
	const role = viewed.value
	const page = builder.pagePermission.value
	return !!access && !!role && !!page && !opensPage(access, role, page)
})
/** What it is not shown, counted the way the canvas veils it. */
const veiled = computed(() => {
	const states = Object.values(builder.veils.value).map((veil) => veil.state)
	const hidden = states.filter((state) => state === 'hidden').length
	const limited = states.length - hidden
	return [
		hidden ? `${hidden} block${hidden === 1 ? '' : 's'} hidden` : '',
		limited ? `${limited} with fewer actions` : '',
	]
		.filter(Boolean)
		.join(' · ')
})
</script>

<template>
	<div class="grid shrink-0" data-builder-chrome>
		<!-- Leaving is asked before it happens rather than reported after: the
		draft can be saved, kept on this device for next time, or dropped. When
		the browser could not store it, the dialog says so and no longer offers
		to keep it. -->
		<UModal
			:open="session.pendingClose"
			title="Save before leaving?"
			:description="unsavedSentence"
			:ui="LEAVE_UI"
			@update:open="(open: boolean) => !open && builder.stayOpen()"
		>
			<template #body>
				<p v-if="session.unstoredDraftLabels.length" class="text-sm text-error" role="alert">
					The changes to {{ session.unstoredDraftLabels.join(' and ') }} could not be kept on this
					device: the browser's storage is full or switched off. Save them, or leave
					without saving.
				</p>
				<p v-else class="text-sm text-toned">{{ keptSentence }}</p>
			</template>
			<template #footer>
				<div class="flex w-full flex-wrap justify-end gap-2">
					<UButton
						label="Stay"
						color="neutral"
						variant="ghost"
						@click="builder.stayOpen()"
					/>
					<UButton
						label="Leave without saving"
						color="error"
						variant="ghost"
						@click="builder.resolveClose(false)"
					/>
					<UButton
						v-if="!session.unstoredDraftLabels.length"
						label="Leave, keep the draft"
						color="neutral"
						variant="outline"
						@click="builder.resolveClose(false, true)"
					/>
					<UButton
						label="Save and leave"
						:loading="session.saving"
						@click="builder.resolveClose(true)"
					/>
				</div>
			</template>
		</UModal>

		<!-- The page as a role sees it, unsaved changes included: the DMS's own
		role preview, but on the draft rather than on the page as saved. -->
		<div
			v-if="viewed && session.workspace === 'page'"
			:class="ACCENT"
			role="region"
			aria-label="Role preview"
		>
			<span :class="SENTENCE">
				<UIcon name="i-ph-eye" class="me-1 size-4 shrink-0 text-primary" />
				<span>Viewing</span>
				<b class="font-semibold text-highlighted">{{ title }}</b>
				<span>as</span>
				<USelectMenu
					:model-value="viewed.id"
					:items="roleItems"
					value-key="value"
					size="xs"
					variant="ghost"
					class="-mx-1 max-w-52 font-semibold text-highlighted"
					aria-label="Role to view the page as"
					@update:model-value="builder.setViewAs(String($event))"
				/>
				<span v-if="builder.dirty.value">· unsaved changes included</span>
			</span>
			<span :class="ACTIONS">
				<UBadge
					v-if="pageHidden"
					color="error"
					variant="soft"
					size="sm"
					icon="i-ph-lock-simple"
					:label="`Page hidden for ${viewed.name}`"
				/>
				<UBadge
					v-else-if="veiled"
					color="warning"
					variant="soft"
					size="sm"
					icon="i-ph-lock-simple"
					:label="veiled"
				/>
				<UButton
					icon="i-ph-x"
					size="xs"
					color="neutral"
					variant="outline"
					label="Exit preview"
					@click="builder.setViewAs(null)"
				/>
			</span>
		</div>

		<!-- A draft kept from an earlier visit: put back, or offered when the
		page has moved on since it was made. -->
		<div v-if="session.restored" :class="session.restored.stale ? WARNING : INFO">
			<span :class="SENTENCE">
				<UIcon
					:name="
						session.restored.stale
							? 'i-ph-clock-counter-clockwise-light'
							: 'i-ph-arrow-u-up-left-light'
					"
					class="me-1 size-4 shrink-0"
					:class="session.restored.stale ? 'text-warning' : 'text-info'"
				/>
				<span v-if="session.restored.stale" class="min-w-0 flex-1">
					Unsaved changes from {{ clockTime(session.restored.at) }} were made on an
					older version of this page; putting them back undoes what changed since.
				</span>
				<span v-else class="min-w-0 flex-1">
					<b class="font-semibold text-highlighted">Your unsaved changes are back</b>,
					kept on this device since {{ clockTime(session.restored.at) }}.
				</span>
			</span>
			<span :class="ACTIONS">
				<UButton
					v-if="session.restored.stale"
					size="xs"
					color="warning"
					variant="soft"
					label="Put them back"
					@click="builder.restoreAnyway()"
				/>
				<UButton
					v-else
					size="xs"
					color="neutral"
					variant="outline"
					label="Review"
					@click="builder.setView('changes')"
				/>
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					label="Discard"
					@click="builder.dropRestored()"
				/>
				<UButton
					v-if="!session.restored.stale"
					icon="i-ph-x-light"
					size="xs"
					color="neutral"
					variant="ghost"
					aria-label="Dismiss"
					@click="session.restored = null"
				/>
			</span>
		</div>

		<!-- A theme kept from an earlier visit is restored on any page, over the
		current theme files; unlike an outdated page draft, it is not just
		offered. -->
		<div v-if="theme.state.value.restoredDraft" :class="INFO">
			<span :class="SENTENCE">
				<UIcon name="i-ph-palette-light" class="me-1 size-4 shrink-0 text-info" />
				<span class="min-w-0 flex-1">
					<b class="font-semibold text-highlighted">Your unsaved theme changes are back</b>,
					{{ restoredThemeSentence }}
				</span>
			</span>
			<span :class="ACTIONS">
				<UButton
					size="xs"
					color="neutral"
					variant="outline"
					label="Review"
					@click="builder.setWorkspace('theme')"
				/>
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					label="Discard"
					@click="builder.dropRestoredTheme()"
				/>
				<UButton
					icon="i-ph-x-light"
					size="xs"
					color="neutral"
					variant="ghost"
					aria-label="Dismiss"
					@click="theme.state.value.restoredDraft = null"
				/>
			</span>
		</div>

		<div v-if="session.pendingRoute" :class="WARNING" role="alert">
			<span :class="SENTENCE">
				<UIcon name="i-ph-warning-light" class="me-1 size-4 shrink-0 text-warning" />
				<span class="min-w-0 flex-1">
					<b class="font-semibold text-highlighted">{{ title }}</b> has unsaved
					changes. Save them before opening
					<span class="font-mono text-[11.5px]">{{ session.pendingRoute }}</span>, or
					stay on this page.
				</span>
			</span>
			<span :class="ACTIONS">
				<UButton
					size="xs"
					color="warning"
					variant="soft"
					label="Save and continue"
					:loading="session.saving"
					@click="builder.resolvePending(true)"
				/>
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					label="Discard"
					@click="builder.resolvePending(false)"
				/>
				<UButton
					size="xs"
					color="neutral"
					variant="outline"
					label="Stay"
					@click="stay"
				/>
			</span>
		</div>

		<div v-if="session.conflict" :class="WARNING" role="alert">
			<span :class="SENTENCE">
				<UIcon name="i-ph-git-diff-light" class="me-1 size-4 shrink-0 text-warning" />
				<span class="min-w-0 flex-1">
					This page changed outside the builder since it was opened. Keep your
					version to write it over those changes, or reload and drop yours.
				</span>
			</span>
			<span :class="ACTIONS">
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					icon="i-ph-copy-light"
					label="Copy my draft"
					@click="copyDraft"
				/>
				<UButton
					size="xs"
					color="warning"
					variant="soft"
					label="Keep my version"
					@click="builder.keepMine()"
				/>
				<UButton
					size="xs"
					color="neutral"
					variant="outline"
					label="Reload the page"
					@click="builder.reload()"
				/>
			</span>
		</div>

		<div v-if="session.error" :class="ERROR" role="alert">
			<UIcon
				name="i-ph-warning-circle-light"
				class="me-1 mt-[3px] size-4 shrink-0 self-start text-error"
			/>
			<div class="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
				<span>
					<!-- The page is saved before the theme, so a failed save may
					still have written the page. -->
					<template v-if="session.lastSave?.outcome === 'failed'">
						<b class="font-semibold text-highlighted">{{
							session.lastSave.pageSaved ? 'The page was saved.' : 'Nothing was written.'
						}}</b>
					</template>
					{{ message }}
				</span>
				<button
					v-if="detail.length"
					type="button"
					class="self-start text-xs underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100"
					@click="detailOpen = !detailOpen"
				>
					{{ detailOpen ? 'Hide the details' : 'Details' }}
				</button>
				<ul v-if="detailOpen" class="flex flex-col gap-0.5 font-mono text-xs opacity-80">
					<li v-for="line in detail" :key="line">{{ line }}</li>
				</ul>
			</div>
			<span :class="ACTIONS">
				<UButton
					v-if="retry"
					size="xs"
					color="error"
					variant="soft"
					label="Try again"
					:loading="session.saving"
					@click="builder.save()"
				/>
				<UButton
					icon="i-ph-x-light"
					size="xs"
					color="error"
					variant="ghost"
					aria-label="Dismiss"
					@click="session.error = null"
				/>
			</span>
		</div>

		<!-- A write that went through can still have had to settle for less —
		a column stored as a string, a query kept alive. It stays true whatever
		else is being said. -->
		<div v-if="session.warnings.length" :class="WARNING">
			<UIcon
				name="i-ph-warning-light"
				class="me-1 mt-[3px] size-4 shrink-0 self-start text-warning"
			/>
			<ul class="flex min-w-0 flex-1 flex-col gap-0.5">
				<li v-for="entry in session.warnings" :key="entry.message">
					{{ entry.message }}
				</li>
			</ul>
			<UButton
				icon="i-ph-x-light"
				size="xs"
				color="neutral"
				variant="ghost"
				aria-label="Dismiss the warnings"
				@click="session.warnings = []"
			/>
		</div>
	</div>
</template>

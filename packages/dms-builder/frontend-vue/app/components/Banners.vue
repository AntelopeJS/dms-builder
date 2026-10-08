<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { describeError, errorDetail } from '../runtime/errors'
import { clockTime } from '../runtime/save-status'
import { useBuilder } from '../runtime/session'

/**
 * What the editor has to say over the page, one strip each, stacked: none of
 * them hides another. A save that failed while the page also changed on disk
 * is two things to know, and each has its own way forward.
 */

const builder = useBuilder()
const session = builder.session
const router = useRouter()

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

const STRIP =
	'flex min-h-10.5 items-center gap-2.5 border-b px-3.5 py-1.5 text-[12.5px] text-toned'
const WARNING = `${STRIP} border-warning/40 bg-warning/10`
const ERROR = `${STRIP} border-error/40 bg-error/10`
const INFO = `${STRIP} border-info/40 bg-info/10`
</script>

<template>
	<div class="grid shrink-0">
		<!-- Leaving is asked before it happens rather than reported after: the
		draft can be saved, kept on this device for next time, or dropped. -->
		<UModal
			:open="session.pendingClose"
			title="Save before leaving?"
			:description="`${title} has changes nobody has saved.`"
			@update:open="(open: boolean) => !open && builder.stayOpen()"
		>
			<template #body>
				<p class="text-sm text-toned">
					Kept on this device, they are offered again next time you edit this
					page, for seven days. Nothing is written until they are saved.
				</p>
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

		<!-- A draft kept from an earlier visit: put back, or offered when the
		page has moved on since it was made. -->
		<div v-if="session.restored" :class="session.restored.stale ? WARNING : INFO">
			<UIcon
				:name="
					session.restored.stale
						? 'i-ph-clock-counter-clockwise-light'
						: 'i-ph-arrow-u-up-left-light'
				"
				class="size-4 shrink-0"
				:class="session.restored.stale ? 'text-warning' : 'text-info'"
			/>
			<span class="flex-1">
				<template v-if="session.restored.stale">
					Unsaved changes from {{ clockTime(session.restored.at) }} were made on an
					older version of this page; putting them back undoes what changed since.
				</template>
				<template v-else>
					<b class="font-semibold text-highlighted">Your unsaved changes are back</b>,
					kept on this device since {{ clockTime(session.restored.at) }}.
				</template>
			</span>
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
		</div>

		<div v-if="session.pendingRoute" :class="WARNING" role="alert">
			<UIcon name="i-ph-warning-light" class="size-4 shrink-0 text-warning" />
			<span class="flex-1">
				<b class="font-semibold text-highlighted">{{ title }}</b> has unsaved
				changes. Save them before opening
				<span class="font-mono text-[11.5px]">{{ session.pendingRoute }}</span>, or
				stay on this page.
			</span>
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
		</div>

		<div v-if="session.conflict" :class="WARNING" role="alert">
			<UIcon name="i-ph-git-diff-light" class="size-4 shrink-0 text-warning" />
			<span class="flex-1">
				This page changed outside the builder since it was opened. Keep your
				version to write it over those changes, or reload and drop yours.
			</span>
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
		</div>

		<div v-if="session.error" :class="ERROR" role="alert">
			<UIcon name="i-ph-warning-circle-light" class="size-4 shrink-0 text-error" />
			<div class="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
				<span>
					<template v-if="session.lastSave?.outcome === 'failed'">
						<b class="font-semibold text-highlighted">Nothing was written.</b>
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
		</div>

		<!-- A write that went through can still have had to settle for less —
		a column stored as a string, a query kept alive. It stays true whatever
		else is being said. -->
		<div v-if="session.warnings.length" :class="WARNING">
			<UIcon name="i-ph-warning-light" class="size-4 shrink-0 text-warning" />
			<ul class="flex flex-1 flex-col gap-0.5">
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

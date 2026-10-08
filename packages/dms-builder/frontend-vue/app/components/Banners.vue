<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { describeError, errorDetail } from '../runtime/errors'
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

const STRIP =
	'flex min-h-10.5 items-center gap-2.5 border-b px-3.5 py-1.5 text-[12.5px] text-toned'
const WARNING = `${STRIP} border-warning/40 bg-warning/10`
const ERROR = `${STRIP} border-error/40 bg-error/10`
</script>

<template>
	<div class="grid shrink-0">
		<!-- Leaving drops the draft, so it is asked before it happens rather than
		reported after. -->
		<div v-if="session.pendingClose" :class="WARNING" role="alert">
			<UIcon name="i-ph-warning-light" class="size-4 shrink-0 text-warning" />
			<span class="flex-1">
				<b class="font-semibold text-highlighted">{{ title }}</b> has changes nobody
				has saved. Leaving the editor drops them.
			</span>
			<UButton
				size="xs"
				color="warning"
				variant="soft"
				label="Save and leave"
				:loading="session.saving"
				@click="builder.resolveClose(true)"
			/>
			<UButton
				size="xs"
				color="neutral"
				variant="ghost"
				label="Leave without saving"
				@click="builder.resolveClose(false)"
			/>
			<UButton
				size="xs"
				color="neutral"
				variant="outline"
				label="Stay"
				@click="builder.stayOpen()"
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
				This page changed outside the builder since it was opened. Reloading it
				drops the changes you have not saved.
			</span>
			<UButton
				size="xs"
				color="warning"
				variant="soft"
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

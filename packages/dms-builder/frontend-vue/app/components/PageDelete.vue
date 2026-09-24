<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { openWhenServed } from '../runtime/dev-reload'
import { useBuilder } from '../runtime/session'
import type { PageSummary } from '../runtime/types'

/**
 * The question asked before a page is deleted, and the way off it once it is.
 *
 * Deleting removes the page and the routes it declares, and nothing in the
 * builder brings them back: a single click on a trash icon was all it took,
 * which is too little for a write that cannot be undone.
 */
const props = defineProps<{
	page: Pick<PageSummary, 'ref' | 'displayName' | 'category'>
}>()
const emit = defineEmits<{ close: [] }>()

const builder = useBuilder()
const session = builder.session
const router = useRouter()
// Auto-imported from the host's own layer, like every `app/composables` the
// loader scans; it is not part of the frontend-module SDK.
const devReload = useDmsDevReload()

const deleting = ref(false)
const open = computed(() => session.value.pageRef === props.page.ref)

async function confirm(): Promise<void> {
	if (deleting.value) {
		return
	}
	deleting.value = true
	try {
		const wasOpen = open.value
		if (!(await builder.deletePage(props.page.ref))) {
			return
		}
		emit('close')
		if (wasOpen) {
			await leaveDeletedPage()
		}
	} finally {
		deleting.value = false
	}
}

/**
 * The route the editor was on is gone, and the DMS renders it bare: move to a
 * page of the same category, else to any page — else there is nothing left to
 * edit, and the editor closes.
 */
async function leaveDeletedPage(): Promise<void> {
	const pages = session.value.pages
	const next =
		pages.find((entry) => entry.category === props.page.category) ?? pages[0]
	if (!next) {
		builder.close()
		await router.push('/')
		return
	}
	await openWhenServed(
		{
			devReload,
			router,
			onWaitFailure: (failure) => {
				session.value.error = failure
			},
		},
		next.ref,
	)
}
</script>

<template>
	<div
		class="flex flex-col gap-2.5 rounded-md border border-error/40 bg-error/5 p-2.5"
	>
		<p class="text-xs leading-relaxed text-toned">
			Delete
			<span class="font-medium text-highlighted">{{ page.displayName }}</span>?
			The page leaves the project, with the routes it declares and the
			queries only it reads.
			<template v-if="open && builder.dirty.value">
				Its unsaved changes go with it.
			</template>
			<span class="font-medium text-highlighted">
				The builder cannot undo this.
			</span>
		</p>
		<div class="flex gap-1.5">
			<UButton
				icon="i-ph-trash"
				size="xs"
				color="error"
				:label="deleting ? 'Deleting…' : 'Delete the page'"
				:loading="deleting"
				:disabled="deleting"
				@click="confirm"
			/>
			<UButton
				size="xs"
				color="neutral"
				variant="ghost"
				label="Keep it"
				:disabled="deleting"
				@click="emit('close')"
			/>
		</div>
	</div>
</template>

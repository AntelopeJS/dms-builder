<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDmsRoute as useRoute } from '#dms/frontend-module'
import { useContentAnchor } from '../runtime/anchor'
import { describeError, errorDetail } from '../runtime/errors'
import { useBuilder } from '../runtime/session'

const builder = useBuilder()
const session = builder.session
const anchor = useContentAnchor()
const route = useRoute()

watch(
	() => route.path,
	(path) => builder.followRoute(path),
)

const style = computed(() => ({
	top: `${anchor.value.top}px`,
	left: `${anchor.value.left}px`,
	width: `${anchor.value.width}px`,
	height: `${anchor.value.height}px`,
}))

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

const isTyping = (target: EventTarget | null): boolean => {
	const element = target as HTMLElement | null
	if (!element) return false
	return (
		element.tagName === 'INPUT' ||
		element.tagName === 'TEXTAREA' ||
		element.isContentEditable
	)
}

function onKeydown(event: KeyboardEvent): void {
	if (!session.value.active) {
		return
	}
	const modifier = event.metaKey || event.ctrlKey
	if (modifier && event.key.toLowerCase() === 's') {
		event.preventDefault()
		void builder.save()
		return
	}
	if (isTyping(event.target)) {
		return
	}
	if (event.key === 'Escape') {
		if (session.value.selection) {
			builder.select(null)
			return
		}
		builder.close()
		return
	}
	if (modifier && event.key.toLowerCase() === 'z') {
		event.preventDefault()
		if (event.shiftKey) {
			builder.redo()
		} else {
			builder.undo()
		}
		return
	}
	const path = session.value.selection
	if (!path) {
		return
	}
	if (modifier && event.key.toLowerCase() === 'd') {
		event.preventDefault()
		builder.duplicate(path)
		return
	}
	if (event.key === 'Delete' || event.key === 'Backspace') {
		event.preventDefault()
		builder.remove(path)
		return
	}
	if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
		event.preventDefault()
		builder.nudge(path, event.key === 'ArrowUp' ? -1 : 1)
	}
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
	<div
		v-if="session.active"
		class="fixed z-50 flex flex-col overflow-hidden border border-default bg-default shadow-lg"
		:style="style"
	>
		<DmsBuilderBar />

		<div
			v-if="session.pendingRoute"
			class="flex items-center gap-3 border-b border-warning bg-warning/10 px-4 py-2 text-xs text-warning"
		>
			<UIcon name="i-ph-warning" class="size-4 shrink-0" />
			<span class="flex-1">
				Unsaved changes on {{ session.pageRef }} — save them before moving to
				{{ session.pendingRoute }}.
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
		</div>

		<div
			v-else-if="session.conflict"
			class="flex items-center gap-3 border-b border-warning bg-warning/10 px-4 py-2 text-xs text-warning"
		>
			<UIcon name="i-ph-warning" class="size-4 shrink-0" />
			<span class="flex-1">
				This page changed outside the builder. Reload it before saving.
			</span>
			<UButton
				size="xs"
				color="warning"
				variant="soft"
				label="Reload"
				@click="builder.reload()"
			/>
		</div>

		<div
			v-else-if="session.error"
			class="flex items-start gap-3 border-b border-error bg-error/10 px-4 py-2 text-xs text-error"
		>
			<UIcon name="i-ph-x-circle" class="mt-0.5 size-4 shrink-0" />
			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<span>{{ message }}</span>
				<button
					v-if="detail.length"
					type="button"
					class="self-start underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100"
					@click="detailOpen = !detailOpen"
				>
					{{ detailOpen ? 'Hide the details' : 'Details' }}
				</button>
				<ul v-if="detailOpen" class="flex flex-col gap-0.5 font-mono opacity-80">
					<li v-for="line in detail" :key="line">{{ line }}</li>
				</ul>
			</div>
			<UButton
				icon="i-ph-x"
				size="xs"
				color="error"
				variant="ghost"
				aria-label="Dismiss"
				@click="session.error = null"
			/>
		</div>

		<div v-if="session.loading" class="flex flex-1 items-center justify-center">
			<UIcon name="i-ph-circle-notch" class="size-6 animate-spin text-dimmed" />
		</div>

		<div v-else class="flex min-h-0 flex-1">
			<DmsBuilderCanvas />
			<DmsBuilderRail v-if="session.railOpen" />
		</div>

		<DmsBuilderBlockMenu />

		<div
			v-if="session.toast"
			class="pointer-events-none absolute bottom-4 left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap rounded-lg bg-inverted px-4 py-2 text-xs text-inverted shadow-lg"
		>
			{{ session.toast }}
		</div>
	</div>
</template>

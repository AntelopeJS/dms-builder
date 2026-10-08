<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useDmsRoute as useRoute } from '#dms/frontend-module'
import { useContentAnchor } from '../runtime/anchor'
import { placedPaths } from '../runtime/naming'
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

/**
 * The frame's columns: the side rail, the page and the inspector, the
 * inspector widened for what needs the room; a workspace takes it all.
 */
const columns = computed(() => {
	if (session.value.workspace !== 'page') {
		return 'grid-cols-[minmax(0,1fr)]'
	}
	return session.value.inspector === 'json'
		? 'grid-cols-[264px_minmax(0,1fr)_560px]'
		: 'grid-cols-[264px_minmax(0,1fr)_348px]'
})

function undoFromToast(): void {
	builder.undo()
	session.value.toast = null
	session.value.toastUndo = false
}

const isTyping = (target: EventTarget | null): boolean => {
	const element = target as HTMLElement | null
	if (!element) return false
	return (
		element.tagName === 'INPUT' ||
		element.tagName === 'TEXTAREA' ||
		element.isContentEditable
	)
}

// What answers keys of its own: anything that can hold the focus and act on
// it, a button as much as a field.
const CONTROLS = [
	'input',
	'textarea',
	'select',
	'button',
	'a[href]',
	'[contenteditable]',
	...[
		'switch',
		'checkbox',
		'radio',
		'combobox',
		'listbox',
		'option',
		'menu',
		'menuitem',
		'slider',
		'spinbutton',
		'tab',
		'dialog',
		'alertdialog',
	].map((role) => `[role="${role}"]`),
].join(', ')

// What closes on Escape by itself, and takes the key with it.
const POPUPS = ['dialog', 'alertdialog', 'listbox', 'menu']
	.map((role) => `[role="${role}"]`)
	.join(', ')

/** The element a key was pressed on, when it was pressed on one. */
const elementOf = (target: EventTarget | null): Element | null =>
	target && typeof (target as Element).closest === 'function'
		? (target as Element)
		: null

/**
 * Whether the focus is on a control outside the canvas: a switch, a select or
 * a button of the panel, a dialog over the editor.
 *
 * The keys that act on the selected block are not for those. Backspace on a
 * switch the panel just toggled is not a request to remove the block the panel
 * is about, nor an arrow in a select one to move it. Inside a block — the
 * canvas renders real components, buttons included — the keys are the block's.
 */
function isOnControl(target: EventTarget | null): boolean {
	const element = elementOf(target)
	return (
		!!element &&
		element.closest(CONTROLS) !== null &&
		element.closest('[data-path]') === null
	)
}

/**
 * Step the selection to the block before or after it, top to bottom, the way
 * the layers list them; with nothing selected, the first or the last.
 */
function step(delta: number): void {
	const draft = session.value.draft
	if (!draft) {
		return
	}
	const paths = placedPaths(draft, session.value.catalog)
	if (!paths.length) {
		return
	}
	const at = session.value.selection ? paths.indexOf(session.value.selection) : -1
	const next =
		at === -1
			? delta > 0
				? 0
				: paths.length - 1
			: Math.min(Math.max(at + delta, 0), paths.length - 1)
	builder.select(paths[next] ?? null)
}

function onKeydown(event: KeyboardEvent): void {
	const modifier = event.metaKey || event.ctrlKey
	// The same key opens the editor on the page being looked at and leaves
	// it, asking first about a draft nobody saved.
	if (modifier && event.key.toLowerCase() === 'b' && !elementOf(event.target)?.closest('[contenteditable]')) {
		event.preventDefault()
		if (session.value.active) {
			builder.leave()
		} else {
			void builder.open(route.path)
		}
		return
	}
	if (!session.value.active) {
		return
	}
	if (modifier && event.key.toLowerCase() === 's') {
		event.preventDefault()
		void builder.save()
		return
	}
	if (isTyping(event.target)) {
		return
	}
	// Escape clears what is open or selected, one step at a time, and never
	// leaves the editor: it is the key people press to close a list that has
	// already closed. Leaving is the bar's button, which asks first.
	if (event.key === 'Escape') {
		if (event.defaultPrevented || elementOf(event.target)?.closest(POPUPS)) {
			return
		}
		if (session.value.menu) {
			builder.closeMenu()
			return
		}
		// Only a selection: with none, this would trade the open panel for
		// the library.
		if (session.value.selection) {
			builder.select(null)
		}
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
	if (isOnControl(event.target) || session.value.workspace !== 'page') {
		return
	}
	const arrow = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
	const path = session.value.selection
	// The arrows walk the page; with Alt, they carry the selected block.
	if (arrow && !event.altKey) {
		event.preventDefault()
		step(arrow)
		return
	}
	if (!path) {
		return
	}
	if (arrow) {
		event.preventDefault()
		builder.nudge(path, arrow)
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
	if (event.key === 'Enter') {
		event.preventDefault()
		builder.setView('config')
	}
}

/**
 * The draft lives in this page and nowhere else, so reloading or closing the
 * tab drops it as surely as leaving the editor does. The browser asks its own
 * question for that one; this only says there is something to lose.
 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
	if (!session.value.active || !builder.dirty.value) {
		return
	}
	event.preventDefault()
}

onMounted(() => {
	document.addEventListener('keydown', onKeydown)
	window.addEventListener('beforeunload', onBeforeUnload)
})
onUnmounted(() => {
	document.removeEventListener('keydown', onKeydown)
	window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
	<div
		v-if="session.active"
		class="fixed z-50 flex flex-col overflow-hidden border border-accented bg-muted"
		:style="style"
	>
		<DmsBuilderBar />
		<DmsBuilderBanners />

		<!-- Opening reads the page, its tables and its menu: the frame stands
		in the page's shape meanwhile rather than as a bare spinner. -->
		<div
			v-if="session.loading"
			class="grid min-h-0 flex-1 grid-cols-[264px_minmax(0,1fr)_348px]"
			aria-busy="true"
			:aria-label="`Opening ${session.pageRef ?? 'the page'}`"
		>
			<div class="border-r border-default bg-(--dms-bg-sidebar)" />
			<div class="flex flex-col gap-4 p-8">
				<USkeleton class="h-10 w-72" />
				<div class="grid grid-cols-3 gap-4">
					<USkeleton v-for="cell in 3" :key="cell" class="h-28" />
				</div>
				<USkeleton class="h-64" />
			</div>
			<div class="border-l border-default bg-(--dms-bg-sidebar)" />
		</div>

		<div v-else class="grid min-h-0 flex-1" :class="columns">
			<template v-if="session.workspace === 'page'">
				<DmsBuilderLeftRail />
				<DmsBuilderCanvas />
				<DmsBuilderInspector />
			</template>
			<DmsBuilderWorkspace v-else />
		</div>

		<DmsBuilderBlockMenu />

		<!-- Said where the author is looking, and announced: a removal says
		what went and offers it back. -->
		<div
			role="status"
			aria-live="polite"
			class="pointer-events-none absolute bottom-4 left-1/2 z-[70] -translate-x-1/2"
		>
			<div
				v-if="session.toast"
				class="pointer-events-auto flex items-center gap-3 rounded-lg bg-inverted px-4 py-2 text-xs whitespace-nowrap text-inverted shadow-lg"
			>
				<span>{{ session.toast }}</span>
				<button
					v-if="session.toastUndo"
					type="button"
					class="flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline"
					@click="undoFromToast"
				>
					Undo
					<span class="font-mono text-[10px] opacity-70">⌘Z</span>
				</button>
			</div>
		</div>
	</div>
</template>

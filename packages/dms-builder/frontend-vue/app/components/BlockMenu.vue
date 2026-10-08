<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { findNode } from '../runtime/draft'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'

/**
 * What can be done to one block, summoned where it was asked for: a real menu,
 * walked with the arrows, closed with Escape, each entry saying its shortcut.
 */

const MARGIN = 12

interface MenuEntry {
	label: string
	icon: string
	keys: string
	disabled: boolean
	danger?: boolean
	run: () => void
}

const builder = useBuilder()
const session = builder.session
const { advanced } = useBuilderMode()
const element = ref<HTMLElement | null>(null)

const menu = computed(() => session.value.menu)

// Summoned at the pointer, then pulled back inside the window.
const style = computed(() => {
	const box = element.value?.getBoundingClientRect()
	const x = menu.value?.x ?? 0
	const y = menu.value?.y ?? 0
	const width = box?.width ?? 240
	const height = box?.height ?? 0
	return {
		left: `${Math.max(MARGIN, Math.min(x, globalThis.innerWidth - width - MARGIN))}px`,
		top: `${Math.min(y, globalThis.innerHeight - height - MARGIN)}px`,
	}
})

function dismiss(): void {
	builder.closeMenu()
}

onMounted(() => document.addEventListener('click', dismiss))
onUnmounted(() => document.removeEventListener('click', dismiss))

function run(action: () => void): void {
	action()
	builder.closeMenu()
}

const target = computed(() => {
	const path = menu.value?.path
	const draft = session.value.draft
	return path && draft ? findNode(draft, path) : undefined
})

/** The block on its own, as JSON: what a developer pastes elsewhere. */
async function copyAsJson(): Promise<void> {
	if (!target.value) {
		return
	}
	await navigator.clipboard?.writeText(JSON.stringify(target.value, null, 2))
	builder.notify('Copied the block as JSON')
}

const entries = computed<MenuEntry[]>(() => {
	const path = menu.value?.path ?? ''
	// A block kept as it stands is matched by its name on disk, which a copy
	// matches nothing of: the draft refuses it, so offering it is offering a
	// click that does nothing.
	const kept = target.value?.preserve === true
	return [
		{
			label: 'Edit settings',
			icon: 'i-ph-sliders-horizontal-light',
			keys: '↵',
			disabled: false,
			run: () => builder.setView('config'),
		},
		{
			label: 'Duplicate',
			icon: 'i-ph-copy-light',
			keys: '⌘D',
			disabled: kept,
			run: () => builder.duplicate(path),
		},
		{
			label: 'Move up',
			icon: 'i-ph-arrow-up-light',
			keys: '⌥↑',
			disabled: false,
			run: () => builder.nudge(path, -1),
		},
		{
			label: 'Move down',
			icon: 'i-ph-arrow-down-light',
			keys: '⌥↓',
			disabled: false,
			run: () => builder.nudge(path, 1),
		},
		{
			label: 'Copy as JSON',
			icon: 'i-ph-brackets-curly-light',
			keys: '',
			disabled: false,
			run: () => void copyAsJson(),
		},
		...(advanced.value
			? [
					{
						label: 'Page as JSON',
						icon: 'i-ph-export-light',
						keys: '',
						disabled: false,
						run: () => builder.setView('json'),
					},
				]
			: []),
		{
			label: 'Remove',
			icon: 'i-ph-trash-light',
			keys: '⌫',
			disabled: false,
			danger: true,
			run: () => builder.remove(path),
		},
	]
})

function items(): HTMLElement[] {
	const root = element.value
	if (typeof root?.querySelectorAll !== 'function') {
		return []
	}
	return [...root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')]
}

/** The arrows walk the entries, Escape closes the menu and nothing else. */
function onKeydown(event: KeyboardEvent): void {
	const all = items()
	const at = all.indexOf(document.activeElement as HTMLElement)
	const focus = (index: number): void => all[(index + all.length) % all.length]?.focus()
	switch (event.key) {
		case 'ArrowDown':
			event.preventDefault()
			focus(at + 1)
			return
		case 'ArrowUp':
			event.preventDefault()
			focus(at - 1)
			return
		case 'Home':
			event.preventDefault()
			focus(0)
			return
		case 'End':
			event.preventDefault()
			focus(all.length - 1)
			return
		case 'Escape':
		case 'Tab':
			event.preventDefault()
			event.stopPropagation()
			builder.closeMenu()
	}
}

// Opened, the menu takes the focus, so the arrows are its own.
watch(menu, (open) => {
	if (open) {
		void nextTick(() => items()[0]?.focus())
	}
})
</script>

<template>
	<div
		v-if="menu"
		ref="element"
		role="menu"
		aria-label="Block actions"
		class="fixed z-[60] w-60 rounded-lg border border-default bg-default p-1 shadow-(--dms-shadow-pop)"
		:style="style"
		@click.stop
		@keydown="onKeydown"
	>
		<template v-for="entry in entries" :key="entry.label">
			<div v-if="entry.danger" class="my-1 h-px bg-(--ui-border)" role="separator" />
			<button
				type="button"
				role="menuitem"
				:disabled="entry.disabled"
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] outline-none disabled:cursor-not-allowed disabled:text-dimmed disabled:hover:bg-transparent"
				:class="
					entry.danger
						? 'text-error hover:bg-error/10 focus-visible:bg-error/10'
						: 'text-toned hover:bg-elevated hover:text-highlighted focus-visible:bg-elevated'
				"
				@click="run(entry.run)"
			>
				<UIcon :name="entry.icon" class="size-4 shrink-0" />
				<span class="flex-1">{{ entry.label }}</span>
				<span v-if="entry.keys" class="font-mono text-[11px] opacity-60">{{ entry.keys }}</span>
			</button>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { findNode } from '../runtime/draft'
import { useBuilder } from '../runtime/session'

const MARGIN = 12

interface MenuEntry {
	label: string
	icon: string
	keys: string
	disabled: boolean
	run: () => void
}

const builder = useBuilder()
const session = builder.session
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
		left: `${Math.min(x, globalThis.innerWidth - width - MARGIN)}px`,
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

const entries = computed<MenuEntry[]>(() => {
	const path = menu.value?.path ?? ''
	return [
		{
			label: 'Configure',
			icon: 'i-ph-sliders',
			keys: '⌘E',
			disabled: false,
			run: () => builder.setView('config'),
		},
		{
			label: 'Duplicate',
			icon: 'i-ph-copy',
			keys: '⌘D',
			// A block kept as it stands is matched by its name on disk, which a copy
			// matches nothing of: the draft refuses it, so offering it is offering a
			// click that does nothing.
			disabled: target.value?.preserve === true,
			run: () => builder.duplicate(path),
		},
		{
			label: 'Move up',
			icon: 'i-ph-arrow-up',
			keys: '↑',
			disabled: false,
			run: () => builder.nudge(path, -1),
		},
		{
			label: 'Move down',
			icon: 'i-ph-arrow-down',
			keys: '↓',
			disabled: false,
			run: () => builder.nudge(path, 1),
		},
		{
			label: 'Export the page',
			icon: 'i-ph-export',
			keys: '',
			disabled: false,
			run: () => builder.setView('json'),
		},
	]
})
</script>

<template>
	<div
		v-if="menu"
		ref="element"
		class="fixed z-[60] w-60 rounded-lg border border-default bg-default p-1 shadow-lg"
		:style="style"
		@click.stop
	>
		<button
			v-for="entry in entries"
			:key="entry.label"
			type="button"
			:disabled="entry.disabled"
			class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-elevated hover:text-default disabled:cursor-not-allowed disabled:text-dimmed disabled:hover:bg-transparent disabled:hover:text-dimmed"
			@click="run(entry.run)"
		>
			<UIcon :name="entry.icon" class="size-4 shrink-0" />
			<span class="flex-1">{{ entry.label }}</span>
			<span class="text-dimmed">{{ entry.keys }}</span>
		</button>

		<div class="my-1 h-px bg-default" />

		<button
			type="button"
			class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs text-error hover:bg-error/10"
			@click="run(() => builder.remove(menu!.path))"
		>
			<UIcon name="i-ph-trash" class="size-4 shrink-0" />
			<span class="flex-1">Delete</span>
			<span class="opacity-60">Del</span>
		</button>
	</div>
</template>

<script setup lang="ts">
/**
 * A part of a panel that folds away behind one line saying what it holds, so
 * a long panel reads as its summaries until one of them is opened.
 *
 * Folded, what it holds stays mounted: a part that reads something on mount —
 * a source's preview — is not asked again each time it is opened.
 */
defineProps<{
	icon: string
	title: string
	summary?: string
	open: boolean
	/** A colour shown before the summary, for a part that sets one. */
	dot?: string
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
	<div
		class="overflow-hidden rounded-[10px] border transition-colors"
		:class="open ? 'border-accented bg-elevated/30' : 'border-default'"
	>
		<button
			type="button"
			class="flex min-h-[50px] w-full items-center gap-2.5 px-3 py-2 text-left"
			:aria-expanded="open"
			@click="emit('toggle')"
		>
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-[7px]"
				:class="open ? 'bg-primary/10 text-primary' : 'bg-accented text-muted'"
			>
				<UIcon :name="icon" class="size-[15px]" />
			</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="text-[13px] font-semibold text-highlighted">{{ title }}</span>
				<span
					v-if="summary"
					class="flex min-w-0 items-center gap-1.5 text-xs text-muted"
				>
					<span v-if="dot" class="size-2 shrink-0 rounded-full" :class="dot" />
					<span class="truncate">{{ summary }}</span>
				</span>
			</span>
			<UIcon
				:name="open ? 'i-ph-caret-up' : 'i-ph-caret-down'"
				class="size-3.5 shrink-0 text-dimmed"
			/>
		</button>
		<div
			class="flex-col gap-3 border-t border-default p-3"
			:class="open ? 'flex' : 'hidden'"
		>
			<slot />
		</div>
	</div>
</template>

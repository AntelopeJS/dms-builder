<script setup lang="ts">
import { ref } from 'vue'
import type { THEME_COLORS } from '../runtime/constants'

/**
 * A part of a panel that folds away behind one line saying what it holds, so
 * a long panel reads as its summaries until one of them is opened.
 *
 * Folded, what it holds stays mounted: a part that reads something on mount —
 * a source's preview — is not asked again each time it is opened.
 */
const props = defineProps<{
	icon: string
	title: string
	summary?: string
	/** Open until closed, for the part a panel shows nothing without. */
	defaultOpen?: boolean
	/** A colour shown before the summary, for a part that sets one. */
	dot?: (typeof THEME_COLORS)[number]
}>()

const open = ref(props.defaultOpen)
</script>

<template>
	<UCollapsible
		v-model:open="open"
		:unmount-on-hide="false"
		class="overflow-hidden rounded-lg border border-default bg-default"
	>
		<UButton
			color="neutral"
			variant="ghost"
			block
			:trailing-icon="open ? 'i-ph-caret-up' : 'i-ph-caret-down'"
			:ui="{ trailingIcon: 'size-4 text-dimmed' }"
			class="min-h-12 justify-start gap-2 rounded-none px-3.5 py-3 text-left hover:bg-accented/40"
		>
			<UIcon :name="icon" class="size-4 shrink-0 text-primary" />
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="text-sm font-semibold text-highlighted">{{ title }}</span>
				<span
					v-if="summary"
					class="flex min-w-0 items-center gap-1.5 text-[13px]/[18px] font-normal text-muted"
				>
					<UChip v-if="dot" :color="dot" standalone />
					<span class="truncate">{{ summary }}</span>
				</span>
			</span>
		</UButton>
		<template #content>
			<div class="flex flex-col gap-3.5 px-3.5 pt-1 pb-3.5">
				<slot />
			</div>
		</template>
	</UCollapsible>
</template>

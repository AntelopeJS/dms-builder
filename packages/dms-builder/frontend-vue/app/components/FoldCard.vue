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
		class="overflow-hidden rounded-lg border transition-colors"
		:class="open ? 'border-accented bg-elevated/30' : 'border-default'"
	>
		<UButton
			color="neutral"
			variant="ghost"
			block
			:trailing-icon="open ? 'i-ph-caret-up' : 'i-ph-caret-down'"
			:ui="{ trailingIcon: 'size-4 text-dimmed' }"
			class="min-h-12 justify-start gap-2.5 rounded-none px-3 text-left"
		>
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-md"
				:class="open ? 'bg-primary/10 text-primary' : 'bg-accented text-muted'"
			>
				<UIcon :name="icon" class="size-4" />
			</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="font-semibold text-highlighted">{{ title }}</span>
				<span
					v-if="summary"
					class="flex min-w-0 items-center gap-1.5 text-xs font-normal text-muted"
				>
					<UChip v-if="dot" :color="dot" standalone />
					<span class="truncate">{{ summary }}</span>
				</span>
			</span>
		</UButton>
		<template #content>
			<div class="flex flex-col gap-3 border-t border-default p-3">
				<slot />
			</div>
		</template>
	</UCollapsible>
</template>

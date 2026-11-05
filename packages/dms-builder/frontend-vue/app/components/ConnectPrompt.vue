<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { ASSISTANT_ACTIONS_KEY, type AssistantActions } from '../runtime/database-build'
import { t } from '../runtime/i18n'
import { useConnectPrompt } from '../runtime/use-connect-prompt'

/**
 * Asks a developer on the first page after the setup wizard whether to connect
 * the database they already run. It is mounted by the builder's plugin on every
 * page, opens the builder only when told yes, and says nothing about a project
 * that has an external database or a browser that has already answered.
 *
 * Escape answers "Not now". A click outside does not: it would settle the
 * question for good by accident.
 */

const { phase, accept, dismiss } = useConnectPrompt()
const assistant = inject<AssistantActions | null>(ASSISTANT_ACTIONS_KEY, null)

const primary = ref<{ $el: HTMLElement } | null>(null)

const steps = computed(() => [
	{ id: 'connect', title: t('connect_prompt.connect.title'), text: t('connect_prompt.connect.text') },
	{
		id: 'map',
		title: t('connect_prompt.map.title'),
		text: assistant?.isAvailable
			? t('connect_prompt.map.text_assistant')
			: t('connect_prompt.map.text_manual'),
	},
	{ id: 'build', title: t('connect_prompt.build.title'), text: t('connect_prompt.build.text') },
])

function keepOpen(event: Event): void {
	event.preventDefault()
}

/** The default action takes the focus, so Enter connects and Escape or Tab still reach "Not now". */
function focusPrimary(event: Event): void {
	event.preventDefault()
	primary.value?.$el.focus()
}
</script>

<template>
	<UModal
		:open="phase === 'open'"
		:title="t('connect_prompt.title')"
		:description="t('connect_prompt.description')"
		:close="false"
		:content="{ onOpenAutoFocus: focusPrimary, onInteractOutside: keepOpen }"
		:ui="{
			title: 'text-lg font-semibold tracking-tight text-balance text-highlighted',
			description: 'text-sm text-toned text-pretty',
			body: 'pt-1',
			footer: 'flex-wrap items-center justify-between gap-x-6 gap-y-3',
		}"
		data-connect-prompt
		@update:open="(open: boolean) => !open && dismiss()"
	>
		<template #body>
			<ol class="m-0 flex list-none flex-col p-0" :aria-label="t('connect_prompt.steps')">
				<li
					v-for="(step, index) in steps"
					:key="step.id"
					class="dms-builder-connect-step relative flex gap-4 pb-5 last:pb-0"
					:style="{ '--step': index }"
					:data-step="step.id"
				>
					<span
						v-if="index < steps.length - 1"
						class="dms-builder-connect-rail absolute top-12 bottom-1 left-[21px] w-px bg-(--dms-accent-line)"
						aria-hidden="true"
					/>
					<span
						class="relative grid size-11 shrink-0 place-items-center rounded-lg border border-default bg-(--dms-bg-sidebar)"
						aria-hidden="true"
					>
						<UIcon v-if="step.id === 'connect'" name="i-ph-database-light" class="size-5 text-primary" />
						<span v-else-if="step.id === 'map'" class="grid w-6 gap-[3px]">
							<i class="h-[3px] rounded-full bg-(--dms-accent-fill)" />
							<i v-for="row in 3" :key="row" class="grid grid-cols-[1fr_1fr] gap-[3px]">
								<i class="h-[3px] rounded-full bg-accented" />
								<i class="h-[3px] rounded-full bg-accented" />
							</i>
						</span>
						<span v-else class="flex h-6 w-7 flex-col gap-[3px] rounded-[3px] border border-accented p-[3px]">
							<i class="h-[3px] w-3 rounded-full bg-(--dms-accent-fill)" />
							<i class="flex flex-1 items-end gap-[2px]">
								<i class="h-[40%] w-1 rounded-[1px] bg-accented" />
								<i class="h-[70%] w-1 rounded-[1px] bg-accented" />
								<i class="h-full w-1 rounded-[1px] bg-(--dms-accent-fill)" />
							</i>
						</span>
					</span>
					<div class="min-w-0 pt-0.5">
						<p class="text-[13px]/5 font-semibold text-highlighted">{{ step.title }}</p>
						<p class="mt-0.5 text-[13px]/[1.5] text-toned text-pretty">{{ step.text }}</p>
					</div>
				</li>
			</ol>
		</template>
		<template #footer>
			<p class="max-w-[28ch] text-xs/[1.45] text-muted text-pretty">{{ t('connect_prompt.later') }}</p>
			<div class="flex gap-2">
				<UButton :label="t('connect_prompt.dismiss')" color="neutral" variant="ghost" data-action="dismiss" @click="dismiss" />
				<UButton ref="primary" :label="t('connect_prompt.accept')" data-action="accept" @click="accept" />
			</div>
		</template>
	</UModal>
</template>

<style>
.dms-builder-connect-step {
	animation: dms-builder-connect-step 460ms cubic-bezier(0.22, 1, 0.36, 1) both;
	animation-delay: calc(140ms + var(--step) * 80ms);
}

.dms-builder-connect-rail {
	transform-origin: top;
	animation: dms-builder-connect-rail 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
	animation-delay: calc(240ms + var(--step) * 80ms);
}

@keyframes dms-builder-connect-step {
	from {
		opacity: 0;
		transform: translateY(6px);
	}
}

@keyframes dms-builder-connect-rail {
	from {
		transform: scaleY(0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.dms-builder-connect-step,
	.dms-builder-connect-rail {
		animation: none;
	}
}
</style>

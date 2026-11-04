<script setup lang="ts">
import { t } from '../runtime/i18n'
import { useBuilder } from '../runtime/session'

/**
 * Copies an assistant hand-off prompt so the person can run it in their own agent, with an
 * info popover on what that needs. It shows whether or not dms-ai runs, since without it the
 * prompt is the only way to hand the work on.
 */

const DOCS_URL = 'https://dms.antelopejs.com/docs/ai-and-claude-code/overview'

const props = withDefaults(defineProps<{ prompt: string; size?: 'xs' | 'md' }>(), { size: 'md' })

const builder = useBuilder()

async function copy(): Promise<void> {
	try {
		await navigator.clipboard.writeText(props.prompt)
		builder.notify(t('toasts.copied'))
	} catch {
		builder.notify(t('toasts.copy_failed'))
	}
}
</script>

<template>
	<span class="inline-flex items-center gap-1" data-copy-prompt>
		<UButton
			:label="t('database.copy.label')"
			icon="i-ph-copy-light"
			color="neutral"
			variant="outline"
			:size="size"
			@click="copy"
		/>
		<UPopover :content="{ align: 'start', sideOffset: 6 }">
			<UButton
				icon="i-ph-info-light"
				color="neutral"
				variant="ghost"
				:size="size"
				square
				:aria-label="t('database.copy.about')"
			/>
			<template #content>
				<div class="flex w-[26rem] max-w-[90vw] flex-col gap-2 p-3 text-xs text-toned" data-copy-prompt-info>
					<p>
						{{ t('database.copy.agent') }}
					</p>
					<p>
						{{ t('database.copy.skills') }}
					</p>
					<pre class="whitespace-pre-wrap break-all rounded-md bg-elevated p-2 font-mono text-[11px] text-muted">claude plugin marketplace add AntelopeJS/agent-skills
claude plugin install antelopejs@antelopejs
codex plugin marketplace add AntelopeJS/agent-skills
codex plugin add antelopejs@antelopejs</pre>
					<a
						:href="DOCS_URL"
						target="_blank"
						rel="noopener noreferrer"
						class="font-semibold text-primary underline-offset-2 hover:underline"
					>
						{{ t('database.copy.docs') }}
					</a>
				</div>
			</template>
		</UPopover>
	</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBuilder } from '../runtime/session'
import { useThemeEditor } from '../runtime/theme'

/** Under the change list: drop them all, or save them all. */

const builder = useBuilder()
const session = builder.session
// Auto-imported from the host's own layer: the DMS's confirmation dialog.
const { confirm } = useConfirm()

const theme = useThemeEditor()

const count = computed(() => builder.unsaved.value.length + theme.changeCount.value)

async function discard(): Promise<void> {
	const asked = await confirm({
		title: 'Discard every unsaved change?',
		description: theme.dirty.value
			? 'The page and the theme go back to how they were last saved. Undo brings the changes back while the editor stays open.'
			: 'The page goes back to how it was last saved. Undo brings the changes back while the editor stays open.',
		confirmLabel: 'Discard the changes',
		cancelLabel: 'Keep them',
		color: 'error',
	})
	if (asked) {
		builder.cancel()
	}
}
</script>

<template>
	<footer
		class="flex shrink-0 items-center gap-1.5 border-t border-default bg-(--dms-bg-muted) px-3 py-2.5"
	>
		<UButton
			icon="i-ph-arrow-counter-clockwise-light"
			label="Discard all…"
			size="sm"
			color="error"
			variant="ghost"
			:disabled="!builder.dirty.value"
			@click="discard"
		/>
		<span class="flex-1" />
		<UButton
			icon="i-ph-floppy-disk-light"
			:label="count ? `Save ${count} change${count === 1 ? '' : 's'}` : 'Save'"
			size="sm"
			:loading="session.saving"
			:disabled="!builder.dirty.value"
			@click="builder.save()"
		/>
	</footer>
</template>

<script setup lang="ts">
import { currentAnswer, type MappingDraft, purposeText } from '../runtime/database'
import type { MapResourcesInput, OpenItem } from '../runtime/database-types'
import { t } from '../runtime/i18n'

/** What Apply will do, listed before the person confirms: each table's purpose, the exclusions remembered and the questions left open. */
defineProps<{
	summary: MapResourcesInput
	open: OpenItem[]
	draft: MappingDraft
	mappedTableViews: ReadonlySet<string>
	connection: string
}>()
</script>

<template>
	<div class="flex flex-col gap-1 rounded-md border border-default bg-elevated px-3 py-2 text-xs text-toned">
		<p class="font-semibold text-highlighted">{{ t('database.proposal.applying_will') }}</p>
		<p v-for="entry in summary.resources" :key="entry.relation">
			· <span class="font-mono">{{ entry.relation }}</span>{{ t('database.proposal.colon') }}
			{{ t('database.proposal.summary_entry', { purpose: purposeText(entry) }, entry.fields.length) }}
		</p>
		<p v-if="summary.excluded?.length">
			· {{ t('database.proposal.remember_excluded', {}, summary.excluded.length) }}
		</p>
		<template v-if="open.length">
			<p>· {{ t('database.proposal.leave_open', {}, open.length) }}</p>
			<p v-for="item in open" :key="item.id" class="pl-3">
				<span class="font-mono">{{ item.column ? `${item.relation}.${item.column}` : item.relation ?? connection }}</span>{{ t('database.proposal.colon') }}
				{{ currentAnswer(draft, item, mappedTableViews) }}
			</p>
		</template>
	</div>
</template>

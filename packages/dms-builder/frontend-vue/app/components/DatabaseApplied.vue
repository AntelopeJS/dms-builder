<script setup lang="ts">
import { assistantDashboardMessage } from '../runtime/database-build'
import { t } from '../runtime/i18n'

/** What an applied mapping answers: the tables added, what it warned about, and the assistant's hand-off. */
defineProps<{
	tables: number
	connection: string
	module: string
	warnings: string[]
	handedOff: boolean
	canHandOff: boolean
}>()
defineEmits<{ handOff: [] }>()
</script>

<template>
	<div class="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-toned">
		<b class="font-semibold text-highlighted">{{ t('database.applied.title') }}</b>
		{{ t('database.applied.added', { tables, connection: connection.toUpperCase() }) }}
		<p v-for="warning in warnings" :key="warning" class="text-warning">{{ warning }}</p>
		<p v-if="handedOff" data-handoff>{{ t('database.applied.building') }}</p>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<UButton
				v-if="!handedOff && canHandOff"
				:label="t('database.applied.hand_off')"
				size="xs"
				@click="$emit('handOff')"
			/>
			<DmsBuilderDatabasePromptCopy :prompt="assistantDashboardMessage(connection, module)" size="xs" />
		</div>
	</div>
</template>

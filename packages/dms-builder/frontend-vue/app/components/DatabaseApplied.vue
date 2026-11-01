<script setup lang="ts">
/** What an applied mapping answers: the tables added, what it warned about, and the assistant's hand-off. */
defineProps<{
	tables: number
	connection: string
	warnings: string[]
	handedOff: boolean
	canHandOff: boolean
}>()
defineEmits<{ handOff: [] }>()
</script>

<template>
	<div class="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-toned">
		<b class="font-semibold text-highlighted">Applied.</b>
		{{ tables }} tables added. Their pages appear in the menu under {{ connection.toUpperCase() }} within a few seconds.
		<p v-for="warning in warnings" :key="warning" class="text-warning">{{ warning }}</p>
		<p v-if="handedOff" data-handoff>The assistant is building the dashboard and the pages' details.</p>
		<UButton
			v-else-if="canHandOff"
			class="mt-2"
			label="Let the assistant build the dashboard"
			size="xs"
			@click="$emit('handOff')"
		/>
	</div>
</template>

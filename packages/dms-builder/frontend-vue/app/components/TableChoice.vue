<script setup lang="ts">
import { computed } from 'vue'
import { useBuilder } from '../runtime/session'
import type { ResourceStructure } from '../runtime/types'

/**
 * The table a block works on, as every panel shows it: the table picked, with
 * what the block does with it, opening the tables to pick another from. A block
 * that has none yet shows the tables straight away, under what picking one does.
 */
const props = withDefaults(
	defineProps<{
		/** The table picked, if any. */
		modelValue?: string
		/** What the block does with the table, under its name. */
		note: string
		/** Names the button for a screen reader: `Table it lists`. */
		label: string
		/** Over the tables, before one is picked. */
		emptyTitle: string
		emptyHint: string
		/** Why the table picked will not do, shown in its place. */
		warning?: string
		/** Why a table will not do for the block, or nothing when it will. */
		refusal?: (table: ResourceStructure) => string | undefined
		/** The columns a table offers the block, by default all of them. */
		columns?: (table: ResourceStructure) => number
	}>(),
	{
		modelValue: undefined,
		warning: undefined,
		refusal: () => undefined,
		columns: undefined,
	},
)
const emit = defineEmits<{ 'update:modelValue': [ref: string] }>()

/** Whether the list of tables is open over the table already picked. */
const open = defineModel<boolean>('open', { default: false })

const builder = useBuilder()
const session = builder.session

const listing = computed(() => !props.modelValue || open.value)

function choose(ref: string): void {
	open.value = false
	if (ref !== props.modelValue) {
		emit('update:modelValue', ref)
	}
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<UButton
			v-if="modelValue"
			:color="warning ? 'warning' : 'neutral'"
			variant="subtle"
			size="lg"
			block
			:trailing-icon="open ? 'i-ph-caret-up' : 'i-ph-caret-down'"
			:aria-expanded="open"
			:aria-label="`${label}: ${modelValue}`"
			class="text-left aria-expanded:ring-primary"
			@click="open = !open"
		>
			<template #leading>
				<span
					class="flex size-8 shrink-0 items-center justify-center rounded-md border"
					:class="
						warning
							? 'border-warning/35 bg-warning/10 text-warning'
							: 'border-primary/35 bg-primary/10 text-primary'
					"
				>
					<UIcon name="i-ph-table-light" class="size-4" />
				</span>
			</template>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate font-medium text-highlighted">{{ modelValue }}</span>
				<span class="text-xs" :class="warning ? 'text-warning' : 'text-muted'">
					{{ warning ?? note }}
				</span>
			</span>
		</UButton>

		<div
			v-if="listing"
			class="flex flex-col gap-2.5 rounded-lg border bg-default p-3"
			:class="modelValue ? 'border-accented' : 'border-primary/35'"
		>
			<div v-if="!modelValue" class="flex flex-col gap-1">
				<p class="text-sm font-semibold text-highlighted">{{ emptyTitle }}</p>
				<p class="text-xs leading-relaxed text-muted">{{ emptyHint }}</p>
			</div>
			<DmsBuilderTablePicker
				:model-value="modelValue"
				:refusal="refusal"
				:columns="columns"
				@update:model-value="choose"
			/>
			<UButton
				v-if="modelValue"
				size="xs"
				color="neutral"
				variant="ghost"
				label="Cancel"
				class="self-start"
				@click="open = false"
			/>
		</div>

		<slot name="footer">
			<p v-if="!modelValue" class="text-xs leading-relaxed text-dimmed">
				{{ session.resources.length ? 'No table fits?' : 'None to pick?' }}
				<UButton
					size="xs"
					variant="link"
					label="Create one in Tables"
					class="p-0 align-baseline"
					@click="builder.setView('resource')"
				/>
			</p>
		</slot>
	</div>
</template>

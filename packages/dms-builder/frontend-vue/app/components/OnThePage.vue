<script setup lang="ts">
import { computed } from 'vue'
import { useBlockPanel } from '../runtime/block-panel'
import {
	CARD_FIELD_UI,
	FIELD_ORIENTATION_DEFAULT,
	PANEL_CARD,
} from '../runtime/form-panel'

/**
 * What a block shows on the page around what it holds, as someone building
 * the page sets it up: its title, its description, and — for a form — where
 * its labels sit. Shared by the blocks the simple mode has a panel for; each
 * setting shows only on a block that declares it, and a panel adds its own
 * below them.
 */
const props = defineProps<{
	path: string
	/** Pick the block's icon beside its title, the way a page's is. */
	withIcon?: boolean
}>()

const block = useBlockPanel(() => props.path)
const { text, write } = block

/** A title the block cannot go without is asked for, not offered. */
const titleRequired = computed(() => block.options.value.title?.optional !== true)

/** Where the labels sit, each drawn as the little form it makes. */
const ORIENTATIONS = [
	{ value: 'horizontal', label: 'Beside the field' },
	{ value: 'vertical', label: 'Above it' },
] as const

const orientation = computed(
	() => text('fieldsOrientation') || FIELD_ORIENTATION_DEFAULT,
)
</script>

<template>
	<section
		v-if="block.has('title') || block.has('description') || block.has('fieldsOrientation')"
		:class="PANEL_CARD"
		aria-label="On the page"
	>
		<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
			<UIcon name="i-ph-text-t-light" class="size-4 text-primary" />
			On the page
		</p>
		<UFormField
			v-if="block.has('title')"
			label="Title"
			:required="titleRequired"
			:ui="CARD_FIELD_UI"
		>
			<div class="flex gap-2">
				<DmsBuilderIconPicker
					v-if="withIcon && block.has('icon')"
					:model-value="text('icon') || undefined"
					fallback="i-ph-image"
					size="lg"
					label="Choose the icon"
					@update:model-value="write('icon', $event)"
				/>
				<UInput
					class="w-full"
					:model-value="text('title')"
					size="lg"
					:placeholder="titleRequired ? undefined : 'Optional'"
					@update:model-value="write('title', String($event))"
				/>
			</div>
		</UFormField>
		<UFormField v-if="block.has('description')" label="Description" :ui="CARD_FIELD_UI">
			<UInput
				class="w-full"
				:model-value="text('description')"
				size="lg"
				placeholder="Optional"
				@update:model-value="write('description', String($event))"
			/>
		</UFormField>
		<div v-if="block.has('fieldsOrientation')" class="flex flex-col gap-1.5">
			<span class="text-sm text-muted">Labels</span>
			<div role="group" aria-label="Labels" class="grid grid-cols-2 gap-2">
				<button
					v-for="item in ORIENTATIONS"
					:key="item.value"
					type="button"
					:aria-pressed="orientation === item.value"
					class="flex flex-col items-center gap-1.5 rounded-md border px-1.5 py-2.5 text-[13px] font-medium transition-colors"
					:class="
						orientation === item.value
							? 'border-primary bg-primary/10 text-highlighted'
							: 'border-accented text-toned hover:bg-default'
					"
					@click="write('fieldsOrientation', item.value)"
				>
					<span
						aria-hidden="true"
						class="flex w-22 opacity-60"
						:class="item.value === 'horizontal' ? 'items-center gap-1' : 'flex-col gap-0.75'"
					>
						<span class="h-1 w-7 shrink-0 rounded-sm bg-current" />
						<span
							class="h-3 rounded-[3px] border border-current"
							:class="item.value === 'horizontal' ? 'flex-1' : 'w-full'"
						/>
					</span>
					{{ item.label }}
				</button>
			</div>
		</div>
		<slot />
	</section>
</template>

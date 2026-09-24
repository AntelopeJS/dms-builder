<script setup lang="ts">
import { computed } from 'vue'
import { dataTypeItems } from '../runtime/catalog'
import { useFormBlock } from '../runtime/form-panel'
import { withEntryPatched } from '../runtime/form-table'
import { useBuilder } from '../runtime/session'
import { fitsEditor, typedEditor } from '../runtime/typed-values'
import type { ResourceFieldStructure } from '../runtime/types'

/**
 * One field of a form, opened: what it is called on the form, the help under
 * it, the value it starts from, and whether it must be filled in.
 *
 * A field that fills a column takes the column's type, and a column the table
 * cannot do without is required on the form too. A field of a form sending
 * elsewhere is the author's own, type included.
 */
const props = defineProps<{
	path: string
	/** Where the field sits in the form's list: its rank, then in its group. */
	entryPath: number[]
	entry: Record<string, unknown>
	/** The column the field fills, when the form saves into a table. */
	column?: ResourceFieldStructure
}>()

const emit = defineEmits<{ leave: [] }>()

const builder = useBuilder()
const session = builder.session
const form = useFormBlock(() => props.path)

const bound = computed(() => form.destination.value.kind === 'table')
const id = computed(() => `form-field-${props.entryPath.join('-')}`)
const schema = computed(() => form.fieldSchema.value?.properties ?? {})

const columnLabel = computed(() => props.column?.label ?? props.column?.name)
const label = computed(() =>
	typeof props.entry.label === 'string' ? props.entry.label : '',
)
/** A column the table cannot save a row without: the form cannot skip it. */
const locked = computed(() => bound.value && props.column?.required === true)
const dataTypes = computed(() => dataTypeItems(session.value.catalog))
const typeId = computed(() => {
	const type = props.entry.type as { $dataType?: unknown } | string | undefined
	return typeof type === 'string' ? type : (type?.$dataType as string | undefined)
})

function patch(values: Record<string, unknown>): void {
	form.setFields(
		withEntryPatched(form.config.value.fields, props.entryPath, values),
	)
}

function text(key: string): string {
	const value = props.entry[key]
	return typeof value === 'string' ? value : ''
}

function write(key: string, value: unknown): void {
	patch({ [key]: value === '' ? undefined : value })
}

/**
 * A new type leaves no room for a default of the old one's kind; one the new
 * type has no input for is kept, since nothing says it no longer fits.
 */
function setType(value: unknown): void {
	const type = { $dataType: String(value), config: {} }
	const editor = typedEditor(type)
	const current = props.entry.defaultValue
	patch({
		type,
		...(editor && current !== undefined && !fitsEditor(current, editor)
			? { defaultValue: undefined }
			: {}),
	})
}
</script>

<template>
	<div class="flex flex-col gap-3.5 px-3 pb-3.5 pt-1">
		<div class="flex flex-col gap-1.5">
			<label :for="`${id}-label`" class="text-xs font-medium text-toned">Label</label>
			<UInput
				:id="`${id}-label`"
				:model-value="label"
				:placeholder="columnLabel"
				@update:model-value="write('label', String($event))"
			/>
			<p
				v-if="bound && column"
				class="flex flex-wrap items-center gap-x-1.5 text-xs text-dimmed"
			>
				Saved in the column {{ columnLabel }}
				<UButton
					v-if="label && label !== columnLabel"
					size="xs"
					variant="link"
					label="Use its name"
					class="p-0"
					@click="write('label', columnLabel)"
				/>
			</p>
		</div>

		<div v-if="'description' in schema" class="flex flex-col gap-1.5">
			<label :for="`${id}-help`" class="text-xs font-medium text-toned">
				Help text
			</label>
			<UInput
				:id="`${id}-help`"
				:model-value="text('description')"
				placeholder="Shown under the field — optional"
				@update:model-value="write('description', String($event))"
			/>
		</div>

		<div v-if="!bound || !column" class="flex flex-col gap-1.5">
			<label class="text-xs font-medium text-toned">Type</label>
			<USelectMenu
				:model-value="typeId"
				:items="dataTypes"
				value-key="value"
				placeholder="Choose a data type…"
				@update:model-value="setType($event)"
			/>
		</div>

		<div v-if="schema.defaultValue" class="flex flex-col gap-1.5">
			<label class="text-xs font-medium text-toned">Default value</label>
			<DmsBuilderOption
				name="defaultValue"
				:schema="schema.defaultValue"
				:model-value="entry.defaultValue"
				:typed-as="entry.type"
				hide-label
				@update:model-value="patch({ defaultValue: $event })"
			/>
		</div>

		<div class="flex flex-col gap-2.5">
			<div v-if="'required' in schema" class="flex items-center gap-4">
				<div class="min-w-0 flex-1">
					<p class="flex items-center gap-1.5 text-[13px] text-default">
						Required
						<UIcon
							v-if="locked"
							name="i-ph-lock-simple"
							class="size-3 text-dimmed"
						/>
					</p>
					<p class="text-xs text-muted">
						{{
							locked
								? "The table can't save a row without it."
								: "The form won't send without it."
						}}
					</p>
				</div>
				<USwitch
					:model-value="locked || entry.required === true"
					:disabled="locked"
					aria-label="Required"
					@update:model-value="write('required', $event === true ? true : undefined)"
				/>
			</div>
			<div v-if="'disabled' in schema" class="flex items-center gap-4">
				<div class="min-w-0 flex-1">
					<p class="text-[13px] text-default">Read-only</p>
					<p class="text-xs text-muted">Shown with its default value, not editable.</p>
				</div>
				<USwitch
					:model-value="entry.disabled === true"
					aria-label="Read-only"
					@update:model-value="write('disabled', $event === true ? true : undefined)"
				/>
			</div>
			<div v-if="'localized' in schema" class="flex items-center gap-4">
				<div class="min-w-0 flex-1">
					<p class="text-[13px] text-default">Translatable</p>
					<p class="text-xs text-muted">One value per language.</p>
				</div>
				<USwitch
					:model-value="entry.localized === true"
					aria-label="Translatable"
					@update:model-value="write('localized', $event === true ? true : undefined)"
				/>
			</div>
		</div>

		<UButton
			icon="i-ph-minus-circle"
			size="xs"
			color="neutral"
			variant="outline"
			:label="bound ? 'Leave it out of the form' : 'Remove the field'"
			class="self-start"
			@click="emit('leave')"
		/>
	</div>
</template>

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
		<UFormField label="Label">
			<UInput
				class="w-full"
				:model-value="label"
				:placeholder="columnLabel"
				@update:model-value="write('label', String($event))"
			/>
			<template v-if="bound && column" #help>
				Saved in the column {{ columnLabel }}
				<UButton
					v-if="label && label !== columnLabel"
					size="xs"
					variant="link"
					label="Use its name"
					class="p-0"
					@click="write('label', columnLabel)"
				/>
			</template>
		</UFormField>

		<UFormField v-if="'description' in schema" label="Help text">
			<UInput
				class="w-full"
				:model-value="text('description')"
				placeholder="Shown under the field — optional"
				@update:model-value="write('description', String($event))"
			/>
		</UFormField>

		<UFormField v-if="!bound || !column" label="Type">
			<USelectMenu
				class="w-full"
				:model-value="typeId"
				:items="dataTypes"
				value-key="value"
				placeholder="Choose a data type…"
				@update:model-value="setType($event)"
			/>
		</UFormField>

		<UFormField v-if="schema.defaultValue" label="Default value">
			<DmsBuilderOption
				name="defaultValue"
				:schema="schema.defaultValue"
				:model-value="entry.defaultValue"
				:typed-as="entry.type"
				hide-label
				@update:model-value="patch({ defaultValue: $event })"
			/>
		</UFormField>

		<div class="flex flex-col gap-2.5">
			<UFormField
				v-if="'required' in schema"
				label="Required"
				:description="
					locked
						? `The table can't save a row without it.`
						: `The form won't send without it.`
				"
				orientation="horizontal"
			>
				<USwitch
					:model-value="locked || entry.required === true"
					:disabled="locked"
					@update:model-value="write('required', $event === true ? true : undefined)"
				/>
			</UFormField>
			<UFormField
				v-if="'disabled' in schema"
				label="Read-only"
				description="Shown with its default value, not editable."
				orientation="horizontal"
			>
				<USwitch
					:model-value="entry.disabled === true"
					@update:model-value="write('disabled', $event === true ? true : undefined)"
				/>
			</UFormField>
			<UFormField
				v-if="'localized' in schema"
				label="Translatable"
				description="One value per language."
				orientation="horizontal"
			>
				<USwitch
					:model-value="entry.localized === true"
					@update:model-value="write('localized', $event === true ? true : undefined)"
				/>
			</UFormField>
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

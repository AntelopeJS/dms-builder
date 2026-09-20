<script setup lang="ts">
import { computed, watch } from 'vue'
import { descriptorOf, isRequired, optionLabel } from '../runtime/catalog'
import { mergePatch } from '../runtime/object'
import { useBuilder } from '../runtime/session'
import type { OptionSchema } from '../runtime/types'

const props = defineProps<{
	name: string
	schema: OptionSchema
	modelValue: unknown
	/** The resource a `field` widget resolves its choices against. */
	resource?: string
	/** The block being configured, so a data source can name its query. */
	blockName?: string
	/** Rule the row off from the switch above it, as a list of features reads. */
	separated?: boolean
	/**
	 * Leave the label row out: an entry of a list is already headed by its rank,
	 * and a second name for it — the option's own, with an index stuck to it —
	 * reads as another setting.
	 */
	hideLabel?: boolean
}>()

const emit = defineEmits<{
	'update:modelValue': [unknown]
	/**
	 * Several of the block's options at once.
	 *
	 * A data source writes both the URL it produced and the period scope the block
	 * follows: writing one without the other leaves a chart asking for bounds
	 * nobody sends, so they travel as one patch.
	 */
	patch: [Record<string, unknown>]
}>()

const builder = useBuilder()
const session = builder.session

const label = computed(() => optionLabel(props.name, props.schema))
const ui = computed(() => props.schema.ui ?? {})

/**
 * Whether the page needs this one filled in, and whether it still is not.
 *
 * Marked on the field itself, because the answer otherwise comes from the
 * compiler: a required option left empty is a generated page that does not
 * build, reported against a line of source the author never sees.
 */
const required = computed(() => isRequired(props.schema))
const unfilled = computed(
	() =>
		required.value &&
		(props.modelValue === undefined ||
			props.modelValue === null ||
			props.modelValue === ''),
)

const widget = computed(() => {
	if (props.schema['x-dataType']) return 'dataType'
	if (props.schema['x-component']) return 'block'
	if (ui.value.widget) return ui.value.widget
	if (props.schema.oneOf?.length) return 'oneOf'
	if (props.schema.enum) {
		return props.schema.enum.length <= 4 ? 'segmented' : 'select'
	}
	return props.schema.type
})

const enumItems = computed(() =>
	(props.schema.enum ?? []).map((value) => ({ label: String(value), value })),
)

const resourceItems = computed(() =>
	session.value.resources.map((entry) => ({
		label: entry.ref,
		value: entry.ref,
	})),
)

const dataTypeItems = computed(() =>
	(session.value.catalog?.dataTypes ?? []).map((entry) => ({
		label: entry.id,
		value: entry.id,
	})),
)

const blockTypeItems = computed(() =>
	(ui.value.blockTypes ?? []).map((type) => ({ label: type, value: type })),
)

const queryItems = computed(() =>
	(session.value.structure?.queries ?? []).map((query) => ({
		label: `${query.name} — ${query.endpoint}`,
		value: `${session.value.pageRef ?? ''}${query.endpoint}`,
	})),
)

const resourceFields = computed(
	() => session.value.resourceStructures[props.resource ?? '']?.fields ?? [],
)

// An option may need more than one aspect — a Kanban groups by a field it both
// reads off the listed row and filters each column with.
const requiredAspects = computed(() => {
	const declared = ui.value.fieldAspect
	if (!declared) {
		return []
	}
	return Array.isArray(declared) ? declared : [declared]
})

function carries(field: Record<string, unknown>): boolean {
	return requiredAspects.value.every((aspect) => field[aspect] === true)
}

function missingAspects(field: Record<string, unknown>): string[] {
	return requiredAspects.value.filter((aspect) => field[aspect] !== true)
}

const fieldItems = computed(() =>
	resourceFields.value
		.filter((field) => carries(field as unknown as Record<string, unknown>))
		.map((field) => ({ label: field.name, value: field.name })),
)

// A value already written that the field cannot honour: the table would accept
// the option and ignore it at runtime, so say so rather than let it pass.
const ineligible = computed(() => {
	const value = props.modelValue
	if (
		widget.value !== 'field' ||
		typeof value !== 'string' ||
		requiredAspects.value.length === 0
	) {
		return ''
	}
	const field = resourceFields.value.find((entry) => entry.name === value)
	if (!field) {
		return `"${value}" is not a field of this resource.`
	}
	const missing = missingAspects(field as unknown as Record<string, unknown>)
	return missing.length === 0
		? ''
		: `"${value}" is not ${missing.join(' or ')} — the table will ignore this.`
})

watch(
	() => props.resource,
	(ref) => {
		if (ref && widget.value === 'field') {
			void builder.loadResource(ref)
		}
	},
	{ immediate: true },
)

function set(value: unknown): void {
	emit('update:modelValue', value)
}

// Emptying a text box clears it; a select, an object or a list has no such
// gesture, so those keep an explicit way to unset the option.
const SELF_CLEARING = new Set([
	'text',
	'textarea',
	'url',
	'icon',
	'color',
	'number',
	'switch',
	'boolean',
])

const clearable = computed(
	() =>
		props.schema.optional === true &&
		props.modelValue !== undefined &&
		!SELF_CLEARING.has(String(widget.value)),
)

const isSwitch = computed(
	() => widget.value === 'switch' || widget.value === 'boolean',
)

const objectValue = computed(
	() => (props.modelValue ?? {}) as Record<string, unknown>,
)

function setProperty(key: string, value: unknown): void {
	set(mergePatch(objectValue.value, { [key]: value }))
}

const arrayValue = computed(() =>
	Array.isArray(props.modelValue) ? (props.modelValue as unknown[]) : [],
)

function setItem(index: number, value: unknown): void {
	const next = [...arrayValue.value]
	next[index] = value
	set(next)
}

function addItem(): void {
	set([...arrayValue.value, props.schema.items?.type === 'object' ? {} : ''])
}

function removeItem(index: number): void {
	set(arrayValue.value.filter((_, entry) => entry !== index))
}

function moveItem(index: number, delta: number): void {
	const next = [...arrayValue.value]
	const target = index + delta
	if (target < 0 || target >= next.length) return
	const [item] = next.splice(index, 1)
	next.splice(target, 0, item)
	set(next)
}

/* ---- sentinels ---------------------------------------------------------- */

const dataTypeValue = computed(
	() =>
		(props.modelValue ?? {}) as {
			$dataType?: string
			config?: Record<string, unknown>
		},
)

const dataTypeSchema = computed(
	() =>
		session.value.catalog?.dataTypes.find(
			(entry) => entry.id === dataTypeValue.value.$dataType,
		)?.config ?? {},
)

function setDataType(id: unknown): void {
	set({ $dataType: id, config: dataTypeValue.value.config ?? {} })
}

function setDataTypeConfig(key: string, value: unknown): void {
	set({
		$dataType: dataTypeValue.value.$dataType,
		config: mergePatch(dataTypeValue.value.config ?? {}, { [key]: value }),
	})
}

const blockValue = computed(
	() =>
		(
			(props.modelValue ?? {}) as {
				$block?: { type?: string; config?: Record<string, unknown> }
			}
		).$block ?? {},
)

const blockSchema = computed(
	() => descriptorOf(session.value.catalog, blockValue.value.type)?.config ?? {},
)

function setBlockType(type: unknown): void {
	set({ $block: { type, config: blockValue.value.config ?? {} } })
}

function setBlockConfig(key: string, value: unknown): void {
	set({
		$block: {
			type: blockValue.value.type,
			config: mergePatch(blockValue.value.config ?? {}, { [key]: value }),
		},
	})
}

/* ---- unions and raw JSON ------------------------------------------------ */

function branchLabel(branch: OptionSchema, index: number): string {
	const tag = props.schema.discriminator
	const value = branch.properties?.[tag ?? '']?.enum?.[0]
	return value === undefined ? `Option ${index + 1}` : String(value)
}

const branchIndex = computed(() => {
	const tag = props.schema.discriminator
	if (!tag) return 0
	const current = objectValue.value[tag]
	const found = props.schema.oneOf?.findIndex(
		(branch) => branch.properties?.[tag]?.enum?.[0] === current,
	)
	return found === undefined || found < 0 ? 0 : found
})

function selectBranch(index: unknown): void {
	const tag = props.schema.discriminator
	const branch = props.schema.oneOf?.[Number(index)]
	if (!tag || !branch) return
	set({ [tag]: branch.properties?.[tag]?.enum?.[0] })
}

const jsonText = computed(() =>
	props.modelValue === undefined
		? ''
		: JSON.stringify(props.modelValue, null, 2),
)

function setJson(text: string): void {
	if (!text.trim()) {
		set(undefined)
		return
	}
	try {
		set(JSON.parse(text))
	} catch {
		/* leave the value alone until the text parses */
	}
}

const nestedProperties = computed(() =>
	Object.entries(props.schema.properties ?? {}).filter(
		([, schema]) => !schema.ui?.hidden,
	),
)
</script>

<template>
	<div
		v-if="isSwitch"
		class="flex items-start gap-3 py-2.5"
		:class="separated ? 'border-t border-default' : ''"
	>
		<USwitch
			:model-value="modelValue === true"
			class="mt-0.5 shrink-0"
			@update:model-value="set($event)"
		/>
		<div class="min-w-0 flex-1">
			<p class="text-sm text-default">{{ label }}</p>
			<p v-if="schema.description" class="mt-0.5 text-xs text-dimmed">
				{{ schema.description }}
			</p>
		</div>
	</div>

	<div v-else class="flex flex-col gap-1.5">
		<div v-if="!hideLabel" class="flex items-center gap-2">
			<label class="text-sm font-medium text-default">
				{{ label }}
				<span v-if="required" class="text-warning" title="Required">*</span>
			</label>
			<UButton
				v-if="clearable"
				icon="i-ph-x"
				size="xs"
				color="neutral"
				variant="ghost"
				class="ml-auto"
				:aria-label="`Clear ${label}`"
				title="Clear"
				@click="set(undefined)"
			/>
		</div>

		<div v-if="widget === 'segmented'" class="flex flex-wrap gap-1">
			<UButton
				v-for="item in enumItems"
				:key="String(item.value)"
				:label="item.label"
				size="xs"
				:color="modelValue === item.value ? 'primary' : 'neutral'"
				:variant="modelValue === item.value ? 'soft' : 'outline'"
				@click="set(item.value)"
			/>
		</div>

		<USelectMenu
			v-else-if="widget === 'select'"
			:model-value="modelValue"
			:items="enumItems"
			value-key="value"
			placeholder="Choose…"
			@update:model-value="set($event)"
		/>

		<USelectMenu
			v-else-if="widget === 'resource'"
			:model-value="modelValue"
			:items="resourceItems"
			value-key="value"
			placeholder="Choose a resource…"
			@update:model-value="set($event)"
		/>

		<USelectMenu
			v-else-if="widget === 'field'"
			:model-value="modelValue"
			:items="fieldItems"
			value-key="value"
			:placeholder="resource ? 'Choose a field…' : 'Pick a resource first'"
			:disabled="!resource"
			@update:model-value="set($event)"
		/>

		<DmsBuilderDataSource
			v-else-if="widget === 'dataSource'"
			:model-value="modelValue"
			:response-shape="ui.responseShape"
			:period-option="ui.periodOption"
			:block-name="blockName ?? name"
			@patch="emit('patch', $event)"
		/>

		<div v-else-if="widget === 'query'" class="flex flex-col gap-1.5">
			<USelectMenu
				:model-value="modelValue"
				:items="queryItems"
				value-key="value"
				placeholder="Choose a query…"
				:disabled="!queryItems.length"
				@update:model-value="set($event)"
			/>
			<UInput
				:model-value="modelValue as string"
				size="sm"
				placeholder="or an endpoint, e.g. /api/stats/revenue"
				@update:model-value="set($event === '' ? undefined : $event)"
			/>
			<UButton
				size="xs"
				color="neutral"
				variant="link"
				class="self-start"
				label="Manage the queries"
				@click="builder.setView('query')"
			/>
		</div>

		<UInput
			v-else-if="widget === 'number'"
			type="number"
			:model-value="modelValue as number"
			:min="ui.min"
			:max="ui.max"
			:step="ui.step"
			@update:model-value="set($event === '' ? undefined : Number($event))"
		/>

		<div v-else-if="widget === 'range'" class="flex items-center gap-2">
			<input
				type="range"
				class="flex-1 accent-primary"
				:min="ui.min ?? 0"
				:max="ui.max ?? 1"
				:step="ui.step ?? 0.05"
				:value="Number(modelValue ?? ui.min ?? 0)"
				@input="set(Number(($event.target as HTMLInputElement).value))"
			>
			<span class="w-10 text-right text-xs text-muted">
				{{ modelValue ?? '—' }}
			</span>
		</div>

		<UTextarea
			v-else-if="widget === 'textarea'"
			:model-value="modelValue as string"
			:rows="3"
			@update:model-value="set($event === '' ? undefined : $event)"
		/>

		<UTextarea
			v-else-if="widget === 'json'"
			:model-value="jsonText"
			:rows="5"
			class="font-mono text-xs"
			placeholder="null"
			@update:model-value="setJson(String($event))"
		/>

		<div v-else-if="widget === 'dataType'" class="flex flex-col gap-2">
			<USelectMenu
				:model-value="dataTypeValue.$dataType"
				:items="dataTypeItems"
				value-key="value"
				placeholder="Choose a data type…"
				@update:model-value="setDataType($event)"
			/>
			<div
				v-if="Object.keys(dataTypeSchema).length"
				class="flex flex-col gap-3 border-l border-default pl-3"
			>
				<DmsBuilderOption
					v-for="[key, nested] in Object.entries(dataTypeSchema)"
					:key="key"
					:name="key"
					:schema="nested"
					:model-value="(dataTypeValue.config ?? {})[key]"
					:resource="resource"
					@update:model-value="setDataTypeConfig(key, $event)"
				/>
			</div>
		</div>

		<div v-else-if="widget === 'block'" class="flex flex-col gap-2">
			<USelectMenu
				:model-value="blockValue.type"
				:items="blockTypeItems"
				value-key="value"
				placeholder="Choose a block…"
				@update:model-value="setBlockType($event)"
			/>
			<div
				v-if="Object.keys(blockSchema).length"
				class="flex flex-col gap-3 border-l border-default pl-3"
			>
				<DmsBuilderOption
					v-for="[key, nested] in Object.entries(blockSchema).filter(
						([, entry]) => !entry.ui?.hidden,
					)"
					:key="key"
					:name="key"
					:schema="nested"
					:model-value="(blockValue.config ?? {})[key]"
					:resource="resource"
					@update:model-value="setBlockConfig(key, $event)"
				/>
			</div>
		</div>

		<div v-else-if="widget === 'oneOf'" class="flex flex-col gap-2">
			<div class="flex flex-wrap gap-1">
				<UButton
					v-for="(branch, index) in schema.oneOf ?? []"
					:key="index"
					:label="branchLabel(branch, index)"
					size="xs"
					:color="branchIndex === index ? 'primary' : 'neutral'"
					:variant="branchIndex === index ? 'soft' : 'outline'"
					@click="selectBranch(index)"
				/>
			</div>
			<div class="flex flex-col gap-3 border-l border-default pl-3">
				<DmsBuilderOption
					v-for="[key, nested] in Object.entries(
						(schema.oneOf ?? [])[branchIndex]?.properties ?? {},
					).filter(([entryKey]) => entryKey !== schema.discriminator)"
					:key="key"
					:name="key"
					:schema="nested"
					:model-value="objectValue[key]"
					:resource="resource"
					@update:model-value="setProperty(key, $event)"
				/>
			</div>
		</div>

		<div v-else-if="widget === 'array'" class="flex flex-col gap-2">
			<div
				v-for="(item, index) in arrayValue"
				:key="index"
				class="rounded-md border border-default p-2"
			>
				<div class="mb-1 flex items-center gap-1">
					<span class="text-xs text-dimmed">#{{ index + 1 }}</span>
					<div class="ml-auto flex gap-0.5">
						<UButton
							icon="i-ph-arrow-up"
							size="xs"
							color="neutral"
							variant="ghost"
							aria-label="Move up"
							@click="moveItem(index, -1)"
						/>
						<UButton
							icon="i-ph-arrow-down"
							size="xs"
							color="neutral"
							variant="ghost"
							aria-label="Move down"
							@click="moveItem(index, 1)"
						/>
						<UButton
							icon="i-ph-trash"
							size="xs"
							color="error"
							variant="ghost"
							aria-label="Remove"
							@click="removeItem(index)"
						/>
					</div>
				</div>
				<DmsBuilderOption
					v-if="schema.items"
					:name="`${name}.${index}`"
					:schema="schema.items"
					:model-value="item"
					:resource="resource"
					hide-label
					@update:model-value="setItem(index, $event)"
				/>
			</div>
			<UButton
				icon="i-ph-plus"
				size="xs"
				color="neutral"
				variant="outline"
				label="Add"
				@click="addItem"
			/>
		</div>

		<div
			v-else-if="widget === 'object' && nestedProperties.length"
			class="flex flex-col gap-3 border-l border-default pl-3"
		>
			<DmsBuilderOption
				v-for="[key, nested] in nestedProperties"
				:key="key"
				:name="key"
				:schema="nested"
				:model-value="objectValue[key]"
				:resource="resource"
				@update:model-value="setProperty(key, $event)"
			/>
		</div>

		<UTextarea
			v-else-if="widget === 'object' || widget === 'record' || widget === 'unknown'"
			:model-value="jsonText"
			:rows="4"
			class="font-mono text-xs"
			@update:model-value="setJson(String($event))"
		/>

		<DmsBuilderIconInput
			v-else-if="widget === 'icon'"
			:model-value="modelValue as string"
			:placeholder="ui.placeholder"
			@update:model-value="set($event)"
		/>

		<UInput
			v-else
			:model-value="modelValue as string"
			:placeholder="ui.placeholder"
			@update:model-value="set($event === '' ? undefined : $event)"
		/>

		<p v-if="unfilled" class="text-xs text-warning">
			Required — the page cannot be built until this is filled in.
		</p>
		<p v-else-if="ineligible" class="text-xs text-warning">{{ ineligible }}</p>
		<p v-else-if="schema.description" class="text-xs text-dimmed">
			{{ schema.description }}
		</p>
	</div>
</template>

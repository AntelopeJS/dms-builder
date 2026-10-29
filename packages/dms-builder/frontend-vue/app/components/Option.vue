<script setup lang="ts">
import { THEME_COLORS } from '../runtime/constants'
import { displayText } from '../runtime/i18n'
import type { OptionSchema } from '../runtime/types'
import { codeSpans } from '../runtime/inline-code'
import { type Props, type Emits, CODE_CLASS } from '../build/Option'
import { useOptionPart1 } from '../build/OptionPart1'
import { useOptionPart2 } from '../build/OptionPart2'

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const optionPart1 = useOptionPart1({ props, emit })
const { label, ui, iconFallback, required, unfilled, keyedEntries, typed, typedValue, typedText, typedNumber, widget, pageLink, linkTargets, linkedTo, enumItems, setEntry, resourceItems, controllerRef, setController, dataTypeChoices, blockTypeItems, fieldItems, ineligible, set, clearable, colorText, isSwitch, isOn, objectValue, arrayValue, setItem, entryKinds, entrySchema, entryKind, addItem, removeItem, moveItem } = optionPart1
const optionPart2 = useOptionPart2({ props, ...optionPart1 })
const { setProperty, dataTypeValue, dataTypeSchema, setDataType, setDataTypeConfig, blockValue, blockOptions, setBlockType, setBlockConfig, patchBlockConfig, branchLabels, picked, branchIndex, branchProperties, branchValueSchema, selectBranch, jsonText, setJson, nestedProperties } = optionPart2
</script>

<template>
	<div
		v-if="isSwitch"
		class="flex items-start gap-3 py-2.5"
		:class="separated ? 'border-t border-default' : ''"
	>
		<USwitch
			:model-value="isOn"
			class="mt-0.5 shrink-0"
			@update:model-value="set($event)"
		/>
		<div class="min-w-0 flex-1">
			<p class="text-sm text-default">{{ label }}</p>
			<p v-if="schema.description" class="mt-0.5 text-xs text-dimmed">
				<template v-for="(part, at) in codeSpans(schema.description)" :key="at">
					<code v-if="part.code" :class="CODE_CLASS">{{ part.text }}</code>
					<template v-else>{{ part.text }}</template>
				</template>
			</p>
		</div>
	</div>

	<div v-else class="flex flex-col gap-1.5">
		<div v-if="!hideLabel" class="flex items-center gap-2">
			<label class="text-sm font-medium text-default">
				{{ label }}
				<span v-if="required && !parentUnset" class="text-warning" title="Required">*</span>
			</label>
			<UButton
				v-if="clearable"
				icon="i-ph-x-light"
				size="xs"
				color="neutral"
				variant="ghost"
				class="ml-auto"
				:aria-label="`Clear ${label}`"
				title="Clear"
				@click="set(undefined)"
			/>
		</div>

		<DmsSegmented
			v-if="widget === 'segmented'"
			:model-value="modelValue as string"
			:items="enumItems as { label: string; value: string }[]"
			:aria-label="label"
			size="xs"
			class="self-start"
			@update:model-value="set($event)"
		/>

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
			v-else-if="widget === 'controller'"
			:model-value="controllerRef"
			:items="resourceItems"
			value-key="value"
			placeholder="Choose a table…"
			@update:model-value="setController($event)"
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

		<!-- Keyed by the block, whose source it reads once: shared between two
		blocks, it would show the first one's source on the second. -->
		<DmsBuilderDataSource
			v-else-if="widget === 'dataSource'"
			:key="blockName ?? name"
			:model-value="modelValue"
			:response-shape="ui.responseShape"
			:period-option="ui.periodOption"
			:block-name="blockName ?? name"
			@patch="emit('patch', $event)"
		/>

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

		<template v-else-if="widget === 'typed' && typed">
			<USelectMenu
				v-if="typed.kind === 'select'"
				:model-value="typedValue"
				:items="typed.items"
				value-key="value"
				:multiple="typed.multiple"
				placeholder="Choose…"
				@update:model-value="set($event ?? undefined)"
			/>
			<UTextarea
				v-else-if="typed.kind === 'longText'"
				:model-value="typedText"
				:rows="3"
				@update:model-value="set($event === '' ? undefined : $event)"
			/>
			<UInput
				v-else-if="typed.kind === 'number'"
				type="number"
				:model-value="typedNumber"
				@update:model-value="set($event === '' ? undefined : Number($event))"
			/>
			<UInput
				v-else
				:type="typed.kind === 'date' ? 'date' : typed.kind === 'time' ? 'time' : 'text'"
				:model-value="typedText"
				@update:model-value="set($event === '' ? undefined : $event)"
			/>
		</template>

		<UTextarea
			v-else-if="widget === 'json'"
			:model-value="jsonText"
			:rows="5"
			class="font-mono text-xs"
			:placeholder="ui.placeholder"
			@update:model-value="setJson(String($event))"
		/>

		<div v-else-if="widget === 'dataType'" class="flex flex-col gap-2">
			<USelectMenu
				:model-value="dataTypeValue.$dataType"
				:items="dataTypeChoices"
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
				v-if="blockOptions.length"
				class="flex flex-col gap-3 border-l border-default pl-3"
			>
				<DmsBuilderOption
					v-for="[key, nested] in blockOptions"
					:key="key"
					:name="key"
					:schema="nested"
					:model-value="(blockValue.config ?? {})[key]"
					:resource="resource"
					@update:model-value="setBlockConfig(key, $event)"
					@patch="patchBlockConfig($event)"
				/>
			</div>
		</div>

		<div v-else-if="widget === 'oneOf'" class="flex flex-col gap-2">
			<div class="flex flex-wrap gap-1">
				<UButton
					v-for="(branch, index) in schema.oneOf ?? []"
					:key="index"
					:label="branchLabels[index]"
					size="xs"
					:color="branchIndex === index ? 'primary' : 'neutral'"
					:variant="branchIndex === index ? 'soft' : 'outline'"
					@click="selectBranch(index)"
				/>
			</div>
			<div
				v-if="branchProperties.length || branchValueSchema"
				class="flex flex-col gap-3 border-l border-default pl-3"
			>
				<DmsBuilderOption
					v-for="[key, nested] in branchProperties"
					:key="key"
					:name="key"
					:schema="nested"
					:model-value="objectValue[key]"
					:typed-as="nested.ui?.typedBy ? objectValue[nested.ui.typedBy] : undefined"
					:resource="resource"
					@update:model-value="setProperty(key, $event)"
				/>
				<!-- A branch of a plain kind holds the whole value, so it is edited
				as this option rather than property by property. -->
				<DmsBuilderOption
					v-if="!branchProperties.length && branchValueSchema"
					:name="name"
					:schema="branchValueSchema"
					:model-value="modelValue"
					:resource="resource"
					hide-label
					@update:model-value="set($event)"
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
					<span class="text-xs text-dimmed">
						#{{ index + 1 }}
						<template v-if="entryKind(item)">· {{ entryKind(item) }}</template>
					</span>
					<div class="ml-auto flex gap-0.5">
						<UButton
							icon="i-ph-arrow-up-light"
							size="xs"
							color="neutral"
							variant="ghost"
							aria-label="Move up"
							@click="moveItem(index, -1)"
						/>
						<UButton
							icon="i-ph-arrow-down-light"
							size="xs"
							color="neutral"
							variant="ghost"
							aria-label="Move down"
							@click="moveItem(index, 1)"
						/>
						<UButton
							icon="i-ph-trash-light"
							size="xs"
							color="error"
							variant="ghost"
							aria-label="Remove"
							@click="removeItem(index)"
						/>
					</div>
				</div>
				<DmsBuilderOption
					v-if="entrySchema(item)"
					:name="`${name}.${index}`"
					:schema="entrySchema(item)!"
					:model-value="item"
					:resource="resource"
					hide-label
					@update:model-value="setItem(index, $event)"
				/>
			</div>
			<div v-if="entryKinds" class="flex flex-wrap gap-1">
				<UButton
					v-for="kind in entryKinds"
					:key="kind.index"
					icon="i-ph-plus-light"
					size="xs"
					color="neutral"
					variant="outline"
					:label="`Add ${kind.label.toLowerCase()}`"
					@click="addItem(kind.index)"
				/>
			</div>
			<UButton
				v-else
				icon="i-ph-plus-light"
				size="xs"
				color="neutral"
				variant="outline"
				label="Add"
				@click="addItem()"
			/>
		</div>

		<!-- Left empty, an entry keeps the block's own wording, which is what
		the placeholder shows. -->
		<div v-else-if="widget === 'keyed'" class="flex flex-col gap-1.5">
			<div
				v-for="entry in keyedEntries"
				:key="entry.key"
				class="grid grid-cols-5 items-center gap-2"
			>
				<span class="col-span-2 truncate text-xs text-muted">{{ entry.label }}</span>
				<UInput
					:model-value="String(objectValue[entry.key] ?? '')"
					size="sm"
					class="col-span-3"
					:placeholder="entry.label"
					:aria-label="`${label}: ${entry.label}`"
					@update:model-value="setEntry(entry.key, String($event))"
				/>
			</div>
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
				:typed-as="nested.ui?.typedBy ? objectValue[nested.ui.typedBy] : undefined"
				:parent-unset="modelValue === undefined"
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

		<div v-else-if="widget === 'color'" class="flex flex-col gap-1.5">
			<div class="flex flex-wrap gap-1">
				<UButton
					v-for="color in THEME_COLORS"
					:key="color"
					:label="color"
					:color="color"
					size="xs"
					:variant="modelValue === color ? 'solid' : 'soft'"
					@click="set(modelValue === color ? undefined : color)"
				/>
			</div>
			<UInput
				:model-value="colorText"
				size="sm"
				:placeholder="ui.placeholder ?? 'or primary-600, #1f7aec…'"
				@update:model-value="set($event === '' ? undefined : $event)"
			/>
		</div>

		<!-- Picked by sight, as a page's icon is: the tile is the choice, and the
		name only shows once the search beside it is open. -->
		<DmsBuilderIconPicker
			v-else-if="widget === 'icon'"
			:model-value="typeof modelValue === 'string' ? modelValue : undefined"
			:fallback="iconFallback"
			:label="`Choose the ${label.toLowerCase()}`"
			class="self-start"
			@update:model-value="set($event)"
		/>

		<!-- Typed, for an anchor or a site elsewhere; or picked among the pages by
		name, which writes the page's address. -->
		<div v-else-if="pageLink" class="flex flex-col gap-1">
			<div class="flex gap-1.5">
				<UInput
					:model-value="modelValue as string"
					:placeholder="ui.placeholder ?? '/a/page, #anchor or https://…'"
					class="min-w-0 flex-1"
					@update:model-value="set($event === '' ? undefined : $event)"
				/>
				<UDropdownMenu
					:items="linkTargets"
					:content="{ align: 'end' }"
					:ui="{ content: 'max-h-72 min-w-48' }"
				>
					<UButton
						icon="i-ph-files-light"
						color="neutral"
						variant="outline"
						:aria-label="`Link to a page: ${label}`"
						title="Pick a page"
					/>
				</UDropdownMenu>
			</div>
			<p v-if="linkedTo" class="flex items-center gap-1 text-xs text-muted">
				<UIcon :name="linkedTo.icon ?? 'i-ph-file-light'" class="size-3.5" />
				Leads to {{ displayText(linkedTo.displayName) }}
			</p>
		</div>

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
		<!-- An icon is picked by sight; how its name is spelled is the picker's
		to say, when one is typed. -->
		<p v-else-if="schema.description && widget !== 'icon'" class="text-xs text-dimmed">
			<template v-for="(part, at) in codeSpans(schema.description)" :key="at">
				<code v-if="part.code" :class="CODE_CLASS">{{ part.text }}</code>
				<template v-else>{{ part.text }}</template>
			</template>
		</p>
	</div>
</template>

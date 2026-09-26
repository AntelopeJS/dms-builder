<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
	branchKind,
	branchOf,
	dataTypeItems,
	descriptorOf,
	entryName,
	fitsAsWell,
	heldBlockOptions,
	isRequired,
	offeredIn,
	optionLabel,
	seededDataTypes,
	switchOn,
	valueKind,
	visibleNameKey,
} from '../runtime/catalog'
import { THEME_COLORS } from '../runtime/constants'
import { useBuilderMode } from '../runtime/mode'
import { fitsEditor, typedEditor } from '../runtime/typed-values'
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
	/**
	 * The data type a sibling option holds, for an option typed by it: a form
	 * field's default takes the input the field's own type calls for.
	 */
	typedAs?: unknown
	/**
	 * Whether the object holding this option is itself left unset: a bound of a
	 * range nobody asked for is not one the page is missing.
	 */
	parentUnset?: boolean
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
const { advanced } = useBuilderMode()

/** Whether the panel shows an option at all: never one the block hides. */
function shown(schema: OptionSchema): boolean {
	return !schema.ui?.hidden && offeredIn(schema, advanced.value)
}
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
		!props.parentUnset &&
		(props.modelValue === undefined ||
			props.modelValue === null ||
			props.modelValue === ''),
)

/** An enum value under the name its block gives it, or as it is spelled. */
function valueLabel(schema: OptionSchema, value: unknown): string {
	return schema.ui?.valueLabels?.[String(value)] ?? String(value)
}

/**
 * The entries of a record whose keys come from a closed set and whose values
 * are text, such as a period selector's range labels: one line per key, each
 * with its own box, rather than an object typed by hand.
 */
const keyedEntries = computed(() => {
	const keys = props.schema.keys
	if (
		props.schema.type !== 'record' ||
		!keys?.enum?.length ||
		props.schema.values?.type !== 'string'
	) {
		return undefined
	}
	return keys.enum.map((key) => ({
		key: String(key),
		label: valueLabel(keys, key),
	}))
})

/** The input a value typed by a sibling's data type takes, when there is one. */
const typed = computed(() =>
	ui.value.typedBy ? typedEditor(props.typedAs) : undefined,
)
/**
 * The value as the input can show it. One of another kind — a default left
 * from the type the field had before — is shown as nothing rather than as
 * something the input would mangle.
 */
const typedValue = computed(() =>
	typed.value && fitsEditor(props.modelValue, typed.value)
		? props.modelValue
		: undefined,
)
const typedText = computed(() =>
	typeof typedValue.value === 'string' ? typedValue.value : '',
)
const typedNumber = computed(() =>
	typeof typedValue.value === 'number' ? typedValue.value : undefined,
)

const widget = computed(() => {
	if (props.schema['x-dataType']) return 'dataType'
	if (props.schema['x-component']) return 'block'
	if (props.schema['x-controller']) return 'controller'
	if (typed.value) return typed.value.kind === 'switch' ? 'switch' : 'typed'
	if (ui.value.widget) return ui.value.widget
	if (props.schema.oneOf?.length) return 'oneOf'
	if (props.schema.enum) {
		return props.schema.enum.length <= 4 ? 'segmented' : 'select'
	}
	if (keyedEntries.value) return 'keyed'
	return props.schema.type
})

const enumItems = computed(() =>
	(props.schema.enum ?? []).map((value) => ({
		label: valueLabel(props.schema, value),
		value,
	})),
)

function setEntry(key: string, text: string): void {
	const next = { ...objectValue.value }
	if (text === '') {
		delete next[key]
	} else {
		next[key] = text
	}
	set(Object.keys(next).length ? next : undefined)
}

const resourceItems = computed(() =>
	session.value.resources.map((entry) => ({
		label: entry.ref,
		value: entry.ref,
	})),
)

/**
 * The table a `controller` option names. The page is handed the table's
 * DataAPI class, so what the option holds is a reference to the resource the
 * builder writes that class from, never the name typed in as text.
 */
const controllerRef = computed(
	() =>
		(props.modelValue as { $ref?: { resource?: string } } | undefined)?.$ref
			?.resource,
)

function setController(resource: string | undefined): void {
	set(resource ? { $ref: { resource } } : undefined)
}

const dataTypeChoices = computed(() => dataTypeItems(session.value.catalog))

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
	'keyed',
])

const clearable = computed(
	() =>
		props.schema.optional === true &&
		props.modelValue !== undefined &&
		!SELF_CLEARING.has(String(widget.value)),
)

/**
 * Beside the theme's colours, anything else — a shade, a hex code, a CSS
 * variable — is typed in. A palette of several is written as a list; the text
 * box shows one.
 */
const colorText = computed(() =>
	typeof props.modelValue === 'string' ? props.modelValue : '',
)

const isSwitch = computed(
	() => widget.value === 'switch' || widget.value === 'boolean',
)
const isOn = computed(() => switchOn(props.modelValue, props.schema))

const objectValue = computed(
	() => (props.modelValue ?? {}) as Record<string, unknown>,
)

function setProperty(key: string, value: unknown): void {
	set(mergePatch(objectValue.value, { [key]: value, ...droppedWith(key, value) }))
}

/**
 * What a new data type leaves no room for: a default of the old type's kind,
 * which the field could not hold any more. One the new type has no input for
 * is kept, since nothing says it no longer fits.
 */
function droppedWith(key: string, value: unknown): Record<string, undefined> {
	const properties = props.schema.properties ?? branchSchema.value?.properties ?? {}
	const dropped: Record<string, undefined> = {}
	for (const [other, schema] of Object.entries(properties)) {
		const editor = schema.ui?.typedBy === key ? typedEditor(value) : undefined
		const current = objectValue.value[other]
		if (editor && current !== undefined && !fitsEditor(current, editor)) {
			dropped[other] = undefined
		}
	}
	return dropped
}

const arrayValue = computed(() =>
	Array.isArray(props.modelValue) ? (props.modelValue as unknown[]) : [],
)

function setItem(index: number, value: unknown): void {
	const next = [...arrayValue.value]
	next[index] = value
	set(next)
}

/**
 * What a fresh entry of this list starts as.
 *
 * A union names no kind of its own — its branches do — so a list of objects
 * declared as one was seeded with a string, which no branch could carry: the
 * panel fell back to its first branch and the entry was edited as whatever
 * that branch happened to be.
 *
 * An entry the page renders is seeded with a name taken from the list itself,
 * so a form's third field arrives as “Field 3” rather than as a blank label
 * the author has to notice is there at all — and as Text, until another type
 * is chosen.
 */
/**
 * The kinds of entry a list takes, when it takes more than one kind of object:
 * a form's fields are fields or groups of them.
 *
 * Each is added by a button of its own and stays what it was added as. A switch
 * between the two on every entry asked, of someone who had just added a field,
 * whether it was a field.
 */
const entryKinds = computed(() => {
	const branches = props.schema.items?.oneOf ?? []
	if (branches.length < 2 || !branches.every((branch) => branch.type === 'object')) {
		return undefined
	}
	return branches.map((branch, index) => ({
		index,
		label: branch.ui?.label ?? `Entry ${index + 1}`,
	}))
})

/** The branch an entry of a list of several kinds is, read off what it holds. */
function entrySchema(item: unknown): OptionSchema | undefined {
	const items = props.schema.items
	if (!entryKinds.value || !items?.oneOf) {
		return items
	}
	return items.oneOf[branchOf(items.oneOf, item)] ?? items
}

/** What an entry of a list of several kinds is, said at the head of it. */
function entryKind(item: unknown): string | undefined {
	const schema = entrySchema(item)
	return entryKinds.value && schema?.ui?.label ? schema.ui.label : undefined
}

function blankItem(branch?: number): unknown {
	const items = props.schema.items
	if (!items) {
		return ''
	}
	const branches = items.oneOf ?? []
	const kinds = branches.length ? branches.map((entry) => entry.type) : [items.type]
	if (!kinds.every((kind) => kind === 'object')) {
		return ''
	}
	const entry = branches.length
		? branches[branch ?? branchOf(branches, {})]
		: items
	if (!entry) {
		return {}
	}
	const named = visibleNameKey(entry)
	// Named and counted after its own kind in a list of several: the first
	// group added to a form's fields is “Group 1”, whatever it follows.
	const noun = branch !== undefined ? (entry.ui?.label ?? label.value) : label.value
	const rank =
		branch !== undefined
			? arrayValue.value.filter((item) => branchOf(branches, item) === branch)
					.length + 1
			: arrayValue.value.length + 1
	return {
		...(named ? { [named]: entryName(noun, rank) } : {}),
		...seededLists(entry),
		...seededDataTypes(entry, session.value.catalog),
	}
}

/**
 * The lists an entry cannot do without, opened empty.
 *
 * What makes a group a group is the list of fields it holds: an entry added as
 * one and seeded without it would read as a field the moment it was drawn.
 */
function seededLists(entry: OptionSchema): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(entry.properties ?? {})
			.filter(([, schema]) => schema.type === 'array' && isRequired(schema))
			.map(([key]) => [key, []]),
	)
}

function addItem(branch?: number): void {
	set([...arrayValue.value, blankItem(branch)])
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
const blockOptions = computed(() =>
	heldBlockOptions(props.schema, blockSchema.value, advanced.value),
)

function setBlockType(type: unknown): void {
	set({ $block: { type, config: blockValue.value.config ?? {} } })
}

function setBlockConfig(key: string, value: unknown): void {
	patchBlockConfig({ [key]: value })
}

/**
 * Several of the nested block's options at once — a data source writes its URL
 * and the period it follows together. Left unhandled here, that patch never
 * reached the block: the query was saved and the chart never pointed at it.
 */
function patchBlockConfig(patch: Record<string, unknown>): void {
	set({
		$block: {
			type: blockValue.value.type,
			config: mergePatch(blockValue.value.config ?? {}, patch),
		},
	})
}

/* ---- unions and raw JSON ------------------------------------------------ */

/** What a kind is called to someone who does not write the type down. */
const BRANCH_NAMES: Record<string, string> = {
	string: 'Text',
	number: 'Number',
	integer: 'Number',
	boolean: 'Yes or no',
	array: 'List',
	object: 'Details',
}

/**
 * What a branch of a union is called in the panel.
 *
 * A discriminated union names its own: the literal its tag carries is the word
 * the author knows it by. A union of plain kinds has no such word, so the kind
 * itself is the only honest name — “Text”, “Number” — rather than a rank that
 * says nothing about what picking it would do.
 */
function branchLabel(branch: OptionSchema, index: number): string {
	const tag = props.schema.discriminator
	const tagged = tag ? branch.properties?.[tag]?.enum?.[0] : undefined
	if (tagged !== undefined) {
		return String(tagged)
	}
	return (
		branch.ui?.label ?? BRANCH_NAMES[String(branch.type)] ?? `Option ${index + 1}`
	)
}

/**
 * The names the branches go by, told apart.
 *
 * Two branches of one kind that the block names neither of would both be
 * called after that kind, and two tabs saying the same word read as one. The
 * block's own names are the fix; numbering them is what keeps the panel honest
 * until it has them.
 */
const branchLabels = computed(() => {
	const labels = (props.schema.oneOf ?? []).map(branchLabel)
	return labels.map((label, index) => {
		const same = labels.filter((other) => other === label)
		if (same.length < 2) {
			return label
		}
		const rank = labels.slice(0, index + 1).filter((other) => other === label).length
		return `${label} ${rank}`
	})
})

/**
 * Which branch the panel is on.
 *
 * A tag answers it outright. Without one, the value itself does — its kind,
 * then how much of a branch it fills in — and the branch the author last asked
 * for settles what the value leaves open, which is the only record of a choice
 * an untagged union leaves behind.
 */
const picked = ref<number | null>(null)
const branches = computed(() => props.schema.oneOf ?? [])
const branchIndex = computed(() => {
	const tag = props.schema.discriminator
	if (!tag) {
		// The branch that was asked for holds as long as nothing fits better: an
		// object half filled in fits every object branch alike, and snapping to the
		// first of them would undo the choice at the first keystroke.
		if (
			picked.value !== null &&
			fitsAsWell(branches.value, picked.value, props.modelValue)
		) {
			return picked.value
		}
		const found = branchOf(branches.value, props.modelValue)
		return found === -1 ? (picked.value ?? 0) : found
	}
	const current = objectValue.value[tag]
	const found = props.schema.oneOf?.findIndex(
		(branch) => branch.properties?.[tag]?.enum?.[0] === current,
	)
	return found === undefined || found < 0 ? 0 : found
})

const branchSchema = computed(() => (props.schema.oneOf ?? [])[branchIndex.value])
const branchProperties = computed(() =>
	Object.entries(branchSchema.value?.properties ?? {}).filter(
		([key, nested]) => key !== props.schema.discriminator && shown(nested),
	),
)
/**
 * A branch that is a plain kind is edited as the option itself, so it inherits
 * whether the option had to be filled in at all: the branch says nothing about
 * that, and marking it required would contradict the union above it.
 */
const branchValueSchema = computed(() =>
	branchSchema.value
		? { ...branchSchema.value, optional: props.schema.optional }
		: undefined,
)

function selectBranch(index: unknown): void {
	const at = Number(index)
	const branch = props.schema.oneOf?.[at]
	if (!branch) {
		return
	}
	const tag = props.schema.discriminator
	if (tag) {
		set({ [tag]: branch.properties?.[tag]?.enum?.[0] })
		return
	}
	picked.value = at
	// A value of another kind is not one this branch can carry, and leaving it
	// would show an editor for one thing while the page holds another.
	if (branchKind(branch) !== valueKind(props.modelValue)) {
		set(undefined)
		return
	}
	if (!branch.properties) {
		return
	}
	// Between branches of the same kind, what they share is worth keeping and
	// what only the branch left behind knows is not: a property of its own left
	// on the value is exactly what would pull the panel back to it.
	const known = new Set(Object.keys(branch.properties))
	const kept = Object.fromEntries(
		Object.entries(objectValue.value).filter(([key]) => known.has(key)),
	)
	if (Object.keys(kept).length !== Object.keys(objectValue.value).length) {
		set(kept)
	}
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
	Object.entries(props.schema.properties ?? {}).filter(([, schema]) =>
		shown(schema),
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
			:model-value="isOn"
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
					icon="i-ph-plus"
					size="xs"
					color="neutral"
					variant="outline"
					:label="`Add ${kind.label.toLowerCase()}`"
					@click="addItem(kind.index)"
				/>
			</div>
			<UButton
				v-else
				icon="i-ph-plus"
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

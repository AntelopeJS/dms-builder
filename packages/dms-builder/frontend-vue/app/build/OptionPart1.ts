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
import { useBuilderMode } from '../runtime/mode'
import { fitsEditor, typedEditor } from '../runtime/typed-values'
import { mergePatch } from '../runtime/object'
import { useBuilder } from '../runtime/session'
import type { OptionSchema } from '../runtime/types'
import { enumColour } from '../runtime/value-labels'
import { linkedPage, linksToPage, pageLinkItems } from '../runtime/page-links'
import {
	valueLabel,
	SELF_CLEARING,
	seededLists,
	BRANCH_NAMES,
	type Props,
	type EmitFn,
} from './Option'

export function useOptionPart1(scope: { props: Readonly<Props>; emit: EmitFn }) {
	const { props, emit } = scope

const builder = useBuilder()
const { advanced } = useBuilderMode()

/** Whether the panel shows an option at all: never one the block hides. */
function shown(schema: OptionSchema): boolean {
	return !schema.ui?.hidden && offeredIn(schema, advanced.value)
}
const session = builder.session

const label = computed(() => optionLabel(props.name, props.schema))
const ui = computed(() => props.schema.ui ?? {})
/** What an icon option's tile shows while none is picked, when it names one. */
const iconFallback = computed(() =>
	typeof ui.value.placeholder === 'string' && ui.value.placeholder.startsWith('i-')
		? ui.value.placeholder
		: undefined,
)

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

/** A link a reader follows to another page: the project's pages beside the box. */
const pageLink = computed(() => linksToPage(props.name, widget.value))
const linkTargets = computed(() =>
	pageLinkItems(session.value.pages).map((item) => ({
		label: item.label,
		icon: item.icon,
		onSelect: () => set(item.ref),
	})),
)
const linkedTo = computed(() => linkedPage(session.value.pages, props.modelValue))

/** Each choice in words, and a tone drawn in its own colour. */
const enumItems = computed(() =>
	(props.schema.enum ?? []).map((value) => {
		const colour = enumColour(value)
		return {
			label: valueLabel(props.schema, value),
			value,
			...(colour ? { chip: { color: colour } } : {}),
		}
	}),
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
	return {
		builder,
		advanced,
		shown,
		session,
		label,
		ui,
		iconFallback,
		required,
		unfilled,
		keyedEntries,
		typed,
		typedValue,
		typedText,
		typedNumber,
		widget,
		pageLink,
		linkTargets,
		linkedTo,
		enumItems,
		setEntry,
		resourceItems,
		controllerRef,
		setController,
		dataTypeChoices,
		blockTypeItems,
		resourceFields,
		requiredAspects,
		carries,
		missingAspects,
		fieldItems,
		ineligible,
		set,
		clearable,
		colorText,
		isSwitch,
		isOn,
		objectValue,
		setProperty,
		droppedWith,
		arrayValue,
		setItem,
		entryKinds,
		entrySchema,
		entryKind,
		blankItem,
		addItem,
		removeItem,
		moveItem,
		dataTypeValue,
		dataTypeSchema,
		setDataType,
		setDataTypeConfig,
		blockValue,
		blockSchema,
		blockOptions,
		setBlockType,
		setBlockConfig,
		patchBlockConfig,
		branchLabel,
		branchLabels,
		picked,
		branches,
		branchIndex,
		branchSchema,
		branchProperties,
		branchValueSchema,
		selectBranch,
		jsonText,
		setJson,
		nestedProperties,
	}
}

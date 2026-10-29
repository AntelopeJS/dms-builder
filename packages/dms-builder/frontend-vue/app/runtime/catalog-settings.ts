import {
	DATA_TYPE_FAMILIES,
	DATA_TYPES,
	DEFAULT_DATA_TYPE,
	OTHER_DATA_TYPE_ICON,
} from './constants'
import { isRecord } from './object'
import type {
	BlockCatalog,
	BlockDraft,
	BlockTypeDescriptor,
	OptionSchema,
} from './types'
import {
	optionLabel,
	isRequired,
	branchOf,
	panelConfig,
} from './catalog-options'

/** Between the steps naming a nested setting: `Cards 1 · Title`. */
const SETTING_PATH_SEPARATOR = ' · '

/** One setting still to fill in, addressed and named the way the panel is. */
export interface MissingSetting {
	/** The keys walked from the block's own options, array indices included. */
	path: string[]
	/** What the panel calls it: `Tabs 2 · Label` for a tab with no title. */
	label: string
}

/**
 * Walk one option against the value it holds, down to the leaf that is empty.
 *
 * A required option nested in a list — the title of the third tab — is as
 * unbuildable as a required option of the block itself, and the compiler is the
 * one that says so today, in terms of the generated source. Reading the same
 * gap off the schema is what lets the panel mark the field instead.
 */
function collectMissing(
	schema: OptionSchema,
	value: unknown,
	path: string[],
	labels: string[],
	found: MissingSetting[],
): void {
	if (value === undefined || value === null || value === '') {
		if (isRequired(schema)) {
			found.push({ path, label: labels.join(SETTING_PATH_SEPARATOR) })
		}
		return
	}
	// A union carries no properties of its own; the branch the value belongs to
	// does, and it is the branch the panel edits the value as. Reading gaps off
	// any other branch would mark settings the author is not being shown.
	if (schema.oneOf?.length) {
		const at = branchOf(schema.oneOf, value)
		if (at !== -1) {
			collectMissing(schema.oneOf[at]!, value, path, labels, found)
		}
		return
	}
	if (schema.properties && isRecord(value)) {
		for (const [key, nested] of Object.entries(schema.properties)) {
			if (nested.ui?.hidden) {
				continue
			}
			collectMissing(
				nested,
				value[key],
				[...path, key],
				[...labels, optionLabel(key, nested)],
				found,
			)
		}
		return
	}
	const items = schema.items
	if (items && Array.isArray(value)) {
		value.forEach((entry, index) => {
			collectMissing(
				items,
				entry,
				[...path, String(index)],
				[`${labels.join(SETTING_PATH_SEPARATOR)} ${index + 1}`],
				found,
			)
		})
	}
}

/**
 * What still has to be filled in before the block renders: every required
 * option left empty, however deep, plus the resource a controller-leading block
 * reads from.
 */
/**
 * The setting naming the table a block reads. Not one of its options: the
 * block's controller, which a missing setting and a panel name all the same.
 */
export const CONTROLLER_SETTING = 'controller'

export function missingSettings(
	descriptor: BlockTypeDescriptor | undefined,
	block: BlockDraft,
): MissingSetting[] {
	if (!descriptor || block.preserve) {
		return []
	}
	const config = block.config ?? {}
	const found: MissingSetting[] = []
	for (const [key, schema] of Object.entries(panelConfig(descriptor))) {
		if (schema.ui?.hidden) {
			continue
		}
		collectMissing(schema, config[key], [key], [optionLabel(key, schema)], found)
	}
	if (descriptor.controllerArg && !block.controller) {
		found.push({ path: [CONTROLLER_SETTING], label: 'Database table' })
	}
	return found
}

/** The same gaps, named for a sentence. */
export function missingConfig(
	descriptor: BlockTypeDescriptor | undefined,
	block: BlockDraft,
): string[] {
	return missingSettings(descriptor, block).map((entry) => entry.label)
}

export interface DataTypeItem {
	label: string
	value: string
	icon: string
}

export interface DataTypeGroup {
	label: string
	items: DataTypeItem[]
}

/** `made_up` → `Made up`, for a DataType a project registered itself. */
function spelledOut(id: string): string {
	const words = id.replace(/_/g, ' ')
	return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * A DataType as a menu shows it: its name and its icon. A field that names none
 * holds the one a new field starts as.
 */
export function dataTypeItem(id: string = DEFAULT_DATA_TYPE): DataTypeItem {
	return {
		label: DATA_TYPES[id]?.label ?? spelledOut(id),
		value: id,
		icon: DATA_TYPES[id]?.icon ?? OTHER_DATA_TYPE_ICON,
	}
}

/**
 * The DataTypes a Type menu offers, named for whoever picks one, in the order
 * the names are listed in — the ones a project registered itself follow.
 */
export function dataTypeItems(catalog: BlockCatalog | null): DataTypeItem[] {
	const known = Object.keys(DATA_TYPES)
	const rank = (id: string): number => {
		const at = known.indexOf(id)
		return at === -1 ? known.length : at
	}
	return (catalog?.dataTypes ?? [])
		.map((entry) => entry.id)
		.sort((a, b) => rank(a) - rank(b))
		.map(dataTypeItem)
}

/**
 * The two ways a column of this DataType is sorted, in the words its values
 * read in, the way people want it first leading: the newest date or time, the
 * largest number, and text from A.
 */
export function sortDirections(
	id: string | undefined,
): Array<{ desc: boolean; label: string }> {
	const input = DATA_TYPES[id ?? DEFAULT_DATA_TYPE]?.input
	if (input === 'date' || input === 'time') {
		return [
			{ desc: true, label: 'Newest first' },
			{ desc: false, label: 'Oldest first' },
		]
	}
	if (input === 'number') {
		return [
			{ desc: true, label: 'Largest first' },
			{ desc: false, label: 'Smallest first' },
		]
	}
	return [
		{ desc: false, label: 'A to Z' },
		{ desc: true, label: 'Z to A' },
	]
}

/**
 * The same DataTypes, by family. Only the ones the catalog serves are offered,
 * a family left with none is dropped, and a type no family names joins the
 * last one.
 */
export function dataTypeGroups(catalog: BlockCatalog | null): DataTypeGroup[] {
	const served = dataTypeItems(catalog)
	const last = DATA_TYPE_FAMILIES.at(-1)?.id
	return DATA_TYPE_FAMILIES.map((family) => ({
		label: family.label,
		items: served.filter(
			(item) => (DATA_TYPES[item.value]?.family ?? last) === family.id,
		),
	})).filter((group) => group.items.length > 0)
}

/**
 * The data types a fresh entry of a list starts with: Text, for each one the
 * entry cannot do without.
 *
 * A form's field is read by its type before anything else — the form builds its
 * validation from it — so a field added without one was a field the preview had
 * to leave out, and a page that would not compile once saved. Text is what a
 * field the author has said nothing about yet holds.
 */
export function seededDataTypes(
	entry: OptionSchema,
	catalog: BlockCatalog | null,
): Record<string, unknown> {
	if (!catalog?.dataTypes.some((type) => type.id === DEFAULT_DATA_TYPE)) {
		return {}
	}
	const seeded: Record<string, unknown> = {}
	for (const [key, schema] of Object.entries(entry.properties ?? {})) {
		if (schema['x-dataType'] && isRequired(schema)) {
			seeded[key] = { $dataType: DEFAULT_DATA_TYPE, config: {} }
		}
	}
	return seeded
}

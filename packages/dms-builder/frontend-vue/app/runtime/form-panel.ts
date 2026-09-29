/**
 * A form block, as the simple mode's panel edits it.
 *
 * The panel is split in parts — where the form saves, the fields it asks for,
 * one field opened — and each reads the same block: which table it fills, the
 * columns that table is written with, and which of them the form asks for.
 */
import { computed } from 'vue'
import { useBlockPanel } from './block-panel'
import {
	askedColumns,
	boundTo,
	destinationOf,
	fillableColumns,
} from './form-table'
import { useBuilder } from './session'
import type { OptionSchema } from './types'

/** The block the simple mode edits with a panel of its own. */
export const FORM_BLOCK = 'Form'

/**
 * The options that panel edits. Whatever else the block declares is still
 * offered the way any block's options are.
 */
export const FORM_PANEL_OPTIONS = new Set([
	'title',
	'description',
	'fields',
	'fieldsOrientation',
	'redirectOnSuccess',
	'submitLabel',
	'successMessage',
	'errorMessage',
])

/** Beside the field is where a form puts its labels when nothing says. */
export const FIELD_ORIENTATION_DEFAULT = 'horizontal'

/**
 * A card of a form's panel: a titled group of the settings that go together —
 * its data, what it shows on the page, what it does once sent.
 */
export const PANEL_CARD =
	'flex flex-col gap-3.5 rounded-lg border border-default bg-elevated p-3.5'
/** A setting's label inside a card, quieter than the card's title. */
export const CARD_FIELD_UI = { label: 'font-normal text-muted' }

/** The branch of a form's entries that is a field rather than a group. */
function fieldBranch(fields: OptionSchema | undefined): OptionSchema | undefined {
	const items = fields?.items
	return items?.oneOf?.find((branch) => !branch.properties?.fields) ?? items
}

export function useFormBlock(path: () => string) {
	const builder = useBuilder()
	const session = builder.session
	const panel = useBlockPanel(path)
	const { config, options, patch } = panel

	const destination = computed(() =>
		destinationOf(config.value, session.value.resources),
	)
	const table = computed(() =>
		destination.value.kind === 'table' ? destination.value.table : undefined,
	)
	const structure = computed(() =>
		table.value ? session.value.resourceStructures[table.value.ref] : undefined,
	)
	const columns = computed(() => fillableColumns(structure.value))
	const asked = computed(() => askedColumns(config.value.fields))
	/**
	 * The columns a row cannot be written without that the form leaves out:
	 * leaving one out is the author's call, and every submit then fails.
	 */
	const needed = computed(() =>
		columns.value.filter(
			(column) => column.required && !asked.value.has(column.name),
		),
	)
	const fieldSchema = computed(() => fieldBranch(options.value.fields))

	function setFields(fields: unknown[]): void {
		patch({ fields })
	}

	/**
	 * Save the form into a table: every column a row is written with becomes a
	 * field of it, ready to be left out, and it submits to the table's create
	 * route. The fields a form had for another table are not this one's; the
	 * ones it has for this table are the author's, and picking it again keeps
	 * them.
	 */
	async function bindTo(ref: string): Promise<void> {
		const target = session.value.resources.find((entry) => entry.ref === ref)
		const at = path()
		if (!target || ref === table.value?.ref) {
			return
		}
		await builder.loadResource(ref)
		builder.patchConfig(
			at,
			boundTo(target, fillableColumns(session.value.resourceStructures[ref])),
		)
	}

	return {
		...panel,
		destination,
		table,
		structure,
		columns,
		asked,
		needed,
		fieldSchema,
		setFields,
		bindTo,
	}
}

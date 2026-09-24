<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
	ADVANCED_OPTION_GROUP,
	descriptorOf,
	missingSettings,
	optionGroups,
	slotsOf,
} from '../runtime/catalog'
import { findNode } from '../runtime/draft'
import { FORM_BLOCK, FORM_PANEL_OPTIONS } from '../runtime/form-panel'
import { useBuilderMode } from '../runtime/mode'
import { mergePatch } from '../runtime/object'
import { parentPath, useBuilder } from '../runtime/session'
import type { OptionSchema } from '../runtime/types'

interface RenderedOption {
	id: string
	name: string
	schema: OptionSchema
	value: unknown
	update: (value: unknown) => void
	separated?: boolean
}

/** Options offered together behind one switch, by the switch's label. */
interface RenderedOptIn {
	id: string
	optIn: string
	options: RenderedOption[]
}

interface RenderedGroup {
	id: string
	label: string
	options: RenderedOption[]
}

/**
 * The block that has a search bar. Every block reading a table shares its
 * fields, but a form over one has nothing to search, and a picker there would
 * rewrite the table's search for a setting that block never reads.
 */
const SEARCH_BAR_BLOCK = 'TableView'
const builder = useBuilder()
const session = builder.session

const path = computed(() => session.value.selection)
const block = builder.selected
const descriptor = builder.selectedDescriptor
const showAdvanced = ref(false)
// The simple mode leaves out what only a developer reads: the settings a
// block files under "Advanced", and why a block is locked, and where.
const { advanced: advancedMode } = useBuilderMode()
// The engine words a reason as a lower-case fragment; here it opens a sentence.
const opaqueReason = computed(() => {
	const reason = block.value?.opaqueReason
	return reason
		? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`
		: undefined
})

function parentType(parent: string): string | undefined {
	const draft = session.value.draft
	if (!draft) return undefined
	let list = draft.blocks
	let type: string | undefined
	for (const part of parent.split('/')) {
		const node = list.find((entry) => entry.name === part)
		if (!node) return undefined
		type = node.type
		list = node.children ?? []
	}
	return type
}

const parentDescriptor = computed(() => {
	const parent = path.value ? parentPath(path.value) : null
	return parent ? descriptorOf(session.value.catalog, parentType(parent)) : undefined
})
const parentBlock = computed(() => {
	const parent = path.value ? parentPath(path.value) : null
	return parent && session.value.draft
		? findNode(session.value.draft, parent)
		: undefined
})

/**
 * A form someone builds a page with has a panel of its own in the simple mode:
 * it saves into a table they pick, not into an endpoint they type.
 */
const formPanel = computed(
	() => !advancedMode.value && block.value?.type === FORM_BLOCK,
)

/** Whether the form's own panel edits this option rather than the list below. */
function inFormPanel(key: unknown): boolean {
	return formPanel.value && FORM_PANEL_OPTIONS.has(String(key))
}

// What the form's panel edits, it says is missing in its own words.
const missing = computed(() =>
	block.value
		? missingSettings(descriptor.value, block.value)
				.filter((entry) => !inFormPanel(entry.path[0]))
				.map((entry) => entry.label)
		: [],
)
const childMeta = computed(() => parentDescriptor.value?.childMeta ?? {})
const slots = computed(() => slotsOf(parentDescriptor.value, parentBlock.value))
const regionLabel = computed(() =>
	parentDescriptor.value?.label
		? `Inside ${parentDescriptor.value.label}`
		: 'Where it shows',
)

function config(): Record<string, unknown> {
	return block.value?.config ?? {}
}

function patch(key: string, value: unknown): void {
	if (path.value) {
		builder.patchConfig(path.value, { [key]: value })
	}
}

/**
 * An option marked `flatten` contributes its own properties to the group rather
 * than a nested editor, so a set of switches reads as one list of features.
 */
function expand(key: string, schema: OptionSchema): RenderedOption[] {
	if (!schema.ui?.flatten || !schema.properties) {
		return [
			{
				id: key,
				name: key,
				schema,
				value: config()[key],
				update: (value) => patch(key, value),
			},
		]
	}
	return Object.entries(schema.properties)
		.filter(([, nested]) => !nested.ui?.hidden)
		.sort(([, a], [, b]) => (a.ui?.order ?? 0) - (b.ui?.order ?? 0))
		.map(([nestedKey, nested]) => ({
			id: `${key}.${nestedKey}`,
			name: nestedKey,
			schema: nested,
			value: (config()[key] as Record<string, unknown> | undefined)?.[nestedKey],
			update: (value: unknown) =>
				patch(
					key,
					mergePatch(
						(config()[key] as Record<string, unknown>) ?? {},
						{ [nestedKey]: value },
					),
				),
		}))
}

function isSwitch(schema: OptionSchema): boolean {
	return (
		schema.ui?.widget === 'switch' ||
		(!schema.ui?.widget && !schema.enum && schema.type === 'boolean')
	)
}

/** Rule a switch off from the switch above it, and only from a switch. */
function withSeparators(options: RenderedOption[]): RenderedOption[] {
	return options.map((option, index) => ({
		...option,
		separated:
			index > 0 &&
			isSwitch(option.schema) &&
			isSwitch(options[index - 1]?.schema ?? {} as OptionSchema),
	}))
}

const groups = computed<RenderedGroup[]>(() =>
	optionGroups(descriptor.value)
		.map((group) => ({
			id: group.id,
			label: group.label,
			options: withSeparators(
				group.options
					.flatMap((option) => expand(option.key, option.schema))
					// What the simple mode writes itself — a key from the label it
					// follows, an address from the table picked — or leaves to code.
					.filter(
						(option) =>
							(advancedMode.value ||
								(!option.schema.ui?.derivedFrom && !option.schema.ui?.advanced)) &&
							!inFormPanel(option.id.split('.')[0]),
					),
			),
		}))
		.filter((group) => group.options.length > 0),
)
/**
 * A group's options, those behind a switch gathered where the first of them
 * stood, so the switch sits where the options did.
 */
function entriesOf(
	options: RenderedOption[],
): Array<RenderedOption | RenderedOptIn> {
	const entries: Array<RenderedOption | RenderedOptIn> = []
	const behind = new Map<string, RenderedOptIn>()
	for (const option of options) {
		const label = option.schema.ui?.optIn
		// Only an option of the block's own: one flattened out of another is
		// written through that other, not on its own.
		if (!label || option.id !== option.name) {
			entries.push(option)
			continue
		}
		let entry = behind.get(label)
		if (!entry) {
			entry = { id: `optIn:${label}`, optIn: label, options: [] }
			behind.set(label, entry)
			entries.push(entry)
		}
		entry.options.push(option)
	}
	return entries
}

function isOptIn(entry: RenderedOption | RenderedOptIn): entry is RenderedOptIn {
	return 'optIn' in entry
}

/**
 * The switches turned on and not yet filled in, by block and label: an author
 * who turns one on and clears what it seeded is still looking at the options.
 */
const openedOptIns = ref(new Set<string>())

function optInKey(entry: RenderedOptIn): string {
	return `${path.value ?? ''}\u0000${entry.optIn}`
}

/** On while any option behind it is set, or while the author has it open. */
function optInOn(entry: RenderedOptIn): boolean {
	return (
		openedOptIns.value.has(optInKey(entry)) ||
		entry.options.some((option) => option.value !== undefined)
	)
}

/**
 * Turned on, the options start from what they suggest — the block's own
 * wording — rather than from nothing. Turned off, they are dropped, and the
 * block falls back on what it says by itself. One edit either way.
 */
function setOptIn(entry: RenderedOptIn, on: boolean): void {
	const opened = new Set(openedOptIns.value)
	if (on) {
		opened.add(optInKey(entry))
	} else {
		opened.delete(optInKey(entry))
	}
	openedOptIns.value = opened
	if (!path.value) {
		return
	}
	const values: Record<string, unknown> = {}
	for (const option of entry.options) {
		values[option.id] = on
			? (option.value ?? option.schema.ui?.placeholder)
			: undefined
	}
	builder.patchConfig(path.value, values)
}

const plainGroups = computed(() =>
	groups.value.filter((group) => group.id !== ADVANCED_OPTION_GROUP),
)
const advanced = computed(() =>
	advancedMode.value
		? groups.value.find((group) => group.id === ADVANCED_OPTION_GROUP)
		: undefined,
)

/* ---- what lives on the resource rather than on the block ---------------- */

const resource = computed(() =>
	block.value?.controller
		? session.value.resourceStructures[block.value.controller]
		: undefined,
)
const fieldCount = computed(() => resource.value?.fields.length ?? 0)
const searchField = computed(
	() => resource.value?.fields.find((field) => field.searchable)?.name,
)

watch(
	() => block.value?.controller,
	(ref) => {
		if (ref) void builder.loadResource(ref)
	},
	{ immediate: true },
)

/** One searchable field at a time here; the DMS itself allows several. */
async function setSearchField(name: string): Promise<void> {
	const current = resource.value
	if (!current || !block.value?.controller) {
		return
	}
	for (const field of current.fields) {
		const wanted = field.name === name
		if (!!field.searchable !== wanted) {
			await builder.configureField(
				`${block.value.controller}#${field.name}`,
				{ searchable: wanted },
			)
		}
	}
}
</script>

<template>
	<div v-if="!block || !path" class="text-sm text-dimmed">
		Select a block on the page to configure it.
	</div>

	<div v-else class="flex flex-col gap-5">
		<div
			v-if="block.preserve"
			class="flex flex-col gap-2 rounded-md border border-default bg-elevated p-3 text-sm text-dimmed"
		>
			<p>
				This block is set up in code, so its settings can't be changed here.
			</p>
			<!-- Said in the advanced view only: someone building the page has no
			use for a file path, and a developer wants to know what to change. -->
			<p v-if="advancedMode" class="text-xs">
				<span v-if="opaqueReason">{{ opaqueReason }} </span>
				Edit it in
				<code class="text-xs">{{ session.structure?.page.filepath }}</code>.
			</p>
		</div>

		<template v-else>
			<div
				v-if="missing.length"
				class="flex flex-col gap-1 rounded-md border border-warning bg-warning/10 p-3 text-xs text-warning"
			>
				<span class="font-medium">Still to fill in</span>
				<ul class="flex flex-col gap-0.5">
					<li v-for="entry in missing" :key="entry">{{ entry }}</li>
				</ul>
			</div>

			<div v-if="descriptor?.controllerArg" class="flex flex-col gap-1.5">
				<label class="text-sm font-medium text-default">
					Database table
				</label>
				<USelectMenu
					:model-value="block.controller"
					:items="
						session.resources.map((entry) => ({
							label: entry.ref,
							value: entry.ref,
						}))
					"
					value-key="value"
					placeholder="Choose a resource…"
					@update:model-value="builder.setController(path, $event)"
				/>
				<p class="text-xs text-dimmed">
					This block reads and writes this table.
				</p>
			</div>

			<DmsBuilderFormPanel v-if="formPanel" :path="path" />

			<div
				v-for="group in plainGroups"
				:key="group.id"
				class="flex flex-col gap-3"
			>
				<p class="text-sm font-semibold text-highlighted">
					{{ group.label }}
				</p>
				<template v-for="entry in entriesOf(group.options)" :key="entry.id">
					<div v-if="isOptIn(entry)" class="flex flex-col gap-3">
						<div class="flex items-center gap-3">
							<USwitch
								:model-value="optInOn(entry)"
								:aria-label="entry.optIn"
								@update:model-value="setOptIn(entry, $event === true)"
							/>
							<span class="text-sm text-default">{{ entry.optIn }}</span>
						</div>
						<div
							v-if="optInOn(entry)"
							class="flex flex-col gap-3 border-l border-default pl-3"
						>
							<DmsBuilderOption
								v-for="option in entry.options"
								:key="option.id"
								:name="option.name"
								:schema="option.schema"
								:model-value="option.value"
								:resource="block.controller"
								:block-name="block.name"
								@update:model-value="option.update($event)"
								@patch="builder.patchConfig(path, $event)"
							/>
						</div>
					</div>
					<DmsBuilderOption
						v-else
						:name="entry.name"
						:schema="entry.schema"
						:model-value="entry.value"
						:resource="block.controller"
						:block-name="block.name"
						:separated="entry.separated"
						@update:model-value="entry.update($event)"
						@patch="builder.patchConfig(path, $event)"
					/>
				</template>
			</div>

			<div v-if="descriptor?.controllerArg" class="flex flex-col gap-3">
				<p class="text-sm font-semibold text-highlighted">Fields</p>
				<UButton
					color="neutral"
					variant="outline"
					block
					:disabled="!block.controller"
					trailing-icon="i-ph-caret-right"
					icon="i-ph-list"
					:label="
						block.controller
							? `${fieldCount} field${fieldCount === 1 ? '' : 's'} imported`
							: 'Choose a table first'
					"
					@click="builder.setView('resource')"
				/>
				<p class="text-xs text-dimmed">
					Order, visibility, filters and sorting, field by field. Those belong
					to the resource and are written as you make them; the settings above
					belong to this page and wait for Save.
				</p>

				<div
					v-if="block.type === SEARCH_BAR_BLOCK"
					class="flex flex-col gap-1.5"
				>
					<label class="text-sm font-medium text-default">Search field</label>
					<USelectMenu
						:model-value="searchField"
						:items="
							(resource?.fields ?? []).map((field) => ({
								label: field.name,
								value: field.name,
							}))
						"
						value-key="value"
						:disabled="!resource"
						placeholder="— None —"
						@update:model-value="setSearchField($event)"
					/>
					<p class="text-xs text-dimmed">
						Used by the table's search bar. The DMS accepts several; this
						picker sets one.
					</p>
				</div>
			</div>

			<!-- A block dropped in lands in the region on screen; this is how it is
			moved to another one afterwards. Named after the container rather than
			called a slot, which is a word the gesture exists to spare anyone. -->
			<div v-if="slots.length" class="flex flex-col gap-1.5">
				<label class="text-sm font-medium text-default">
					{{ regionLabel }}
				</label>
				<USelectMenu
					:model-value="block.slot"
					:items="slots.map((slot) => ({ label: slot.label, value: slot.id }))"
					value-key="value"
					placeholder="Choose where it shows…"
					@update:model-value="builder.setSlot(path, $event)"
				/>
			</div>

			<div
				v-if="Object.keys(childMeta).length"
				class="flex flex-col gap-3 border-t border-default pt-4"
			>
				<p class="text-sm font-semibold text-highlighted">Placement</p>
				<DmsBuilderOption
					v-for="[key, schema] in Object.entries(childMeta)"
					:key="key"
					:name="key"
					:schema="schema"
					:model-value="(block.meta ?? {})[key]"
					@update:model-value="builder.patchMeta(path, { [key]: $event })"
				/>
			</div>

			<div v-if="advanced" class="border-t border-default pt-4">
				<button
					type="button"
					class="flex w-full items-center gap-2 text-sm font-semibold text-dimmed hover:text-default"
					@click="showAdvanced = !showAdvanced"
				>
					<UIcon
						:name="showAdvanced ? 'i-ph-caret-down' : 'i-ph-caret-right'"
						class="size-3.5"
					/>
					Advanced
					<span class="ml-auto font-normal normal-case">
						{{ advanced.options.length }}
					</span>
				</button>
				<div v-if="showAdvanced" class="mt-3 flex flex-col gap-3">
					<DmsBuilderOption
						v-for="option in advanced.options"
						:key="option.id"
						:name="option.name"
						:schema="option.schema"
						:model-value="option.value"
						:resource="block.controller"
						@update:model-value="option.update($event)"
					/>
				</div>
			</div>
		</template>

		<div class="flex flex-wrap gap-2 border-t border-default pt-4">
			<UButton
				icon="i-ph-copy"
				size="xs"
				color="neutral"
				variant="outline"
				label="Duplicate"
				@click="builder.duplicate(path)"
			/>
			<UButton
				icon="i-ph-export"
				size="xs"
				color="neutral"
				variant="outline"
				label="Export"
				@click="builder.setView('json')"
			/>
			<UButton
				icon="i-ph-trash"
				size="xs"
				color="error"
				variant="soft"
				label="Delete"
				@click="builder.remove(path)"
			/>
		</div>
	</div>
</template>

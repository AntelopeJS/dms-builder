<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
	descriptorOf,
	missingConfig,
	optionGroups,
	slotsOf,
} from '../runtime/catalog'
import { findNode } from '../runtime/draft'
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

interface RenderedGroup {
	id: string
	label: string
	options: RenderedOption[]
}

const ADVANCED_GROUP = 'advanced'
const EXPORT_ROUTE = 'export'

const builder = useBuilder()
const session = builder.session

const path = computed(() => session.value.selection)
const block = builder.selected
const descriptor = builder.selectedDescriptor
const showAdvanced = ref(false)

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

const missing = computed(() =>
	block.value ? missingConfig(descriptor.value, block.value) : [],
)
const childMeta = computed(() => parentDescriptor.value?.childMeta ?? {})
const slots = computed(() => slotsOf(parentDescriptor.value, parentBlock.value))

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
	optionGroups(descriptor.value).map((group) => ({
		id: group.id,
		label: group.label,
		options: withSeparators(
			group.options.flatMap((option) => expand(option.key, option.schema)),
		),
	})),
)
const plainGroups = computed(() =>
	groups.value.filter((group) => group.id !== ADVANCED_GROUP),
)
const advanced = computed(() =>
	groups.value.find((group) => group.id === ADVANCED_GROUP),
)

/* ---- what lives on the resource rather than on the block ---------------- */

const resource = computed(() =>
	block.value?.controller
		? session.value.resourceStructures[block.value.controller]
		: undefined,
)
const fieldCount = computed(() => resource.value?.fields.length ?? 0)
const exported = computed(
	() => !resource.value?.routes || resource.value.routes.includes(EXPORT_ROUTE),
)
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

function toggleExport(on: boolean): void {
	const current = resource.value
	if (!current || !block.value?.controller) {
		return
	}
	const all = current.routes ?? [
		'list',
		'get',
		'create',
		'edit',
		'delete',
		'select',
		'archive',
		EXPORT_ROUTE,
	]
	const routes = on
		? [...new Set([...all, EXPORT_ROUTE])]
		: all.filter((route) => route !== EXPORT_ROUTE)
	void builder.configureResource(block.value.controller, routes)
}

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
			class="rounded-md border border-default bg-elevated p-3 text-sm text-dimmed"
		>
			This block is written by hand and kept exactly as it is. Edit it in
			<code class="text-xs">{{ session.structure?.page.filepath }}</code>.
		</div>

		<template v-else>
			<div
				v-if="missing.length"
				class="rounded-md border border-warning bg-warning/10 p-3 text-xs text-warning"
			>
				Still to fill in: {{ missing.join(', ') }}
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

			<div
				v-for="group in plainGroups"
				:key="group.id"
				class="flex flex-col gap-3"
			>
				<p class="text-sm font-semibold text-highlighted">
					{{ group.label }}
				</p>
				<DmsBuilderOption
					v-for="option in group.options"
					:key="option.id"
					:name="option.name"
					:schema="option.schema"
					:model-value="option.value"
					:resource="block.controller"
					:block-name="block.name"
					:separated="option.separated"
					@update:model-value="option.update($event)"
					@patch="builder.patchConfig(path, $event)"
				/>

				<div
					v-if="group.id === 'features' && descriptor?.controllerArg"
					class="flex items-start gap-3 border-t border-default py-2.5"
				>
					<USwitch
						:model-value="exported"
						:disabled="!resource"
						class="mt-0.5 shrink-0"
						@update:model-value="toggleExport($event)"
					/>
					<div class="min-w-0 flex-1">
						<p class="text-sm text-default">Data export</p>
						<p class="mt-0.5 text-xs text-dimmed">
							Serves the resource's export endpoints.
						</p>
					</div>
				</div>
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

				<div class="flex flex-col gap-1.5">
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

			<div v-if="slots.length" class="flex flex-col gap-1.5">
				<label class="text-sm font-medium text-default">Slot</label>
				<USelectMenu
					:model-value="block.slot"
					:items="slots.map((slot) => ({ label: slot.label, value: slot.id }))"
					value-key="value"
					placeholder="Choose a region…"
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

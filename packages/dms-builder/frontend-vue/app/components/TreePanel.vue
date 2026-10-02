<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBlockPanel } from '../runtime/block-panel'
import { THEME_COLORS } from '../runtime/constants'
import { CARD_FIELD_UI, PANEL_CARD } from '../runtime/form-panel'
import { useBuilder } from '../runtime/session'
import { treeSource } from '../runtime/tree-source'
import {
	CUSTOM_LOOK,
	CUSTOM_OPENING,
	CUSTOM_SELECTION,
	DEFAULT_SELECTION,
	itemPath,
	treeRows,
	withItemAdded,
	withItemMoved,
	withItemPatched,
	withoutItem,
	type TreeItem,
	type TreeRow,
} from '../runtime/tree-panel'

/**
 * A tree, as someone building a page sets one up, starting where every panel
 * starts: its items — listed here, read from the page's tables, or from an
 * address — then what it shows on the page. How items are selected, which start open and how it looks keep to
 * what the tree does by itself until a switch says otherwise. Methods, handlers
 * and loading on demand are the advanced view's.
 */
const props = defineProps<{ path: string }>()

const { block, config, options, has, text, patch, write } = useBlockPanel(() => props.path)
const builder = useBuilder()
const session = builder.session

/* ---- its items ---------------------------------------------------------- */

type Source = 'listed' | 'table' | 'address'

const SOURCES: Array<{ value: Source; label: string }> = [
	{ value: 'listed', label: 'Listed here' },
	{ value: 'table', label: 'From a table' },
	{ value: 'address', label: 'From an address' },
]

/** The tree its items are read from, when the page's tables answer them. */
const fromTables = computed(() =>
	treeSource(session.value.draft, session.value.structure, block.value?.name ?? ''),
)

/** Where its items come from, picked before a table or an address is. */
const pickedSource = ref<Source | null>(null)
const source = computed<Source>(
	() =>
		pickedSource.value ??
		(fromTables.value ? 'table' : text('fetchUrl') ? 'address' : 'listed'),
)

function setSource(next: Source): void {
	if (next === source.value) {
		return
	}
	pickedSource.value = next
	if (fromTables.value) {
		// The route reading the tables goes with them, and the address the block
		// read it at with it.
		builder.removeDraftTree(block.value?.name ?? '')
		patch({ fetchUrl: undefined, lazyLoad: undefined })
	}
	if (next === 'listed') {
		// Read from an address, the items listed here go unread: the address and
		// the method it is read with go together.
		patch({ fetchUrl: undefined, fetchUrlMethod: undefined })
	}
}

const items = computed(() => config.value.staticNodes)
const rows = computed(() => treeRows(items.value))

function setItems(next: TreeItem[]): void {
	patch({ staticNodes: next.length ? next : undefined })
}

function addItem(parent: number[] | null): void {
	setItems(withItemAdded(items.value, parent, parent ? 'New sub-item' : 'New item'))
}

function rowActions(row: TreeRow) {
	return [
		[
			{
				label: 'Add an item inside',
				icon: 'i-ph-arrow-elbow-down-right',
				onSelect: () => addItem(row.path),
			},
		],
		[
			{
				label: 'Move up',
				icon: 'i-ph-arrow-up',
				disabled: row.path.at(-1) === 0,
				onSelect: () => setItems(withItemMoved(items.value, row.path, -1)),
			},
			{
				label: 'Move down',
				icon: 'i-ph-arrow-down',
				disabled: row.path.at(-1) === row.siblings - 1,
				onSelect: () => setItems(withItemMoved(items.value, row.path, 1)),
			},
		],
		[
			{
				label: 'Remove',
				icon: 'i-ph-trash',
				color: 'error' as const,
				onSelect: () => setItems(withoutItem(items.value, row.path)),
			},
		],
	]
}

/* ---- what it does differently ------------------------------------------- */

/** The switches turned on and not filled in yet, by the card they open. */
const opened = ref(new Set<string>())

function setOpened(card: string, on: boolean): void {
	const next = new Set(opened.value)
	if (on) {
		next.add(card)
	} else {
		next.delete(card)
	}
	opened.value = next
}

function anySet(keys: readonly string[]): boolean {
	return keys.some((key) => config.value[key] !== undefined)
}

/** Turned off, a card's settings go: the tree does what it does by itself. */
function clear(keys: readonly string[], also: Record<string, unknown> = {}): void {
	patch({ ...Object.fromEntries(keys.map((key) => [key, undefined])), ...also })
}

const selectionOn = computed(
	() =>
		opened.value.has('selection') ||
		anySet(CUSTOM_SELECTION) ||
		(text('selectionBehavior') !== '' && text('selectionBehavior') !== DEFAULT_SELECTION),
)
function customSelection(on: boolean): void {
	setOpened('selection', on)
	if (!on) {
		clear(CUSTOM_SELECTION, { selectionBehavior: DEFAULT_SELECTION })
	}
}

const CLICKS = [
	{ value: 'toggle', label: 'Adds or removes it' },
	{ value: 'replace', label: 'Selects it alone' },
]

/** The items that hold others, the only ones a tree can open. */
const parents = computed(() => rows.value.filter((row) => row.item.children?.length))
const startOpen = computed(
	() => new Set(Array.isArray(config.value.defaultExpanded) ? config.value.defaultExpanded : []),
)

const openingOn = computed(() => opened.value.has('opening') || anySet(CUSTOM_OPENING))
function customOpening(on: boolean): void {
	setOpened('opening', on)
	if (!on) {
		clear(CUSTOM_OPENING)
	}
}

function setStartOpen(row: TreeRow, open: boolean): void {
	const id = itemPath(items.value, row.path)
	if (!id) {
		return
	}
	const next = new Set(startOpen.value)
	if (open) {
		next.add(id)
	} else {
		next.delete(id)
	}
	patch({ defaultExpanded: next.size ? [...next] : undefined })
}

const lookOn = computed(() => opened.value.has('look') || anySet(CUSTOM_LOOK))
function customLook(on: boolean): void {
	setOpened('look', on)
	if (!on) {
		clear(CUSTOM_LOOK)
	}
}

const SIZE_LABELS: Record<string, string> = { xs: 'XS', sm: 'S', md: 'M', lg: 'L', xl: 'XL' }
const sizes = computed(() =>
	(options.value.size?.enum ?? []).map((value) => ({
		value: String(value),
		label: SIZE_LABELS[String(value)] ?? String(value),
	})),
)

const ICONS = [
	{ key: 'collapsedIcon', label: 'Closed', fallback: 'i-ph-caret-right' },
	{ key: 'expandedIcon', label: 'Opened', fallback: 'i-ph-caret-down' },
	{ key: 'trailingIcon', label: 'At the end', fallback: undefined },
] as const
</script>

<template>
	<div class="flex flex-col gap-3">
		<section :class="PANEL_CARD" aria-label="Data">
			<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
				<UIcon name="i-ph-tree-structure" class="size-4 text-primary" />
				Data
			</p>

			<div
				v-if="has('fetchUrl')"
				role="group"
				aria-label="Where its items come from"
				class="grid grid-cols-3 gap-1 rounded-lg border border-accented bg-default p-0.75"
			>
				<button
					v-for="choice in SOURCES"
					:key="choice.value"
					type="button"
					:aria-pressed="source === choice.value"
					class="min-h-8 rounded-[5px] px-1 py-1 text-[12px]/[14px] transition-colors"
					:class="
						source === choice.value
							? 'bg-primary font-semibold text-inverted'
							: 'font-medium text-toned hover:bg-elevated'
					"
					@click="setSource(choice.value)"
				>
					{{ choice.label }}
				</button>
			</div>

			<template v-if="source === 'listed'">
				<div
					v-if="rows.length"
					class="flex flex-col divide-y divide-default rounded-lg border border-default bg-default"
				>
					<div
						v-for="row in rows"
						:key="row.path.join('.')"
						class="flex items-center gap-1.5 py-1.5 pr-1.5"
						:style="{ paddingLeft: `${8 + row.depth * 16}px` }"
					>
						<UIcon
							v-if="row.depth"
							name="i-ph-arrow-elbow-down-right"
							class="size-3.5 shrink-0 text-dimmed"
						/>
						<DmsBuilderIconPicker
							:model-value="row.item.icon"
							fallback="i-ph-dot-outline"
							size="sm"
							:label="`Icon of ${row.item.label}`"
							@update:model-value="
								setItems(withItemPatched(items, row.path, { icon: $event }))
							"
						/>
						<UInput
							:model-value="row.item.label"
							size="sm"
							class="min-w-0 flex-1"
							:aria-label="`Item ${row.path.map((rank) => rank + 1).join('.')}`"
							@update:model-value="
								setItems(withItemPatched(items, row.path, { label: String($event) }))
							"
						/>
						<UDropdownMenu :items="rowActions(row)" :content="{ align: 'end' }">
							<UButton
								icon="i-ph-dots-three"
								size="xs"
								color="neutral"
								variant="ghost"
								:aria-label="`More for ${row.item.label}`"
							/>
						</UDropdownMenu>
					</div>
				</div>
				<p v-else class="text-[13px]/[18px] text-muted">
					No item yet. Each can hold items of its own, opened under it.
				</p>
				<UButton
					icon="i-ph-plus"
					size="sm"
					color="neutral"
					variant="outline"
					label="Add an item"
					class="self-start"
					@click="addItem(null)"
				/>
			</template>

			<DmsBuilderTreeTableSource v-else-if="source === 'table'" :path="path" />

			<UFormField
				v-else
				label="Address"
				description="Answers its items: a label each, and the items inside it."
				:ui="CARD_FIELD_UI"
			>
				<UInput
					class="w-full"
					:model-value="text('fetchUrl')"
					placeholder="/api/categories"
					@update:model-value="write('fetchUrl', String($event))"
				/>
			</UFormField>
		</section>

		<DmsBuilderOnThePage :path="path" />

		<DmsBuilderCustomCard
			v-if="has('multiple') || has('selectionBehavior')"
			title="Custom selection"
			icon="i-ph-cursor-click"
			off="one item selected at a time, a click adding or removing it."
			:on="selectionOn"
			@update:on="customSelection"
		>
			<div v-if="has('multiple')" class="flex items-center justify-between gap-3">
				<span class="text-sm text-default">Several items at once</span>
				<USwitch
					:model-value="config.multiple === true"
					aria-label="Several items at once"
					@update:model-value="write('multiple', $event === true ? true : undefined)"
				/>
			</div>
			<div
				v-if="has('propagateSelect') && config.multiple === true"
				class="flex items-center justify-between gap-3"
			>
				<span class="text-sm text-default">Selecting an item selects what it holds</span>
				<USwitch
					:model-value="config.propagateSelect === true"
					aria-label="Selecting an item selects what it holds"
					@update:model-value="write('propagateSelect', $event === true ? true : undefined)"
				/>
			</div>
			<div v-if="has('selectionBehavior')" class="flex flex-col gap-1.5">
				<span class="text-sm text-muted">A click on an item</span>
				<div
					role="group"
					aria-label="A click on an item"
					class="grid grid-cols-2 gap-1 rounded-lg border border-accented bg-default p-0.75"
				>
					<button
						v-for="click in CLICKS"
						:key="click.value"
						type="button"
						:aria-pressed="(text('selectionBehavior') || DEFAULT_SELECTION) === click.value"
						class="h-8 rounded-[5px] px-2 text-[13px] transition-colors"
						:class="
							(text('selectionBehavior') || DEFAULT_SELECTION) === click.value
								? 'bg-primary font-semibold text-inverted'
								: 'font-medium text-toned hover:bg-elevated'
						"
						@click="write('selectionBehavior', click.value)"
					>
						{{ click.label }}
					</button>
				</div>
			</div>
			<div v-if="has('disabled')" class="flex items-center justify-between gap-3">
				<span class="text-sm text-default">Nothing can be clicked</span>
				<USwitch
					:model-value="config.disabled === true"
					aria-label="Nothing can be clicked"
					@update:model-value="write('disabled', $event === true ? true : undefined)"
				/>
			</div>
		</DmsBuilderCustomCard>

		<DmsBuilderCustomCard
			v-if="has('defaultExpanded') && source === 'listed' && parents.length"
			title="Custom opening"
			icon="i-ph-folder-open"
			off="every item starts closed."
			:on="openingOn"
			@update:on="customOpening"
		>
			<span class="text-sm text-muted">Open when the page loads</span>
			<div class="flex flex-col gap-2">
				<UCheckbox
					v-for="row in parents"
					:key="row.path.join('.')"
					:model-value="startOpen.has(itemPath(items, row.path) ?? '')"
					:label="row.item.label"
					:style="{ paddingLeft: `${row.depth * 16}px` }"
					@update:model-value="setStartOpen(row, $event === true)"
				/>
			</div>
		</DmsBuilderCustomCard>

		<DmsBuilderCustomCard
			v-if="has('color') || has('size')"
			title="Custom look"
			icon="i-ph-palette"
			off="the theme's colour, medium size, its usual arrows."
			:on="lookOn"
			@update:on="customLook"
		>
			<div v-if="has('color')" class="flex flex-col gap-1.5">
				<span class="text-sm text-muted">Colour</span>
				<div class="flex flex-wrap gap-1">
					<UButton
						v-for="colour in THEME_COLORS"
						:key="colour"
						:label="colour"
						:color="colour"
						size="xs"
						:variant="config.color === colour ? 'solid' : 'soft'"
						@click="write('color', config.color === colour ? undefined : colour)"
					/>
				</div>
			</div>
			<div v-if="has('size')" class="flex flex-col gap-1.5">
				<span class="text-sm text-muted">Size</span>
				<div
					role="group"
					aria-label="Size"
					class="grid grid-cols-5 gap-1 rounded-lg border border-accented bg-default p-0.75"
				>
					<button
						v-for="size in sizes"
						:key="size.value"
						type="button"
						:aria-pressed="(text('size') || 'md') === size.value"
						class="h-7 rounded-[5px] text-[13px] transition-colors"
						:class="
							(text('size') || 'md') === size.value
								? 'bg-primary font-semibold text-inverted'
								: 'font-medium text-toned hover:bg-elevated'
						"
						@click="write('size', size.value)"
					>
						{{ size.label }}
					</button>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="text-sm text-muted">Icons</span>
				<div class="grid grid-cols-3 gap-2">
					<div
						v-for="icon in ICONS.filter((entry) => has(entry.key))"
						:key="icon.key"
						class="flex flex-col items-center gap-1"
					>
						<DmsBuilderIconPicker
							:model-value="text(icon.key) || undefined"
							:fallback="icon.fallback"
							size="sm"
							:label="`${icon.label} icon`"
							@update:model-value="write(icon.key, $event)"
						/>
						<span class="text-xs text-muted">{{ icon.label }}</span>
					</div>
				</div>
			</div>
		</DmsBuilderCustomCard>
	</div>
</template>

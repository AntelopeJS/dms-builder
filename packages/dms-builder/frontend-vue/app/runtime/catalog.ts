import {
	BLOCK_GROUP_LABELS,
	LAYOUT_BLOCKS,
	DEVELOPER_BLOCKS,
	WRAPPER_BLOCKS,
} from './constants'
import type {
	BlockCatalog,
	ComponentPreview,
	ComponentPreviewChild,
	BlockTypeDescriptor,
	ResolvedPreview,
} from './types'
import { UNGROUPED, orderedKeys } from './catalog-options'

/** The node the DMS served at a draft path, walking `.child()` ids. */
export function servedNodeAt(
	served: Record<string, ComponentPreview>,
	path: string,
): ComponentPreview | undefined {
	const [head, ...rest] = path.split('/')
	let node: ComponentPreview | undefined = served[head ?? '']
	for (const segment of rest) {
		node = node?.children?.find((child) => child.id === segment)?.component
	}
	return node
}

/**
 * The children a block holds through its own settings, as the DMS served them:
 * the chart a card draws with lives in the card's `chart` setting, and is served
 * as the card's child of that name. The draft carries none of them as a child,
 * so the canvas renders them itself, where the page does: inside the block.
 *
 * Only those: a served child the draft no longer names is one just removed, and
 * the preview has not caught up yet.
 */
export function heldChildren(
	descriptor: BlockTypeDescriptor | undefined,
	node: ComponentPreview | undefined,
): ComponentPreviewChild[] {
	const config = descriptor?.config ?? {}
	return (node?.children ?? []).filter(
		(entry) => !entry.slot && (config[entry.id]?.ui?.blockTypes?.length ?? 0) > 0,
	)
}

/** A served node with its component resolved, all the way down, as the page does. */
export function resolvedPreview(
	child: ComponentPreviewChild,
	resolve: (name: string) => unknown,
): ResolvedPreview {
	const { id, component, ...placement } = child
	return {
		...placement,
		id,
		options: component.options,
		component: resolve(component.componentName) ?? 'div',
		componentName: component.componentName,
		children: (component.children ?? []).map((entry) => resolvedPreview(entry, resolve)),
	}
}

export interface PaletteGroup {
	id: string
	label: string
	blocks: BlockTypeDescriptor[]
}

export function descriptorOf(
	catalog: BlockCatalog | null,
	type?: string | null,
): BlockTypeDescriptor | undefined {
	if (!catalog || !type) {
		return undefined
	}
	return catalog.blocks.find((block) => block.type === type)
}

/**
 * The types the palette leaves out: structure, not components.
 *
 * A container naming exactly one `allowedChildren` is the one case where the
 * editor writes that child itself, around whatever is dropped in — see
 * `wrapperFor`. Nobody can place such a type usefully: the only spot that takes
 * it is the container that already builds it, and a palette entry beside `Grid`
 * reads as a grid cell, so it invites the one gesture the layout refuses. The
 * rule is read off the catalog rather than listed here, so the next
 * container/row pair declared is covered without touching this file.
 *
 * The layout blocks join them: the page is a grid the author never sees, and
 * the editor writes the rows and columns a placement takes — see
 * `LAYOUT_BLOCKS`. So do the wrappers it writes around a block — a section's
 * row, a container's guard —, whose settings are the wrapped block's: see
 * `WRAPPER_BLOCKS`.
 *
 * The same rule answers a second question: what the canvas must not name. A
 * block of a type nobody can place is one the editor placed, and the user is
 * owed the blocks they did place instead.
 */
function structuralTypes(catalog: BlockCatalog): Set<string> {
	const structural = new Set<string>()
	for (const { type, allowedChildren } of catalog.blocks) {
		const only = allowedChildren?.length === 1 ? allowedChildren[0] : undefined
		if (only !== undefined) {
			structural.add(only)
		}
		if (LAYOUT_BLOCKS.has(type) || WRAPPER_BLOCKS.has(type)) {
			structural.add(type)
		}
	}
	return structural
}

/** Whether a block of this type only lays other blocks out. */
export function isLayout(
	catalog: BlockCatalog | null,
	type: string | undefined,
): boolean {
	return (
		type !== undefined &&
		LAYOUT_BLOCKS.has(type) &&
		descriptorOf(catalog, type) !== undefined
	)
}

/** Whether a block of this type is scaffolding the editor wrote for itself. */
export function isStructural(
	catalog: BlockCatalog | null,
	type: string | undefined,
): boolean {
	if (!catalog || type === undefined) {
		return false
	}
	return structuralTypes(catalog).has(type)
}

/**
 * The types another component holds and has its author pick — the charts a
 * chart card draws with —, by the type holding them. Read off the catalog: a
 * `block` option naming the types it takes.
 */
function heldTypes(catalog: BlockCatalog): Map<string, string[]> {
	const held = new Map<string, string[]>()
	for (const { type, config } of catalog.blocks) {
		const types = Object.values(config).flatMap((schema) => schema.ui?.blockTypes ?? [])
		if (types.length) {
			held.set(type, types)
		}
	}
	return held
}

/**
 * What the palette offers, grouped. The simple mode leaves out a type another
 * component holds: that one is offered instead, picks it in its panel, and
 * answers a search for it — "line" finds the chart card. The advanced view
 * offers both, for the developer placing a chart on its own.
 *
 * The simple mode leaves out a type the DMS never declared as well: the
 * builder only inferred it from a factory, and it comes with no name, no
 * description and no option written for whoever builds a page. And the types a
 * setting places where they are needed — see `DEVELOPER_BLOCKS`.
 *
 * A block the DMS has since removed is left out of both modes.
 */
export function paletteGroups(
	catalog: BlockCatalog | null,
	query: string,
	advanced = false,
): PaletteGroup[] {
	if (!catalog) {
		return []
	}
	const needle = query.trim().toLowerCase()
	const structural = structuralTypes(catalog)
	const held = advanced ? new Map<string, string[]>() : heldTypes(catalog)
	const hidden = new Set([...held.values()].flat())
	// What a block is for is searched too: "money" finds the KPI that shows it.
	const matches = (type: string): boolean => {
		const descriptor = descriptorOf(catalog, type)
		return [descriptor?.label ?? type, type, descriptor?.description ?? ''].some((text) =>
			text.toLowerCase().includes(needle),
		)
	}
	const buckets = new Map<string, BlockTypeDescriptor[]>()
	for (const block of catalog.blocks) {
		if (
			structural.has(block.type) ||
			hidden.has(block.type) ||
			(!advanced && (block.shapeSource === 'inferred' || DEVELOPER_BLOCKS.has(block.type)))
		) {
			continue
		}
		if (
			needle &&
			!matches(block.type) &&
			!(held.get(block.type) ?? []).some(matches)
		) {
			continue
		}
		const group = block.group ?? UNGROUPED
		const bucket = buckets.get(group) ?? []
		bucket.push(block)
		buckets.set(group, bucket)
	}
	return orderedKeys(buckets, Object.keys(BLOCK_GROUP_LABELS)).map((group) => ({
		id: group,
		label: BLOCK_GROUP_LABELS[group] ?? group,
		blocks: buckets.get(group) ?? [],
	}))
}

const PALETTE_ICON = 'i-ph-square'
const PHOSPHOR_WEIGHT = /-(thin|light|bold|fill|duotone)$/

/**
 * The icon a palette tile draws. A tile draws it large, in Phosphor's two-tone
 * weight: at that size the line weight a menu uses reads thin and empty. An
 * icon from another set, or one already naming its weight, is drawn as given.
 */
export function paletteIcon(icon: string | undefined): string {
	const name = icon ?? PALETTE_ICON
	return name.startsWith('i-ph-') && !PHOSPHOR_WEIGHT.test(name)
		? `${name}-duotone`
		: name
}

/**
 * The icon a block is drawn with on a line — the layers, the inspector's
 * heading, a row of the palette: Phosphor's light weight, which the rest of the
 * DMS draws its lines with.
 */
export function lineIcon(icon: string | undefined): string {
	const name = icon ?? PALETTE_ICON
	return name.startsWith('i-ph-') && !PHOSPHOR_WEIGHT.test(name) ? `${name}-light` : name
}

export {
	ADVANCED_OPTION_GROUP,
	optionGroups,
	heldBlockOptions,
	offeredIn,
	optionLabel,
	switchOn,
	isRequired,
	branchKind,
	valueKind,
	branchOf,
	fitsAsWell,
} from './catalog-options'
export type { OptionGroup } from './catalog-options'
export {
	CONTROLLER_SETTING,
	missingSettings,
	missingConfig,
	dataTypeItem,
	dataTypeItems,
	sortDirections,
	dataTypeGroups,
	seededDataTypes,
} from './catalog-settings'
export type {
	MissingSetting,
	DataTypeItem,
	DataTypeGroup,
} from './catalog-settings'
export {
	suggestedName,
	visibleNameKey,
	entryName,
	regionAfter,
	newBlockDraft,
	slotIdFor,
	shownRegion,
	slotsOf,
} from './catalog-blocks'

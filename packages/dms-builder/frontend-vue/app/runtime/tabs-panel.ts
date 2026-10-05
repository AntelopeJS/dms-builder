/**
 * A tab set, as the simple mode's panel edits it: its tabs one line each, the
 * one open on the canvas open in the panel too, and its look in a few lines.
 *
 * A tab's shortcut and avatar, the colours of its badge, and whether a hidden
 * tab stays mounted are the advanced view's. Every edit here reaches a tab
 * through the region it declares, so the blocks attached to a tab follow it
 * when it moves, and go with it when it goes.
 */
import { regionAfter, slotIdFor } from './catalog'
import { cloneDraft, uniqueName } from './draft'
import type { BlockDraft, DynamicSlots } from './types'

/** The block the simple mode edits with a panel of its own. */
export const TABS_BLOCK = 'Tab'

/**
 * The options that panel answers for. The ones it does not show — whether a
 * hidden tab stays mounted, the key the open tab is remembered under — are left
 * to the advanced view, and offered nowhere in the simple mode.
 */
export const TABS_PANEL_OPTIONS = new Set([
	'items',
	'color',
	'size',
	'variant',
	'orientation',
	'persistState',
	'unmountOnHide',
	'stateKey',
])

/** How a tab set looks when nothing says: the DMS's own defaults. */
export const TABS_DEFAULTS: Readonly<Record<string, string>> = {
	variant: 'pill',
	orientation: 'horizontal',
	size: 'md',
	color: 'primary',
}

/** A tab, as the panel lists it. */
export interface TabLine {
	id: string
	label: string
	icon?: string
	badge: string
	disabled: boolean
	/** How many blocks are attached to it. */
	blocks: number
}

type Entry = Record<string, unknown>

function isEntry(value: unknown): value is Entry {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function entriesOf(block: BlockDraft, dynamic: DynamicSlots): Entry[] {
	const entries = (block.config ?? {})[dynamic.optionPath]
	return Array.isArray(entries) ? entries.filter(isEntry) : []
}

function idOf(entry: Entry, dynamic: DynamicSlots): string | undefined {
	const id = entry[dynamic.idKey]
	return typeof id === 'string' && id !== '' ? id : undefined
}

function write(block: BlockDraft, dynamic: DynamicSlots, entries: Entry[]): void {
	block.config = { ...(block.config ?? {}), [dynamic.optionPath]: entries }
}

function indexOf(block: BlockDraft, dynamic: DynamicSlots, id: string): number {
	return entriesOf(block, dynamic).findIndex((entry) => idOf(entry, dynamic) === id)
}

/** A badge is a count or a word; one given as details shows as its label. */
function badgeText(badge: unknown): string {
	if (typeof badge === 'string' || typeof badge === 'number') {
		return String(badge)
	}
	return isEntry(badge) && badge.label !== undefined ? String(badge.label) : ''
}

export function tabLines(block: BlockDraft | undefined, dynamic: DynamicSlots | undefined): TabLine[] {
	if (!block || !dynamic) {
		return []
	}
	const children = block.children ?? []
	return entriesOf(block, dynamic).flatMap((entry) => {
		const id = idOf(entry, dynamic)
		if (!id) {
			return []
		}
		const label = dynamic.labelKey ? entry[dynamic.labelKey] : undefined
		return [
			{
				id,
				label: typeof label === 'string' ? label : '',
				icon: typeof entry.icon === 'string' ? entry.icon : undefined,
				badge: badgeText(entry.badge),
				disabled: entry.disabled === true,
				blocks: children.filter((child) => child.slot === id).length,
			},
		]
	})
}

/** What a tab holds, as the line naming it says. */
export function blocksLabel(count: number): string {
	if (count === 0) {
		return 'Empty'
	}
	return count === 1 ? '1 block' : `${count} blocks`
}

/** Write over a tab's own settings; one written `undefined` goes. */
export function patchTab(
	block: BlockDraft,
	dynamic: DynamicSlots,
	id: string,
	patch: Record<string, unknown>,
): void {
	const entries = entriesOf(block, dynamic)
	const at = indexOf(block, dynamic, id)
	const entry = entries[at]
	if (!entry) {
		return
	}
	const next: Entry = { ...entry, ...patch }
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) {
			delete next[key]
		}
	}
	entries[at] = next
	write(block, dynamic, entries)
}

/** A tab more, at the end, named after its rank; answers its region. */
export function addTab(block: BlockDraft, dynamic: DynamicSlots): string {
	const entries = entriesOf(block, dynamic)
	const entry = regionAfter(block.type ?? 'slot', dynamic, entries)
	write(block, dynamic, [...entries, entry])
	return entry[dynamic.idKey] as string
}

/**
 * A copy of a tab beside it, with a copy of each block attached to it.
 *
 * The copy is a tab of its own: a region of its own, named after its title,
 * and blocks named apart from the ones they were copied from.
 */
export function duplicateTab(
	block: BlockDraft,
	dynamic: DynamicSlots,
	id: string,
): string | undefined {
	const entries = entriesOf(block, dynamic)
	const at = indexOf(block, dynamic, id)
	const original = entries[at]
	if (!original) {
		return undefined
	}
	const copy = cloneDraft(original)
	const label = dynamic.labelKey ? original[dynamic.labelKey] : undefined
	const title = typeof label === 'string' && label !== '' ? `${label} copy` : undefined
	if (dynamic.labelKey && title) {
		copy[dynamic.labelKey] = title
	}
	const taken = new Set(
		entries.map((entry) => idOf(entry, dynamic)).filter((key): key is string => !!key),
	)
	const region = slotIdFor(title, `${id}-copy`, taken)
	copy[dynamic.idKey] = region
	entries.splice(at + 1, 0, copy)
	write(block, dynamic, entries)
	const children = block.children ?? []
	for (const child of children.filter((entry) => entry.slot === id)) {
		const twin = cloneDraft(child)
		twin.name = uniqueName(children, twin.name)
		twin.slot = region
		children.push(twin)
	}
	block.children = children
	return region
}

/** A tab gone, and the blocks attached to it, which nothing would show. */
export function removeTab(block: BlockDraft, dynamic: DynamicSlots, id: string): boolean {
	const entries = entriesOf(block, dynamic)
	const at = indexOf(block, dynamic, id)
	if (at === -1) {
		return false
	}
	entries.splice(at, 1)
	write(block, dynamic, entries)
	if (block.children) {
		block.children = block.children.filter((child) => child.slot !== id)
	}
	return true
}

/**
 * A tab put where another one stands, its blocks following it: dropped on a
 * tab further down, it lands after that tab; further up, before it.
 */
export function moveTab(
	block: BlockDraft,
	dynamic: DynamicSlots,
	id: string,
	onto: string,
): void {
	const entries = entriesOf(block, dynamic)
	const from = indexOf(block, dynamic, id)
	const to = indexOf(block, dynamic, onto)
	const [entry] = from === -1 || to === -1 ? [] : entries.splice(from, 1)
	if (!entry || from === to) {
		return
	}
	entries.splice(to, 0, entry)
	write(block, dynamic, entries)
}

/**
 * The keys the simple mode writes for its author.
 *
 * A form's field is sent under a key, and the key is a name only code reads.
 * Someone building a page names the field — its label — and the key follows
 * from that: `Delivery date` is sent as `deliveryDate`, kept unique within the
 * block, and renamed with the label for as long as it is the key the label
 * gave and the saved page does not send it yet. A key that says anything else
 * was chosen by someone, in the advanced view or in the code, and a key the
 * saved page sends may already be read by code: neither is ever touched.
 */
import { branchOf, descriptorOf } from './catalog'
import { findNode, walkDraft } from './draft'
import type { BlockCatalog, BlockDraft, OptionSchema, PageDraft } from './types'

/** One value whose key the builder may write, and what it writes it from. */
interface DerivedKey {
	holder: Record<string, unknown>
	key: string
	source: string
	/** The same entry before the edit, when there was one. */
	previous?: Record<string, unknown>
	/** What the entry is, to name it by when it has no label yet. */
	noun?: string
}

/** The name an entry nobody named is known by. */
const FALLBACK_KEY = 'entry'

interface DeriveOptions {
	/** The page as last saved: the keys it sends are kept whatever the label. */
	saved?: PageDraft | null
	/**
	 * The blocks whose keys are not the builder's to write even so: a form
	 * saving into a table sends each field under its column's name, and a key
	 * following the label would stop filling the column.
	 */
	locked?: (block: BlockDraft) => boolean
}

export function deriveKeys(
	draft: PageDraft,
	previous: PageDraft | null,
	catalog: BlockCatalog | null,
	{ saved = null, locked = () => false }: DeriveOptions = {},
): void {
	const sent = saved ? sentKeys(saved, catalog) : new Set<string>()
	walkDraft(draft.blocks, (block, path) => {
		if (locked(block)) {
			return
		}
		const before = previous ? findNode(previous, path)?.config : undefined
		const found = keysOf(block, before, catalog)
		writeKeys(
			found,
			found.filter((entry) => isDerived(entry, sent)),
		)
	})
}

/**
 * Every key a page sends a field under. Walked over the whole page rather than
 * block by block: laying a block out can move it, and a key the saved code
 * sends must stay put wherever its block went.
 */
function sentKeys(page: PageDraft, catalog: BlockCatalog | null): Set<string> {
	const sent = new Set<string>()
	walkDraft(page.blocks, (block) => {
		for (const entry of keysOf(block, undefined, catalog)) {
			const key = entry.holder[entry.key]
			if (typeof key === 'string') {
				sent.add(key)
			}
		}
	})
	return sent
}

function keysOf(
	block: BlockDraft,
	before: Record<string, unknown> | undefined,
	catalog: BlockCatalog | null,
): DerivedKey[] {
	const descriptor = descriptorOf(catalog, block.type)
	if (!descriptor || block.preserve || !block.config) {
		return []
	}
	const found: DerivedKey[] = []
	for (const [key, schema] of Object.entries(descriptor.config)) {
		collect(block.config[key], schema, before?.[key], found)
	}
	return found
}

/** A key the label gives, camel-cased and stripped to letters and digits. */
export function keyFrom(text: unknown): string | undefined {
	if (typeof text !== 'string') {
		return undefined
	}
	const words = text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.split(/[^A-Za-z0-9]+/)
		.filter((word) => word.length > 0)
	if (words.length === 0) {
		return undefined
	}
	return words
		.map((word, at) =>
			at === 0
				? word.toLowerCase()
				: `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
		)
		.join('')
}

function collect(
	value: unknown,
	schema: OptionSchema | undefined,
	before: unknown,
	found: DerivedKey[],
): void {
	if (!schema || value === null || typeof value !== 'object') {
		return
	}
	if (schema.oneOf?.length) {
		const branch = schema.oneOf[branchOf(schema.oneOf, value)]
		collect(value, branch, before, found)
		return
	}
	if (Array.isArray(value)) {
		const earlier = Array.isArray(before) ? before : []
		value.forEach((item, at) => collect(item, schema.items, earlier[at], found))
		return
	}
	const holder = value as Record<string, unknown>
	const previous = isRecord(before) ? before : undefined
	for (const [key, property] of Object.entries(schema.properties ?? {})) {
		const source = property.ui?.derivedFrom
		if (source) {
			found.push({ holder, key, source, previous, noun: schema.ui?.label })
		}
		collect(holder[key], property, previous?.[key], found)
	}
}

/**
 * Write every key the builder is still the author of, and leave the others.
 *
 * The keys of one block are one namespace — a form's fields are sent side by
 * side, groups or not — so the ones kept are claimed first, and each written
 * one takes the first spelling nothing else holds.
 */
function writeKeys(found: DerivedKey[], written: DerivedKey[]): void {
	const taken = new Set(
		found
			.filter((entry) => !written.includes(entry))
			.map((entry) => entry.holder[entry.key])
			.filter((key): key is string => typeof key === 'string'),
	)
	for (const entry of written) {
		const base =
			keyFrom(entry.holder[entry.source]) ?? keyFrom(entry.noun) ?? FALLBACK_KEY
		const key = unique(base, taken)
		entry.holder[entry.key] = key
		taken.add(key)
	}
}

/**
 * Whether the builder wrote this key and may write it again.
 *
 * Nothing written yet is the builder's to write. A key that is still what it
 * was, and was what the label gave, is the builder's too — until the page is
 * saved sending it; anything else was chosen by someone.
 */
function isDerived(entry: DerivedKey, sent: ReadonlySet<string>): boolean {
	const key = entry.holder[entry.key]
	if (key === undefined || key === '') {
		return true
	}
	const previous = entry.previous
	if (
		typeof key !== 'string' ||
		sent.has(key) ||
		!previous ||
		previous[entry.key] !== key
	) {
		return false
	}
	const base =
		keyFrom(previous[entry.source]) ?? keyFrom(entry.noun) ?? FALLBACK_KEY
	return key === base || new RegExp(`^${base}\\d+$`).test(key)
}

function unique(base: string, taken: Set<string>): string {
	if (!taken.has(base)) {
		return base
	}
	let rank = 2
	while (taken.has(`${base}${rank}`)) {
		rank += 1
	}
	return `${base}${rank}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

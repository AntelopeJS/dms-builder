/**
 * What the canvas hands a block beyond what was served for it, so the page
 * being built follows the draft as it is edited rather than the page as it was
 * last saved.
 */
import { API_PREFIX, QUERY_PREVIEW_PARAMETER } from './constants'
import type { SourceQuery } from './data-source'
import type { BlockNode, BlockTypeDescriptor, OptionSchema } from './types'

/** The settings a value can be laid over as it is: no shape to rebuild. */
const PLAIN_TYPES = new Set(['string', 'number', 'boolean'])

/** The setting a block reads its figures from, as its catalog entry names it. */
const DATA_SOURCE_WIDGET = 'dataSource'

/** A block's settings as the page was saved, by its path in the page. */
export function savedConfigAt(
	blocks: BlockNode[] | undefined,
	path: string,
): Record<string, unknown> | undefined {
	let node: BlockNode | undefined
	let list = blocks
	for (const name of path.split('/')) {
		node = list?.find((entry) => entry.name === name)
		list = node?.children
	}
	return node?.config
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function same(a: unknown, b: unknown): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/** A value a block reads as written: a text, a number, a switch, or nothing. */
function plain(value: unknown): boolean {
	return value === undefined || PLAIN_TYPES.has(typeof value)
}

/**
 * The settings in `served` edited since the save, laid over it, setting by
 * setting; undefined when nothing was.
 *
 * A setting holding settings of its own — what people can do with a row — is
 * gone through the same way, so what the DMS filled in around the saved ones
 * stays: it serves every action a table offers, where the page names only the
 * one it turned off.
 */
function editsOver(
	served: Record<string, unknown>,
	schemas: Record<string, OptionSchema>,
	saved: Record<string, unknown> | undefined,
	draft: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	let edited: Record<string, unknown> | undefined
	for (const [key, schema] of Object.entries(schemas)) {
		const before = saved?.[key]
		const after = draft?.[key]
		if (same(before, after)) {
			continue
		}
		let value: unknown
		if (schema.properties && (after === undefined || isRecord(after))) {
			const inner = isRecord(served[key]) ? served[key] : {}
			value =
				editsOver(
					inner,
					schema.properties,
					isRecord(before) ? before : undefined,
					after,
				) ?? inner
		} else if (PLAIN_TYPES.has(schema.type) || (schema.oneOf && plain(after))) {
			value = after ?? schema.default
		} else {
			continue
		}
		edited ??= { ...served }
		if (value === undefined) {
			delete edited[key]
		} else {
			edited[key] = value
		}
	}
	return edited
}

/**
 * A block rendered from what the DMS served for the saved page, with the
 * settings edited since laid over it.
 *
 * The preview cannot build every block — a table needs the running page — and
 * the canvas then renders the saved shape, which knew nothing of a title typed
 * a moment ago or of an action turned off. A text, a number or a switch is read
 * by the block as written, so it can be laid over what was served, one by one
 * inside a setting that holds several; anything with a shape of its own is left
 * as it was saved. Only what changed is laid over: what the draft leaves as the
 * page saved it may have been filled in by the DMS on the way.
 */
export function withDraftEdits(
	options: Record<string, unknown> | undefined,
	descriptor: BlockTypeDescriptor | undefined,
	saved: Record<string, unknown> | undefined,
	draft: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!options) {
		return options
	}
	return editsOver(options, descriptor?.config ?? {}, saved, draft) ?? options
}

/** The blocks that are nothing but room, drawn on the canvas so it shows. */
export const ROOM_BLOCKS = new Set(['Spacer'])

/**
 * The sizing a room block's wrapper carries. The canvas wraps every block in a
 * div of its own, and that div — not the spacer — is what a stack lays out:
 * the spacer's share of the free room and its bounds would apply inside a box
 * that never grows. The page lays the spacer out itself, with these.
 */
export function roomStyle(
	type: string | undefined,
	options: Record<string, unknown> | undefined,
): Record<string, string | number> | undefined {
	if (!type || !ROOM_BLOCKS.has(type)) {
		return undefined
	}
	const length = (value: unknown): string | undefined =>
		typeof value === 'string' && value.trim() !== '' ? value : undefined
	const style: Record<string, string | number | undefined> = {
		flexGrow: typeof options?.grow === 'number' ? options.grow : 1,
		flexShrink: 1,
		flexBasis: 'auto',
		minWidth: length(options?.minSize),
		maxWidth: length(options?.maxSize),
		minHeight: length(options?.minSize),
		maxHeight: length(options?.maxSize),
	}
	return Object.fromEntries(
		Object.entries(style).filter(([, value]) => value !== undefined),
	) as Record<string, string | number>
}

/**
 * Where the canvas reads a source built here: the builder's preview of the
 * query as the draft holds it, answered the way its route will answer once the
 * page is saved. The route itself serves the saved query, or none for a source
 * built since.
 */
export function sourcePreviewUrl(query: SourceQuery): string {
	const { name, resource, template, params, response, compare } = query
	const input = JSON.stringify({ name, resource, template, params, response, compare })
	return `${API_PREFIX}/query-preview?${QUERY_PREVIEW_PARAMETER}=${encodeURIComponent(input)}`
}

/**
 * A card that reads a source built here, pointed at the preview of that
 * source, so changing what it measures redraws it as changing how it draws
 * does. A source the page's code answers is left to the code.
 */
export function withDraftSource(
	options: Record<string, unknown> | undefined,
	descriptor: BlockTypeDescriptor | undefined,
	query: SourceQuery | undefined,
): Record<string, unknown> | undefined {
	if (!options || !query?.resource || !query.template) {
		return options
	}
	const keys = Object.entries(descriptor?.config ?? {})
		.filter(([key, schema]) => schema.ui?.widget === DATA_SOURCE_WIDGET && typeof options[key] === 'string')
		.map(([key]) => key)
	if (!keys.length) {
		return options
	}
	const url = sourcePreviewUrl(query)
	return { ...options, ...Object.fromEntries(keys.map((key) => [key, url])) }
}

/**
 * What a block reads its figures from, to render it anew when that changes: a
 * card fetches once, as it mounts, and a new source would otherwise go unread.
 */
export function sourceKeyOf(
	options: Record<string, unknown> | undefined,
	descriptor: BlockTypeDescriptor | undefined,
): string {
	return Object.entries(descriptor?.config ?? {})
		.filter(([, schema]) => schema.ui?.widget === DATA_SOURCE_WIDGET)
		.map(([key]) => String(options?.[key] ?? ''))
		.join('\u0000')
}

/**
 * The settings a block reads once, as it mounts, rather than as they change: a
 * tree loads the items listed for it when it is set up, and knows which start
 * open only then.
 */
const READ_ONCE: Readonly<Record<string, readonly string[]>> = {
	Tree: ['staticNodes', 'defaultExpanded'],
}

/**
 * What the canvas renders a block anew on: its source, and the settings it reads
 * only once. An edit to one would otherwise go unseen until the page reloads.
 */
export function remountKeyOf(
	type: string | undefined,
	options: Record<string, unknown> | undefined,
	descriptor: BlockTypeDescriptor | undefined,
): string {
	const once = READ_ONCE[type ?? ''] ?? []
	return [
		sourceKeyOf(options, descriptor),
		...once.map((key) => JSON.stringify(options?.[key] ?? null)),
	].join('\u0000')
}

/** A short, stable digest of `text`: enough to tell two revisions apart. */
function digest(text: string): string {
	let hash = 5381
	for (let at = 0; at < text.length; at += 1) {
		hash = ((hash << 5) + hash + text.charCodeAt(at)) | 0
	}
	return (hash >>> 0).toString(36)
}

/**
 * The id the canvas mounts a block under. A block that reads some settings only
 * as it mounts keeps what it loaded under a key made of its id — a tree loads
 * its items through the DMS's async data — and mounting it anew under the same
 * id hands it back the items it loaded first. Its id follows those settings.
 */
export function mountIdOf(
	type: string | undefined,
	path: string,
	options: Record<string, unknown> | undefined,
): string {
	const once = READ_ONCE[type ?? '']
	if (!once) {
		return path
	}
	return `${path}~${digest(once.map((key) => JSON.stringify(options?.[key] ?? null)).join('\u0000'))}`
}

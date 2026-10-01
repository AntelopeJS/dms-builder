/**
 * What the canvas hands a block beyond what was served for it, so the page
 * being built follows the draft as it is edited rather than the page as it was
 * last saved.
 */
import { API_PREFIX, QUERY_PREVIEW_PARAMETER } from './constants'
import type { SourceQuery } from './data-source'
import type { BlockNode, BlockTypeDescriptor } from './types'

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

/**
 * A block rendered from what the DMS served for the saved page, with the plain
 * settings edited since laid over it.
 *
 * The preview cannot build every block — a table needs the running page — and
 * the canvas then renders the saved shape, which knew nothing of a title typed
 * a moment ago. A text, a number or a switch is read by the block as written,
 * so it can be laid over what was served; anything with a shape of its own is
 * left as it was saved. Only what changed is laid over: what the draft leaves
 * as the page saved it may have been filled in by the DMS on the way.
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
	let edited: Record<string, unknown> | undefined
	for (const [key, schema] of Object.entries(descriptor?.config ?? {})) {
		const before = saved?.[key]
		const after = draft?.[key]
		if (!PLAIN_TYPES.has(schema.type) || before === after) {
			continue
		}
		edited ??= { ...options }
		const value = after ?? schema.default
		if (value === undefined) {
			delete edited[key]
		} else {
			edited[key] = value
		}
	}
	return edited ?? options
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

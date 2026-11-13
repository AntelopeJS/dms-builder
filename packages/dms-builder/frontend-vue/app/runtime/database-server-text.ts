import type { OpenItem } from './database-types'
import { t } from './i18n'

/**
 * What the analysis and the database drivers word in English, read in the active locale. A
 * question the builder can rebuild from its item, a driver's lossy-reading reason and a column
 * trait are translated; any other text the server sends is shown as sent.
 */

const LOSSY_READINGS: ReadonlyArray<readonly [reason: string, key: string]> = [
	['a bigint beyond 2^53 loses precision as a number; declare it string to read it exactly', 'bigint'],
	['a numeric loses precision as a number; declare it string to read it exactly', 'numeric'],
	['a real widened to a number is not the decimal it was written as', 'real'],
	['microseconds are truncated to milliseconds', 'microseconds'],
	['json is read as jsonb: duplicate keys, key order and whitespace are not kept', 'json'],
	['a BIGINT beyond 2^53 loses precision as a number; declare it string to read it exactly', 'bigint'],
	['a DECIMAL loses precision as a number; declare it string to read it exactly', 'decimal'],
	['a FLOAT widened to a number is not the decimal it was written as', 'float'],
	['a DATETIME holds no time zone and is read as UTC', 'datetime'],
]

/** The openings of a longer reason, each with the key of the text that words it and takes the rest of the reason as `{rest}`. */
const LOSSY_PREFIXES: ReadonlyArray<readonly [prefix: string, key: string]> = [
	['a timestamp without time zone is read as UTC; ', 'timestamp'],
	['a DATETIME holds no time zone and is read as UTC; ', 'datetime_and'],
]

const TRAITS: ReadonlySet<string> = new Set(['identifier-like', 'enum-like', 'measure', 'time-axis', 'label-candidate'])

/** The schemas question counts the tables its options stand for, as `schema (count)` titles. */
function tablesBehind(item: OpenItem): number {
	return item.options.reduce((total, option) => total + Number(/\((\d+)\)$/.exec(option.title)?.[1] ?? 0), 0)
}

/** The text an open item asks, in the active locale when the builder can word it from the item alone. */
export function questionText(item: OpenItem): string {
	const relation = item.relation ?? ''
	switch (item.kind) {
		case 'schemas':
			return t('database.server.schemas', { count: tablesBehind(item) })
		case 'label':
			return t('database.server.label', { relation })
		case 'purpose':
			return t('database.server.purpose', { relation })
		default:
			return item.question
	}
}

/** A driver's reason a declaration does not round-trip, in the active locale when it is a known one. */
export function lossyText(reason: string): string {
	const known = LOSSY_READINGS.find(([text]) => text === reason)
	if (known) return t(`database.server.lossy.${known[1]}`)
	const opening = LOSSY_PREFIXES.find(([prefix]) => reason.startsWith(prefix))
	if (opening) {
		const [prefix, key] = opening
		return t(`database.server.lossy.${key}`, { rest: lossyText(reason.slice(prefix.length)) })
	}
	return reason
}

/** A column trait the analysis measured, in the active locale when it is a known one. */
export function traitText(trait: string): string {
	return TRAITS.has(trait) ? t(`database.server.trait.${trait}`) : trait
}

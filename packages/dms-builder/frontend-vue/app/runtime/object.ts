/** A copy of `record` without `key`, so a patch can remove an option. */
function withoutKey<T>(
	record: Record<string, T>,
	key: string,
): Record<string, T> {
	const next: Record<string, T> = {}
	for (const [entry, value] of Object.entries(record)) {
		if (entry !== key) {
			next[entry] = value
		}
	}
	return next
}

/** Apply a patch, dropping the keys it sets to `undefined`. */
export function mergePatch<T>(
	record: Record<string, T>,
	patch: Record<string, T | undefined>,
): Record<string, T> {
	let next = { ...record }
	for (const [key, value] of Object.entries(patch)) {
		next = value === undefined ? withoutKey(next, key) : { ...next, [key]: value }
	}
	return next
}

/** A plain object: not null, and not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether two JSON values are equal, compared by what they serialise to. */
export function same(a: unknown, b: unknown): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b)
}

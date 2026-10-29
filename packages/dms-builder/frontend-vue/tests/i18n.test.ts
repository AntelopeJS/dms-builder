import { describe, expect, it } from 'vitest'
import { ACTION_LABEL } from '../app/runtime/constants'
import english from '../i18n/locales/builder-en-GB.json'
import french from '../i18n/locales/builder-fr-FR.json'

/**
 * The DMS header draws the builder's entry point from a `$` key, which it
 * reads in the active locale. The catalog invariants (parity, placeholders,
 * key presence, literal text) are checked by
 * `packages/dms-builder/scripts/frontend-source-check.cjs`.
 */

type Messages = { [key: string]: string | Messages }

function flatten(messages: Messages, prefix = ''): Map<string, string> {
	const entries = new Map<string, string>()
	for (const [key, value] of Object.entries(messages)) {
		const path = prefix ? `${prefix}.${key}` : key
		if (typeof value === 'string') {
			entries.set(path, value)
		} else {
			flatten(value, path).forEach((text, nested) => entries.set(nested, text))
		}
	}
	return entries
}

const en = flatten(english as Messages)
const fr = flatten(french as Messages)

describe('builder i18n', () => {
	it('hands the DMS header a key for the entry point, in both languages', () => {
		expect(ACTION_LABEL.startsWith('$')).toBe(true)
		const key = ACTION_LABEL.slice(1)
		expect(en.get(key)).toBe('Builder — edit this page')
		expect(fr.get(key)).toBe('Builder — modifier cette page')
	})
})

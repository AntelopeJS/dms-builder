import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACTION_LABEL } from '../app/runtime/constants'
import { I18N_NAMESPACE } from '../app/runtime/i18n'
import english from '../i18n/locales/builder-en-GB.json'
import french from '../i18n/locales/builder-fr-FR.json'

/**
 * The builder speaks the author's language: its texts live in the module's
 * catalogs, which the DMS loader merges into the app's, and the code holds
 * keys. These keep the two catalogs in step, every key the code reads
 * present, and the surfaces already translated free of literal English.
 */

type Messages = { [key: string]: string | Messages }

const APP = new URL('../app/', import.meta.url)

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

function placeholders(message: string): string[] {
	return [...new Set([...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort()
}

function sources(directory: URL): { name: string; text: string }[] {
	return readdirSync(directory, { recursive: true, encoding: 'utf8' })
		.filter((name) => /\.(ts|vue)$/.test(name))
		.map((name) => ({
			name,
			text: readFileSync(new URL(name.replaceAll('\\', '/'), directory), 'utf8'),
		}))
}

const en = flatten(english as Messages)
const fr = flatten(french as Messages)

/**
 * The surfaces whose every text goes through the catalog: the entry point the
 * DMS header draws, the editor's bar and the strips over the page. A literal
 * written there again would be shown in English whatever the language.
 */
const TRANSLATED_COMPONENTS = ['components/Bar.vue', 'components/Banners.vue']

/** The attributes a person reads or hears: labels, titles, descriptions. */
const READ_ATTRIBUTES = /(?:^|\s)(label|aria-label|title|description|placeholder|text)="([^"]*)"/g

/** A template's text, its tags, comments and interpolations taken out. */
function templateText(source: string): string {
	const template = source.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? ''
	return template
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/\{\{[\s\S]*?\}\}/g, ' ')
		.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ')
}

describe('builder i18n', () => {
	it('keeps every message under the module namespace', () => {
		expect(Object.keys(english)).toEqual([I18N_NAMESPACE])
		expect(Object.keys(french)).toEqual([I18N_NAMESPACE])
	})

	it('translates every English message into French, with the same placeholders', () => {
		expect([...fr.keys()].sort()).toEqual([...en.keys()].sort())
		for (const [key, message] of en) {
			expect(placeholders(fr.get(key) ?? ''), key).toEqual(placeholders(message))
		}
	})

	it('writes no character vue-i18n would read as syntax', () => {
		// `@` starts a linked message and breaks the compile of the whole text.
		for (const [key, message] of [...en, ...fr]) {
			expect(message, key).not.toMatch(/@/)
		}
	})

	it('reads only keys the catalog holds', () => {
		const missing: string[] = []
		for (const { name, text } of sources(APP)) {
			for (const match of text.matchAll(/\b(?:t|displayKey)\(\s*'([\w.]+)'/g)) {
				if (!en.has(`${I18N_NAMESPACE}.${match[1]}`)) {
					missing.push(`${name}: ${match[1]}`)
				}
			}
			for (const match of text.matchAll(/\bt\(\s*`([\w.]+)\$\{/g)) {
				const prefix = `${I18N_NAMESPACE}.${match[1]}`
				if (![...en.keys()].some((key) => key.startsWith(prefix))) {
					missing.push(`${name}: ${match[1]}…`)
				}
			}
		}
		expect(missing).toEqual([])
	})

	it('hands the DMS header a key for the entry point, in both languages', () => {
		expect(ACTION_LABEL.startsWith('$')).toBe(true)
		const key = ACTION_LABEL.slice(1)
		expect(en.get(key)).toBe('Builder — edit this page')
		expect(fr.get(key)).toBe('Builder — modifier cette page')
	})

	it('says nothing in a toast that is not a translated message', () => {
		const literal: string[] = []
		for (const { name, text } of sources(APP)) {
			for (const match of text.matchAll(/\bnotify\(\s*(['"`])/g)) {
				literal.push(`${name}: ${text.slice(match.index, match.index + 60)}`)
			}
		}
		expect(literal).toEqual([])
	})

	it.each(TRANSLATED_COMPONENTS)('writes no literal text in %s', (path) => {
		const source = readFileSync(new URL(path, APP), 'utf8')
		const attributes = [...source.matchAll(READ_ATTRIBUTES)]
			.filter((match) => /[A-Za-z]/.test(match[2]))
			.map((match) => `${match[1]}="${match[2]}"`)
		expect(attributes).toEqual([])
		expect(templateText(source).match(/[A-Za-z][^<]*/g) ?? []).toEqual([])
	})
})

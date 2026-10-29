import { describe, expect, it } from 'vitest'
import { categoryOptions } from '../app/runtime/categories'
import { displayText } from '../app/runtime/i18n'
import { blockTitle } from '../app/runtime/naming'
import { pageLinkItems } from '../app/runtime/page-links'
import type { CategorySummary, PageSummary } from '../app/runtime/types'
import { testCatalog } from './support/builder-harness'

/**
 * An app names its pages and writes its headings as DMS display strings: a
 * value marked with `$` is a key of its catalog. The editor shows them the way
 * the page does, in the reader's language, and leaves the stored value — the
 * key — to the fields that edit it.
 *
 * The test composer reads the builder's English catalog, so the keys used
 * here are the builder's own.
 */

const KEY = '$dms_builder.bar.modes.advanced'
const TEXT = 'Developer'

function page(displayName: string): PageSummary {
	return { ref: '/home', id: 'home', displayName, category: 'main', filepath: 'pages/home.ts' }
}

describe('display strings', () => {
	it('reads a `$` key in the active locale and shows anything else as written', () => {
		expect(displayText(KEY)).toBe(TEXT)
		expect(displayText('Home')).toBe('Home')
		expect(displayText('')).toBe('')
		expect(displayText('Price in $')).toBe('Price in $')
	})

	it('names a block by its translated heading or prose', () => {
		const catalog = testCatalog()
		expect(blockTitle({ name: 'hero', type: 'Text', config: { title: KEY } }, catalog)).toBe(TEXT)
		expect(blockTitle({ name: 'intro', type: 'Text', config: { content: KEY } }, catalog)).toBe(
			TEXT,
		)
	})

	it('lists pages and categories by their translated names', () => {
		expect(pageLinkItems([page(KEY)]).map((item) => item.label)).toEqual([TEXT])
		const categories: CategorySummary[] = [{ ref: 'main', displayName: KEY } as CategorySummary]
		expect(categoryOptions(categories).map((option) => option.label)).toEqual([TEXT])
	})
})

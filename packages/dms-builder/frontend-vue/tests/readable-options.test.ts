import { describe, expect, it } from 'vitest'
import { newBlockDraft } from '../app/runtime/catalog'
import { codeSpans } from '../app/runtime/inline-code'
import { linkedPage, linksToPage, pageLinkItems } from '../app/runtime/page-links'
import type { BlockTypeDescriptor, PageSummary } from '../app/runtime/types'
import { enumColour, enumLabel } from '../app/runtime/value-labels'

/**
 * A block's options in the words of someone building a page: its choices as
 * words, its help without the backticks, and a link picked among the pages.
 */

describe('a choice a block declares no label for', () => {
	it('reads a size as the letters a size reads as', () => {
		expect(['xs', 'sm', 'md', 'lg', 'xl'].map(enumLabel)).toEqual([
			'XS',
			'S',
			'M',
			'L',
			'XL',
		])
	})

	it('reads anything else as words, its first letter up', () => {
		expect(enumLabel('elevated')).toBe('Elevated')
		expect(enumLabel('rangeArea')).toBe('Range area')
		expect(enumLabel('is_not')).toBe('Is not')
		expect(enumLabel('array-contains')).toBe('Array contains')
	})

	it('draws a tone in its own colour, and nothing else', () => {
		expect(enumColour('warning')).toBe('warning')
		expect(enumColour('muted')).toBeUndefined()
		expect(enumColour('left')).toBeUndefined()
	})
})

describe('help quoting code', () => {
	it('splits the quoted words out, the rest kept as text', () => {
		expect(codeSpans('`sm` is the compact one-line banner.')).toEqual([
			{ text: 'sm', code: true },
			{ text: ' is the compact one-line banner.', code: false },
		])
		expect(codeSpans('Off inside a `Card`.')).toEqual([
			{ text: 'Off inside a ', code: false },
			{ text: 'Card', code: true },
			{ text: '.', code: false },
		])
	})

	it('leaves help without any as one piece of text', () => {
		expect(codeSpans('Tighter rows.')).toEqual([{ text: 'Tighter rows.', code: false }])
	})
})

describe('a link to another page', () => {
	const pages: PageSummary[] = [
		{ ref: '/shop/orders', id: 'orders', displayName: 'Orders', category: 'pages.shop', filepath: '', icon: 'i-ph-receipt' },
		{ ref: '/shop/board', id: 'board', displayName: 'Board', category: 'pages.shop', filepath: '' },
	]

	it('is a link a reader follows, not a route the page calls', () => {
		expect(linksToPage('to', 'url')).toBe(true)
		expect(linksToPage('backTo', 'url')).toBe(true)
		expect(linksToPage('submitUrl', 'url')).toBe(false)
		expect(linksToPage('to', 'text')).toBe(false)
	})

	it('offers the pages by name, and writes the page address', () => {
		expect(pageLinkItems(pages)).toEqual([
			{ label: 'Board', icon: 'i-ph-file-light', ref: '/shop/board' },
			{ label: 'Orders', icon: 'i-ph-receipt', ref: '/shop/orders' },
		])
	})

	it('names the page a link leads to, when it is one of them', () => {
		expect(linkedPage(pages, '/shop/orders')?.displayName).toBe('Orders')
		expect(linkedPage(pages, 'https://antelopejs.com')).toBeUndefined()
		expect(linkedPage(pages, undefined)).toBeUndefined()
	})
})

describe('a block placed', () => {
	function descriptor(type: string, label: string, config: BlockTypeDescriptor['config']) {
		return { type, label, container: false, configOrigin: 'test', config } as BlockTypeDescriptor
	}

	it('is titled and numbered when its title also takes composed text', () => {
		const banner = descriptor('Banner', 'Banner', {
			title: {
				type: 'union',
				optional: true,
				oneOf: [{ type: 'string' }, { type: 'object' }],
				ui: { widget: 'text' },
			},
		})
		expect(newBlockDraft(banner, 2).config).toEqual({ title: 'Banner 2' })
	})

	it("is titled by its caption, as a table's heading is", () => {
		const table = descriptor('TableView', 'Table', {
			caption: { type: 'string', optional: true },
		})
		expect(newBlockDraft(table).config).toEqual({ caption: 'Table 1' })
	})
})

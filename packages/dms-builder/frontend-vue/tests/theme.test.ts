import { describe, expect, it } from 'vitest'
import {
	logoRefusal,
	previewDeclarations,
	previewLogo,
	type ThemeEditorState,
	trimmedVariables,
	valueProblem,
} from '../app/runtime/theme'
import { isVariableName, otherVariables } from '../app/runtime/theme-catalog'
import { sheetText } from '../app/runtime/theme-mirror'

/**
 * The theme editor's live preview: what it puts on the page before anything is
 * saved, and what it refuses before a save is attempted.
 */

function editorState(overrides: Partial<ThemeEditorState>): ThemeEditorState {
	return {
		structure: null,
		draft: { variables: { light: {}, dark: {} }, logos: {} },
		baseline: { variables: { light: {}, dark: {} }, logos: {} },
		pending: {},
		loading: false,
		error: null,
		shownLogos: null,
		...overrides,
	}
}

describe('the preview', () => {
	it("declares the draft's values", () => {
		expect(previewDeclarations({ '--ui-primary': '#7c3aed' }, {})).toEqual([
			['--ui-primary', '#7c3aed'],
		])
	})

	it('hands a dropped saved override back to the DMS default', () => {
		expect(previewDeclarations({}, { '--ui-radius': '1rem' })).toEqual([
			['--ui-radius', 'revert-layer'],
		])
	})

	it('leaves out a value the theme could not be saved with', () => {
		expect(
			previewDeclarations({ '--ui-bg': 'white; } body { display: none' }, {}),
		).toEqual([])
	})
})

describe('a theme value', () => {
	it('is refused when it could end its declaration or its rule', () => {
		expect(valueProblem('red; }')).toMatch(/cannot hold/)
		expect(valueProblem('url(https://example.test/x.png)')).toMatch(/cannot hold/)
	})

	it('is taken otherwise, whatever CSS it is', () => {
		expect(valueProblem('oklch(55% 0.2 290)')).toBe(undefined)
		expect(valueProblem('"Inter", ui-sans-serif, sans-serif')).toBe(undefined)
		expect(valueProblem('0 1px 2px rgba(0, 0, 0, 0.4)')).toBe(undefined)
	})
})

describe('a theme sent to the module', () => {
	it('carries its values without the spaces typed around them', () => {
		expect(
			trimmedVariables({ light: { '--ui-primary': ' #7c3aed ' }, dark: { '--font-sans': '"Inter", sans-serif ' } }),
		).toEqual({ light: { '--ui-primary': '#7c3aed' }, dark: { '--font-sans': '"Inter", sans-serif' } })
	})
})

describe('the logo a slot previews', () => {
	it('is the file picked, before the path the draft keeps', () => {
		const state = editorState({
			pending: {
				'default:light': {
					upload: { slot: 'default', mode: 'light', contentType: 'image/png', data: '' },
					url: 'blob:picked',
				},
			},
		})
		expect(previewLogo(state, 'default', 'light')).toBe('blob:picked')
	})

	it('is the logo shown when the editor opened, for a slot the theme never set', () => {
		const state = editorState({ shownLogos: { default: { dark: '/images/antelope-logo/dark.svg' } } })
		expect(previewLogo(state, 'default', 'dark')).toBe('/images/antelope-logo/dark.svg')
	})

	it('is left alone when the draft drops a saved logo, whose default nobody named', () => {
		const state = editorState({
			baseline: { variables: { light: {}, dark: {} }, logos: { collapsed: { light: '/branding/a.svg' } } },
			shownLogos: { collapsed: { light: '/branding/a.svg' } },
		})
		expect(previewLogo(state, 'collapsed', 'light')).toBe(undefined)
	})
})

describe('a logo file', () => {
	it('is refused before the save when it is not an image the module takes', () => {
		expect(logoRefusal({ type: 'image/gif', size: 10 })).toMatch(/SVG, PNG, WebP or ICO/)
	})

	it('is refused when it is larger than the module accepts', () => {
		expect(logoRefusal({ type: 'image/png', size: 600 * 1024 })).toMatch(/512 KiB/)
	})

	it('is accepted otherwise', () => {
		expect(logoRefusal({ type: 'image/svg+xml', size: 2048 })).toBe(undefined)
	})
})

describe('the variables beyond the catalog', () => {
	it('are the names the catalog does not list, once each and sorted', () => {
		expect(otherVariables(['--z-index', '--ui-primary', '--brand', '--brand'])).toEqual([
			'--brand',
			'--z-index',
		])
	})

	it('are named like CSS custom properties', () => {
		expect(isVariableName('--brand-500')).toBe(true)
		expect(isVariableName('brand')).toBe(false)
		expect(isVariableName('--a b')).toBe(false)
	})
})

describe('a stylesheet copied to read both modes', () => {
	const rules = (...texts: string[]) => texts.map((cssText) => ({ cssText }))

	it('keeps its rules, in order', () => {
		expect(
			sheetText({ media: { mediaText: '' }, cssRules: rules(':root { --a: 1px; }', '.dark { --a: 2px; }') }),
		).toBe(':root { --a: 1px; }\n.dark { --a: 2px; }')
	})

	it('keeps the media it is for', () => {
		expect(sheetText({ media: { mediaText: 'print' }, cssRules: rules('a { color: red; }') })).toBe(
			'@media print {\na { color: red; }\n}',
		)
	})

	it('leaves out the imports the page already resolved', () => {
		expect(
			sheetText({ media: { mediaText: '' }, cssRules: rules('@import url("x.css");', 'b { color: red; }') }),
		).toBe('b { color: red; }')
	})

	it('is empty for a stylesheet the page may not read', () => {
		const foreign = {
			media: { mediaText: '' },
			get cssRules(): ArrayLike<{ cssText: string }> {
				throw new Error('SecurityError')
			},
		}
		expect(sheetText(foreign)).toBe('')
	})
})

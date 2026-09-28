import { describe, expect, it } from 'vitest'
import {
	logoRefusal,
	previewLogo,
	previewStylesheet,
	type ThemeEditorState,
} from '../app/runtime/theme'
import { isVariableName, otherVariables } from '../app/runtime/theme-catalog'

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

describe('the preview stylesheet', () => {
	it('declares each mode under the selector the DMS keys it on', () => {
		const css = previewStylesheet(
			{ light: { '--ui-primary': '#7c3aed' }, dark: { '--ui-primary': '#a78bfa' } },
			{ light: {}, dark: {} },
		)
		expect(css).toBe(':root { --ui-primary: #7c3aed; }\n.dark { --ui-primary: #a78bfa; }')
	})

	it('hands a dropped saved override back to the DMS default', () => {
		const css = previewStylesheet(
			{ light: {}, dark: { '--ui-bg': '#000000' } },
			{ light: { '--ui-radius': '1rem' }, dark: { '--ui-bg': '#111111' } },
		)
		expect(css).toBe(':root { --ui-radius: revert-layer; }\n.dark { --ui-bg: #000000; }')
	})

	it('is empty for a theme that overrides nothing', () => {
		expect(previewStylesheet({ light: {}, dark: {} }, { light: {}, dark: {} })).toBe('')
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

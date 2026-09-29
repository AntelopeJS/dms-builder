import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	logoContentType,
	logoRefusal,
	previewDeclarations,
	previewLogo,
	rebaseTheme,
	type ThemeEditorState,
	themeIssues,
	trimmedVariables,
	valueProblem,
} from '../app/runtime/theme'
import { isVariableName, otherVariables } from '../app/runtime/theme-catalog'
import { sheetText } from '../app/runtime/theme-mirror'
import { forgetThemeSave, rememberThemeSave, reloadsPage, takeThemeSave } from '../app/runtime/theme-reload'

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

describe('a value of the wrong kind', () => {
	/** The browser's answer, for the one value these tests call wrong. */
	function stubBrowser(): void {
		vi.stubGlobal('CSS', { supports: (_property: string, value: string) => value !== 'notacolor' })
	}

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('is refused by the kind its row expects', () => {
		stubBrowser()
		expect(valueProblem('notacolor', 'color')).toBe('is not a color')
		expect(valueProblem('#7c3aed', 'color')).toBe(undefined)
	})

	it('is not what an empty cell holds: it keeps the default', () => {
		vi.stubGlobal('CSS', { supports: (_property: string, value: string) => value !== '' })
		expect(valueProblem('', 'color')).toBe(undefined)
	})

	it('is left out of the preview', () => {
		stubBrowser()
		expect(previewDeclarations({ '--ui-primary': 'notacolor', '--brand': 'notacolor' }, {})).toEqual([
			['--brand', 'notacolor'],
		])
	})

	it('keeps the theme from being saved, named after its row and its mode', () => {
		stubBrowser()
		expect(
			themeIssues({ light: { '--ui-primary': 'notacolor' }, dark: { '--brand': 'red; }' } }).map(
				(issue) => issue.message,
			),
		).toEqual([
			'Primary (light) is not a color',
			'--brand (dark) cannot hold ; { } < > \\, a comment, url(), @import or !important',
		])
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
		expect(logoRefusal({ name: 'logo.gif', type: 'image/gif', size: 10 })).toMatch(/SVG, PNG, WebP or ICO/)
	})

	it('is refused when it is larger than the module accepts', () => {
		expect(logoRefusal({ name: 'logo.png', type: 'image/png', size: 600 * 1024 })).toMatch(/512 KiB/)
	})

	it('is accepted otherwise', () => {
		expect(logoRefusal({ name: 'logo.svg', type: 'image/svg+xml', size: 2048 })).toBe(undefined)
	})

	it('is taken as an icon under either name browsers give one', () => {
		expect(logoRefusal({ name: 'logo.ico', type: 'image/vnd.microsoft.icon', size: 2048 })).toBe(undefined)
		expect(logoRefusal({ name: 'logo.ico', type: 'image/x-icon', size: 2048 })).toBe(undefined)
	})

	it('is typed after its extension when the browser gives no type', () => {
		expect(logoContentType({ name: 'Logo.ICO', type: '', size: 10 })).toBe('image/x-icon')
		expect(logoContentType({ name: 'logo.webp', type: '', size: 10 })).toBe('image/webp')
		expect(logoContentType({ name: 'logo.jpg', type: '', size: 10 })).toBe(undefined)
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

describe('a theme save across the reload it causes', () => {
	/** A tab's session storage, kept in a map. */
	function stubStorage(): void {
		const items = new Map<string, string>()
		vi.stubGlobal('sessionStorage', {
			getItem: (key: string) => items.get(key) ?? null,
			setItem: (key: string, value: string) => items.set(key, value),
			removeItem: (key: string) => items.delete(key),
		})
	}

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('is found by the page load that follows it, once', () => {
		stubStorage()
		rememberThemeSave('/shop/board', 'Theme saved', 1_000)
		expect(takeThemeSave(3_000)).toEqual({ route: '/shop/board', message: 'Theme saved', at: 1_000 })
		expect(takeThemeSave(3_000)).toBe(undefined)
	})

	it('is not found once the save answered, nor by a page load long after it', () => {
		stubStorage()
		rememberThemeSave('/shop/board', 'Theme saved', 1_000)
		forgetThemeSave()
		expect(takeThemeSave(2_000)).toBe(undefined)
		rememberThemeSave('/shop/board', 'Theme saved', 1_000)
		expect(takeThemeSave(1_000 + 60_000)).toBe(undefined)
	})

	it('reloads the page unless it wrote the stylesheet alone', () => {
		const change = (path: string) => ({ path, kind: 'modify' as const, diff: '' })
		expect(reloadsPage([change('/layer/app/assets/css/theme.css')])).toBe(false)
		expect(reloadsPage([change('/layer/app/assets/css/theme.css'), change('/layer/app/app.config.ts')])).toBe(true)
		expect(reloadsPage([change('/layer/public/branding/default-light-0a1b2c3d.svg')])).toBe(true)
	})

	it('is simply not remembered where the browser refuses storage', () => {
		vi.stubGlobal('sessionStorage', {
			getItem: () => {
				throw new Error('SecurityError')
			},
			setItem: () => {
				throw new Error('SecurityError')
			},
			removeItem: () => {
				throw new Error('SecurityError')
			},
		})
		expect(() => rememberThemeSave('/shop/board', 'Theme saved')).not.toThrow()
		expect(takeThemeSave()).toBe(undefined)
	})
})

describe('a draft moved onto the theme read again', () => {
	const theme = (light: Record<string, string>, logos = {}) => ({ variables: { light, dark: {} }, logos })

	it("keeps the author's changes, and takes what the files now hold for the rest", () => {
		const from = theme({ '--ui-primary': '#111111', '--ui-bg': '#ffffff', '--ui-radius': '1rem' })
		const draft = theme({ '--ui-primary': '#7c3aed', '--ui-radius': '1rem', '--ui-text': '#222222' })
		const onto = theme({ '--ui-primary': '#333333', '--ui-bg': '#fafafa', '--ui-radius': '2rem' })
		expect(rebaseTheme(draft, from, onto).variables.light).toEqual({
			'--ui-primary': '#7c3aed',
			'--ui-radius': '2rem',
			'--ui-text': '#222222',
		})
	})

	it('moves the logos the same way, slot by slot', () => {
		const from = theme({}, { default: { light: '/branding/a.svg' } })
		const draft = theme({}, {})
		const onto = theme({}, { default: { light: '/branding/a.svg', dark: '/branding/b.svg' } })
		expect(rebaseTheme(draft, from, onto).logos).toEqual({ default: { dark: '/branding/b.svg' } })
	})
})

import { describe, expect, it } from 'vitest'
import {
	emptyVariables,
	rebaseTheme,
	sameLogo,
	simpleLogoSlots,
	themeChangeCount,
	themeIssues,
	type PendingLogo,
} from '../app/runtime/theme'
import { previewDeclarations, previewPalettes } from '../app/runtime/theme-preview'
import { emailLogoSize, svgAspect } from '../app/runtime/theme-raster'
import { reloadsPage } from '../app/runtime/theme-reload'
import type { ThemeDraft } from '../app/runtime/types'

const valid = (): boolean => true

function theme(overrides: Partial<ThemeDraft> = {}): ThemeDraft {
	return { variables: emptyVariables(), colors: {}, logos: {}, ...overrides }
}

function pending(data: string): PendingLogo {
	return { upload: { slot: 'default', mode: 'light', contentType: 'image/png', data }, url: 'blob:x' }
}

describe('the preview of the variables', () => {
	it('folds the shared values into each mode, a mode keeping its own', () => {
		const draft = { shared: { '--ui-radius': '0rem', '--ui-bg': 'white' }, light: {}, dark: { '--ui-bg': 'black' } }
		expect(previewDeclarations(draft, emptyVariables(), 'light', valid)).toEqual([
			['--ui-radius', '0rem'],
			['--ui-bg', 'white'],
		])
		expect(previewDeclarations(draft, emptyVariables(), 'dark', valid)).toEqual([
			['--ui-radius', '0rem'],
			['--ui-bg', 'black'],
		])
	})

	it('hands a saved value the draft dropped back to the DMS', () => {
		const saved = { shared: {}, light: { '--ui-bg': 'snow' }, dark: {} }
		expect(previewDeclarations(emptyVariables(), saved, 'light', valid)).toEqual([['--ui-bg', 'revert-layer']])
		expect(previewDeclarations(emptyVariables(), saved, 'dark', valid)).toEqual([])
	})

	it('keeps a shared value on screen when only the mode of it is dropped', () => {
		const saved = { shared: {}, light: { '--ui-bg': 'snow' }, dark: {} }
		const draft = { shared: { '--ui-bg': 'white' }, light: {}, dark: {} }
		expect(previewDeclarations(draft, saved, 'light', valid)).toEqual([['--ui-bg', 'white']])
	})

	it('leaves out a value the theme could not be saved with', () => {
		const draft = { shared: {}, light: { '--ui-bg': 'red; color: blue' }, dark: {} }
		expect(previewDeclarations(draft, emptyVariables(), 'light', () => false)).toEqual([])
	})
})

describe('the preview of the palettes', () => {
	it('maps a role onto every shade of the palette picked', () => {
		const declarations = previewPalettes({ primary: 'violet' }, {}, undefined)
		expect(declarations).toHaveLength(11)
		expect(declarations[5]).toEqual(['--ui-color-primary-500', 'var(--color-violet-500, oklch(60.6% 0.25 292.717))'])
	})

	it("puts a dropped role back on the DMS's palette, when the DMS names it", () => {
		expect(previewPalettes({}, { primary: 'violet' }, { primary: 'dms' })[0]).toEqual([
			'--ui-color-primary-50',
			'var(--color-dms-50)',
		])
		expect(previewPalettes({ success: 'neutral' }, {}, undefined)[0]?.[1]).toMatch(/^var\(--color-old-neutral-50, oklch\(/)
		expect(previewPalettes({}, { primary: 'violet' }, undefined)).toEqual([])
	})

	it('declares nothing for a role that shows its saved palette', () => {
		expect(previewPalettes({ error: 'rose' }, { error: 'rose' }, undefined)).toEqual([])
	})
})

describe('logos', () => {
	it('tells two slots holding one picked file apart from two different files', () => {
		const state = {
			draft: theme(),
			pending: { 'default:light': pending('AAA'), 'collapsed:light': pending('AAA') },
		}
		expect(sameLogo(state, 'default', 'collapsed', 'light')).toBe(true)
		state.pending['collapsed:light'] = pending('BBB')
		expect(sameLogo(state, 'default', 'collapsed', 'light')).toBe(false)
	})

	it('tells two saved files of one content by the hash in their names', () => {
		const state = {
			pending: {},
			draft: theme({
				logos: {
					default: { dark: '/branding/default-dark-0123abcd.svg' },
					collapsed: { dark: '/branding/collapsed-dark-0123abcd.svg' },
					favicon: { dark: '/branding/favicon-dark-99999999.svg' },
				},
			}),
		}
		expect(sameLogo(state, 'default', 'collapsed', 'dark')).toBe(true)
		expect(sameLogo(state, 'default', 'favicon', 'dark')).toBe(false)
	})

	it("puts the simple mode's logo everywhere, but where an icon of its own stands", () => {
		const state = { draft: theme(), pending: {} as Record<string, PendingLogo> }
		expect(simpleLogoSlots(state, 'light')).toEqual(['default', 'email', 'collapsed', 'favicon'])
		state.pending['default:light'] = pending('LOGO')
		state.pending['collapsed:light'] = pending('LOGO')
		expect(simpleLogoSlots(state, 'light'), 'the icon only repeats the logo').toEqual([
			'default',
			'email',
			'collapsed',
			'favicon',
		])
		state.pending['collapsed:light'] = pending('ICON')
		expect(simpleLogoSlots(state, 'light')).toEqual(['default', 'email'])
		expect(simpleLogoSlots(state, 'dark'), 'each mode on its own').toEqual(['default', 'email', 'collapsed', 'favicon'])
	})

	it('draws an SVG for an email at its own proportions, within the column', () => {
		expect(svgAspect('<svg viewBox="0 0 200 50"></svg>')).toBe(4)
		expect(svgAspect('<svg width="120" height="40" viewBox="0 0 1 1"></svg>')).toBe(3)
		expect(svgAspect('<svg></svg>')).toBeUndefined()
		expect(emailLogoSize(4)).toEqual({ width: 384, height: 96 })
		expect(emailLogoSize(10)).toEqual({ width: 600, height: 60 })
	})
})

describe('a theme read again under the author', () => {
	it('keeps what the author changed on top of what changed on disk', () => {
		const from = theme({ colors: { primary: 'violet' } })
		const draft = theme({ colors: { primary: 'rose' }, variables: { ...emptyVariables(), dark: { '--ui-bg': '#000' } } })
		const onto = theme({ colors: { primary: 'violet', error: 'red' }, variables: { ...emptyVariables(), shared: { '--ui-radius': '1rem' } } })
		const rebased = rebaseTheme(draft, from, onto)
		expect(rebased.colors).toEqual({ primary: 'rose', error: 'red' })
		expect(rebased.variables).toEqual({ shared: { '--ui-radius': '1rem' }, light: {}, dark: { '--ui-bg': '#000' } })
	})
})

describe('what the bar counts and refuses', () => {
	it('counts each variable, palette and logo the draft changes', () => {
		const baseline = theme({ colors: { primary: 'violet' } })
		const draft = theme({
			colors: { primary: 'rose' },
			variables: { shared: { '--ui-radius': '0rem' }, light: { '--ui-bg': '#fff' }, dark: {} },
		})
		expect(themeChangeCount({ baseline, draft, pending: { 'favicon:dark': pending('A') } })).toBe(4)
		expect(themeChangeCount({ baseline, draft: baseline, pending: {} })).toBe(0)
	})

	it('names the row of a value the theme could not be saved with', () => {
		const issues = themeIssues(theme({ variables: { shared: {}, light: { '--ui-bg': 'red; }' }, dark: {} } }))
		expect(issues.map((issue) => issue.message)).toEqual([
			'Cards and panels (light) cannot hold ; { } < > \\, a comment, url(), @import or !important',
		])
		expect(themeIssues(theme({ colors: { primary: 'Not A Name' } }))).toHaveLength(1)
	})

	it('expects a reload only from a save that rewrote the entry', () => {
		const change = (path: string) => ({ path, kind: 'modify', diff: '' })
		expect(reloadsPage([change('/app/frontend-vue/app/app.config.ts'), change('/app/frontend-vue/app/assets/css/theme.css')])).toBe(false)
		expect(reloadsPage([change('/app/frontend-vue/dms.frontend.ts')])).toBe(true)
	})
})

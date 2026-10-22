import { describe, expect, it } from 'vitest'
import { saveStatus } from '../app/runtime/save-status'
import {
	canSendAsIs,
	createEmptyVariableSets,
	LOGO_INPUT_ACCEPT,
	logoContentType,
	logoRefusal,
	rebaseOnSave,
	rebaseTheme,
	restorePendingLogos,
	sameLogo,
	simpleLogoSlots,
	themeChangeCount,
	themeIssues,
	type PendingLogo,
	type ThemeSnapshot,
} from '../app/runtime/theme'
import {
	affectsDmsDefaults,
	chromeSelectorIn,
	isInChrome,
	previewDeclarations,
	previewPaletteDeclarations,
	type HeadMutation,
} from '../app/runtime/theme-preview'
import { dmsTones, THEME_VARIABLE_GROUPS } from '../app/runtime/theme-catalog'
import {
	catalogFontFaces,
	FONT_PACKAGES_URL,
	FONT_SUBSETS,
	fontStack,
	THEME_FONTS,
	themeFontOf,
} from '../app/runtime/theme-fonts'
import { emailLogoSize, emailRasterSize, isMailable, svgAspect } from '../app/runtime/theme-raster'
import { reloadsPage } from '../app/runtime/theme-reload'
import type { ThemeDraft } from '../app/runtime/types'

const alwaysValid = (): boolean => true

function theme(overrides: Partial<ThemeDraft> = {}): ThemeDraft {
	return { variables: createEmptyVariableSets(), colors: {}, logos: {}, ...overrides }
}

function pendingLogo(base64Content: string): PendingLogo {
	return {
		upload: { slot: 'default', mode: 'light', contentType: 'image/png', base64Content },
		previewUrl: 'blob:x',
		storedFileName: base64Content,
	}
}

function step(draft: ThemeDraft, pendingLogos: Record<string, PendingLogo> = {}, seq = 1): ThemeSnapshot {
	return { draft, pendingLogos, seq }
}

describe('the preview of the variables', () => {
	it('folds the shared values into each mode, a mode keeping its own', () => {
		const draft = { shared: { '--ui-radius': '0rem', '--ui-bg': 'white' }, light: {}, dark: { '--ui-bg': 'black' } }
		expect(previewDeclarations(draft, createEmptyVariableSets(), 'light', alwaysValid)).toEqual([
			['--ui-radius', '0rem'],
			['--ui-bg', 'white'],
		])
		expect(previewDeclarations(draft, createEmptyVariableSets(), 'dark', alwaysValid)).toEqual([
			['--ui-radius', '0rem'],
			['--ui-bg', 'black'],
		])
	})

	it('hands a saved value the draft dropped back to the DMS', () => {
		const saved = { shared: {}, light: { '--ui-bg': 'snow' }, dark: {} }
		expect(previewDeclarations(createEmptyVariableSets(), saved, 'light', alwaysValid)).toEqual([['--ui-bg', 'revert-layer']])
		expect(previewDeclarations(createEmptyVariableSets(), saved, 'dark', alwaysValid)).toEqual([])
	})

	it('keeps a shared value on screen when only the mode of it is dropped', () => {
		const saved = { shared: {}, light: { '--ui-bg': 'snow' }, dark: {} }
		const draft = { shared: { '--ui-bg': 'white' }, light: {}, dark: {} }
		expect(previewDeclarations(draft, saved, 'light', alwaysValid)).toEqual([['--ui-bg', 'white']])
	})

	it('leaves out a value the theme could not be saved with', () => {
		const draft = { shared: {}, light: { '--ui-bg': 'red; color: blue' }, dark: {} }
		expect(previewDeclarations(draft, createEmptyVariableSets(), 'light', () => false)).toEqual([])
	})

	it('declares only what the draft changes, so an edit of the saved file shows through', () => {
		const saved = { shared: { '--ui-radius': '0rem' }, light: { '--ui-bg': 'snow' }, dark: {} }
		const draft = { shared: { '--ui-radius': '0rem' }, light: { '--ui-bg': 'snow ', '--ui-text': 'black' }, dark: {} }
		expect(previewDeclarations(draft, saved, 'light', alwaysValid), 'a value typed with a space is the saved one').toEqual([
			['--ui-text', 'black'],
		])
		expect(previewDeclarations(saved, saved, 'dark', alwaysValid)).toEqual([])
	})
})

describe('the preview of the palettes', () => {
	it('maps a role onto every shade of the palette picked', () => {
		const declarations = previewPaletteDeclarations({ primary: 'violet' }, {}, undefined)
		expect(declarations).toHaveLength(11)
		expect(declarations[5]).toEqual(['--ui-color-primary-500', 'var(--color-violet-500, oklch(60.6% 0.25 292.717))'])
	})

	it("puts a dropped role back on the DMS's palette, when the DMS names it", () => {
		expect(previewPaletteDeclarations({}, { primary: 'violet' }, { primary: 'dms' })[0]).toEqual([
			'--ui-color-primary-50',
			'var(--color-dms-50)',
		])
		expect(previewPaletteDeclarations({ success: 'neutral' }, {}, undefined)[0]?.[1]).toMatch(/^var\(--color-old-neutral-50, oklch\(/)
		expect(previewPaletteDeclarations({}, { primary: 'violet' }, undefined)).toEqual([])
	})

	it('declares nothing for a role that shows its saved palette', () => {
		expect(previewPaletteDeclarations({ error: 'rose' }, { error: 'rose' }, undefined)).toEqual([])
	})
})

describe('the DMS colors a row offers', () => {
	it('lists each color of the group once per mode, named by what the DMS paints with it', () => {
		const backgrounds = THEME_VARIABLE_GROUPS.find((group) => group.id === 'surfaces')!
		const tones = dmsTones(backgrounds, {
			light: { '--ui-bg-muted': '#f4f6f7', '--ui-bg': '#ffffff', '--dms-bg-field': '#ffffff', '--ui-text': '#111111' },
			dark: { '--ui-bg': '#10151a' },
		})
		expect(tones.light).toEqual([
			{ value: '#f4f6f7', label: 'Page' },
			{ value: '#ffffff', label: 'Cards and panels, Fields' },
		])
		expect(tones.dark, 'a mode the DMS paints less of offers less').toEqual([{ value: '#10151a', label: 'Cards and panels' }])
	})
})

describe('the fonts a theme can host', () => {
	it('offers the fonts the module hosts, from where it downloads them', async () => {
		// The module's catalog imports nothing, so it loads here as it is.
		const hosted = await import('../../src/implementations/dms-builder/engine/theme-font-catalog')
		expect(
			THEME_FONTS.map(({ family, packageName, version, weights, italic }) => ({ family, packageName, version, weights, italic })),
		).toEqual(hosted.HOSTED_FONTS)
		expect(FONT_SUBSETS).toEqual(hosted.FONT_SUBSETS)
		expect(FONT_PACKAGES_URL).toBe(hosted.FONT_PACKAGES_URL)
	})

	it('tells the font a stack starts with, the one the module hosts', () => {
		const inter = THEME_FONTS.find((font) => font.family === 'Inter')!
		expect(fontStack(inter)).toBe('"Inter", ui-sans-serif, system-ui, sans-serif')
		expect(themeFontOf("'inter', sans-serif")).toBe(inter)
		expect(themeFontOf('"Geist", "Inter", sans-serif'), 'a fallback is not the font shown').toBeUndefined()
		expect(themeFontOf(undefined)).toBeUndefined()
	})

	it('declares every face of every font from the CDN, italics where a font has them', () => {
		const faces = catalogFontFaces()
		expect(faces).toContain(
			'src: url("https://cdn.jsdelivr.net/npm/@fontsource-variable/manrope@5.3.0/files/manrope-latin-wght-normal.woff2") format("woff2")',
		)
		expect(faces).not.toContain('manrope-latin-wght-italic')
		const faceCount = THEME_FONTS.reduce((count, font) => count + (font.italic ? 4 : 2), 0)
		expect(faces.match(/@font-face/g)).toHaveLength(faceCount)
	})
})

describe('logos', () => {
	it('tells two slots holding one picked file apart from two different files', () => {
		const state = {
			draft: theme(),
			pendingLogos: { 'default:light': pendingLogo('AAA'), 'collapsed:light': pendingLogo('AAA') },
		}
		expect(sameLogo(state, 'default', 'collapsed', 'light')).toBe(true)
		state.pendingLogos['collapsed:light'] = pendingLogo('BBB')
		expect(sameLogo(state, 'default', 'collapsed', 'light')).toBe(false)
	})

	it('tells two saved files of one content by the hash in their names', () => {
		const state = {
			pendingLogos: {},
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
		const state = { draft: theme(), pendingLogos: {} as Record<string, PendingLogo> }
		expect(simpleLogoSlots(state, 'light')).toEqual(['default', 'email', 'collapsed', 'favicon'])
		state.pendingLogos['default:light'] = pendingLogo('LOGO')
		state.pendingLogos['collapsed:light'] = pendingLogo('LOGO')
		expect(simpleLogoSlots(state, 'light'), 'the icon only repeats the logo').toEqual([
			'default',
			'email',
			'collapsed',
			'favicon',
		])
		state.pendingLogos['collapsed:light'] = pendingLogo('ICON')
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

	it('draws any picture an email cannot show as a PNG, never larger than it is', () => {
		const file = (name: string, type = '') => ({ name, type })
		for (const logoFile of [file('logo.svg', 'image/svg+xml'), file('logo.webp', 'image/webp'), file('icon.ico', 'image/x-icon'), file('logo.svg')]) {
			expect(canSendAsIs('email', logoFile), logoFile.name).toBe(false)
			expect(canSendAsIs('default', logoFile), `${logoFile.name} anywhere else`).toBe(true)
		}
		expect(canSendAsIs('email', file('logo.png', 'image/png'))).toBe(true)
		expect(canSendAsIs('email', file('logo.jpg', 'image/jpeg'))).toBe(true)
		expect(isMailable(file('logo.JPEG'))).toBe(true)
		expect(emailRasterSize(32, 32), 'an icon keeps its pixels').toEqual({ width: 32, height: 32 })
		expect(emailRasterSize(800, 200)).toEqual({ width: 384, height: 96 })
	})

	it('takes a JPEG as a logo', () => {
		expect(logoContentType({ name: 'logo.jpg', type: '' })).toBe('image/jpeg')
		expect(logoRefusal({ name: 'logo.jpeg', type: 'image/jpeg', size: 1024 })).toBeUndefined()
		expect(logoRefusal({ name: 'logo.gif', type: 'image/gif', size: 1024 })).toBe('A logo is an SVG, PNG, JPEG, WebP or ICO file.')
		expect(LOGO_INPUT_ACCEPT.split(',').filter((entry) => entry === 'image/jpeg')).toHaveLength(1)
		expect(LOGO_INPUT_ACCEPT).toContain('.jpg')
	})

	it('picks the logos of a draft kept on this device again, from the files kept with it', () => {
		const png = { fileName: 'f1', contentType: 'image/png' }
		const logos = restorePendingLogos(
			{ 'default:light': png, 'favicon:light': png, 'nowhere:light': png, 'email:dark': { fileName: 'gone', contentType: 'image/png' } },
			{ f1: 'iVBORw0K' },
		)
		expect(Object.keys(logos), 'an unknown slot or a missing file is left out').toEqual(['default:light', 'favicon:light'])
		expect(logos['favicon:light']).toEqual({
			upload: { slot: 'favicon', mode: 'light', contentType: 'image/png', base64Content: 'iVBORw0K' },
			previewUrl: 'data:image/png;base64,iVBORw0K',
			storedFileName: 'f1',
		})
	})
})

describe('a theme read again under the author', () => {
	it('keeps what the author changed on top of what changed on disk', () => {
		const from = theme({ colors: { primary: 'violet' } })
		const draft = theme({ colors: { primary: 'rose' }, variables: { ...createEmptyVariableSets(), dark: { '--ui-bg': '#000' } } })
		const onto = theme({ colors: { primary: 'violet', error: 'red' }, variables: { ...createEmptyVariableSets(), shared: { '--ui-radius': '1rem' } } })
		const rebased = rebaseTheme(draft, from, onto)
		expect(rebased.colors).toEqual({ primary: 'rose', error: 'red' })
		expect(rebased.variables).toEqual({ shared: { '--ui-radius': '1rem' }, light: {}, dark: { '--ui-bg': '#000' } })
	})
})

describe('a theme saved while the author kept going', () => {
	const violet = theme({ colors: { primary: 'violet' } })

	it('keeps an edit made after the save was sent on top of what it wrote', () => {
		const sent = step(violet)
		const saved = theme({ colors: { primary: 'violet' }, logos: {} })
		const later = rebaseOnSave(step(theme({ colors: { primary: 'violet', error: 'rose' } }), {}, 5), sent, saved)
		expect(later.draft.colors).toEqual({ primary: 'violet', error: 'rose' })
		expect(later.seq, 'the step keeps its place').toBe(5)
		expect(rebaseOnSave(sent, sent, saved).draft, 'the step it was sent from is what is saved').toEqual(saved)
	})

	it('drops the logos sent, which are files now, and keeps those picked since', () => {
		const sent = step(violet, { 'default:light': pendingLogo('SENT') })
		const saved = theme({ colors: { primary: 'violet' }, logos: { default: { light: '/branding/default-light-0123abcd.png' } } })
		const picked = { ...pendingLogo('NEW'), upload: { ...pendingLogo('NEW').upload, slot: 'collapsed' as const } }
		const later = rebaseOnSave(step(violet, { 'default:light': pendingLogo('SENT'), 'collapsed:light': picked }), sent, saved)
		expect(Object.keys(later.pendingLogos)).toEqual(['collapsed:light'])
		expect(later.draft.logos).toEqual({ default: { light: '/branding/default-light-0123abcd.png' } })
	})

	it('takes back from the files a logo taken back once it was sent', () => {
		const sent = step(violet, { 'default:light': pendingLogo('SENT') })
		const saved = theme({ colors: { primary: 'violet' }, logos: { default: { light: '/branding/default-light-0123abcd.png' } } })
		const later = rebaseOnSave(step(violet), sent, saved)
		expect(later.draft.logos, 'handed back to the DMS, which the next save writes').toEqual({})
		expect(later.pendingLogos).toEqual({})
	})
})

describe('what the bar counts and refuses', () => {
	it('counts each variable, palette and logo the draft changes', () => {
		const baseline = theme({ colors: { primary: 'violet' } })
		const draft = theme({
			colors: { primary: 'rose' },
			variables: { shared: { '--ui-radius': '0rem' }, light: { '--ui-bg': '#fff' }, dark: {} },
		})
		expect(themeChangeCount({ baseline, draft, pendingLogos: { 'favicon:dark': pendingLogo('A') } })).toBe(4)
		expect(themeChangeCount({ baseline, draft: baseline, pendingLogos: {} })).toBe(0)
	})

	it('counts nothing for a value cleared then typed again, whatever order the keys are in', () => {
		const baseline = theme({ variables: { shared: {}, light: { '--ui-bg': '#fff', '--ui-text': '#111' }, dark: {} } })
		const draft = theme({ variables: { shared: {}, light: { '--ui-text': '#111', '--ui-bg': '#fff' }, dark: {} } })
		expect(themeChangeCount({ baseline, draft, pendingLogos: {} })).toBe(0)
	})

	it('says a save that wrote the page and not the theme for what it is', () => {
		const failed = { saving: false, dirty: true, changes: 1, problems: 0 }
		expect(saveStatus({ ...failed, lastSave: { outcome: 'failed', at: 0, pageSaved: true } }).label).toBe(
			'Theme not saved · page saved',
		)
		expect(saveStatus({ ...failed, lastSave: { outcome: 'failed', at: 0 } }).label).toBe('Save failed · nothing written')
	})

	it('names the row of a value the theme could not be saved with', () => {
		const issues = themeIssues(theme({ variables: { shared: {}, light: { '--ui-bg': 'red; }' }, dark: {} } }))
		expect(issues.map((issue) => issue.message)).toEqual([
			'Cards and panels (light) cannot hold ; { } < > \\, a comment, url(), @import or !important',
		])
		expect(themeIssues(theme({ colors: { primary: 'Not A Name' } }))).toHaveLength(1)
	})

	it('expects a reload only from a save that rewrote the entry or removed a logo', () => {
		const change = (path: string) => ({ path, kind: 'modify', diff: '' })
		expect(reloadsPage([change('/app/frontend-vue/app/app.config.ts'), change('/app/frontend-vue/app/assets/css/theme.css')])).toBe(false)
		expect(reloadsPage([change('/app/frontend-vue/dms.frontend.ts')])).toBe(true)
		const removed = (path: string) => ({ path, kind: 'delete', diff: '' })
		expect(reloadsPage([change('/app/frontend-vue/public/branding/default-light-0a1b2c3d.svg')]), 'a new logo').toBe(false)
		expect(reloadsPage([removed('/app/frontend-vue/public/branding/default-light-0a1b2c3d.svg')]), 'a logo replaced').toBe(true)
	})
})

describe('the frame kept on the DMS look', () => {
	/** A node of `<head>` as the mutation observer reports it. */
	function element(tagName: string, attributes: Record<string, string> = {}): Node {
		return {
			id: attributes.id ?? '',
			tagName,
			href: attributes.href,
			getAttribute: (name: string) => attributes[name] ?? null,
		} as unknown as Node
	}

	function added(...nodes: Node[]): HeadMutation {
		return { target: element('HEAD'), addedNodes: nodes, removedNodes: [] } as unknown as HeadMutation
	}

	it('reads the DMS defaults again for a stylesheet of the page, not for its own preview', () => {
		const preview = element('STYLE', { id: 'dms-builder-theme-preview' })
		expect(affectsDmsDefaults([{ ...added(preview), removedNodes: [preview] } as unknown as HeadMutation]), 'the preview of an edit').toBe(false)
		expect(affectsDmsDefaults([added(element('STYLE', { 'data-vite-dev-id': '/app/frontend-vue/app/assets/css/theme.css' }))]), 'the saved theme').toBe(false)
		expect(affectsDmsDefaults([added(element('SCRIPT'))]), 'a script').toBe(false)
		expect(affectsDmsDefaults([added(element('STYLE', { 'data-vite-dev-id': '/dms/layers/dms-layout/main.css' }))])).toBe(true)
		expect(affectsDmsDefaults([added(element('LINK', { rel: 'stylesheet', href: '/_nuxt/entry.css' }))])).toBe(true)
		const text = { parentNode: element('STYLE') } as unknown as Node
		expect(affectsDmsDefaults([{ target: text, addedNodes: [], removedNodes: [] } as unknown as HeadMutation]), 'a style rewritten').toBe(true)
	})

	it('tells what an interaction reached inside the frame, or an overlay it opened', () => {
		const reached = (selectors: string[]) =>
			({ closest: (selector: string) => (selectors.some((entry) => selector.includes(entry)) ? {} : null) }) as unknown as EventTarget
		expect(isInChrome(reached(['[data-builder-chrome]']))).toBe(true)
		expect(isInChrome(reached(['.dms-builder-chrome']))).toBe(true)
		expect(isInChrome({ closest: () => null } as unknown as EventTarget)).toBe(false)
		expect(isInChrome(null)).toBe(false)
	})

	it('keeps the frame in the mode the page shows, as weak as the frame selector alone', () => {
		expect(chromeSelectorIn('light')).toBe(':where(:root:not(.dark)) :is([data-builder-chrome], .dms-builder-chrome)')
		expect(chromeSelectorIn('dark')).toBe(':where(.dark) :is([data-builder-chrome], .dms-builder-chrome)')
	})
})

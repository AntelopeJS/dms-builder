import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import Banners from '../app/components/Banners.vue'
import ThemeColor from '../app/components/ThemeColor.vue'
import ThemeFont from '../app/components/ThemeFont.vue'
import ThemePalette from '../app/components/ThemePalette.vue'
import ThemeVariable from '../app/components/ThemeVariable.vue'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import { useThemeEditor, type ThemeEditor } from '../app/runtime/theme'
import { THEME_PALETTES } from '../app/runtime/theme-catalog'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { fakeEvent, findAll, fire, installDocumentStub, mount, textOf, type TestNode } from './support/render'

/**
 * The theme's panels as the author reaches them: the palettes by keyboard, a
 * value the theme cannot be saved with, and what the strips over the editor
 * say of the theme.
 */

let backend: FakeBackend
let builder: BuilderController
let theme: ThemeEditor
let unmount: (() => void) | undefined

installDocumentStub()

beforeEach(async () => {
	vi.useFakeTimers()
	backend = installFakeHost()
	backend.answers['GET /api/builder/theme'] = {
		ok: true,
		data: {
			layer: { name: 'app-frontend', sourcePath: '/app/frontend-vue' },
			variables: { shared: {}, light: {}, dark: {} },
			colors: {},
			logos: {},
			files: {
				stylesheetPath: 'theme.css',
				appConfigPath: 'app.config.ts',
				entryPath: 'dms.frontend.ts',
				assetsDirectory: 'branding',
			},
			stylesheetImported: true,
			version: 't1',
		},
		changes: [],
	}
	builder = useBuilder()
	theme = useThemeEditor()
	builder.close()
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
	await theme.load()
})

afterEach(() => {
	unmount?.()
	unmount = undefined
	builder.close()
	vi.useRealTimers()
})

function show(component: Parameters<typeof mount>[0], props?: Record<string, unknown>): TestNode {
	const view = mount(component, { props })
	unmount = view.unmount
	return view.root
}

describe('the palettes of a role', () => {
	const swatches = (root: TestNode) => findAll(root, (node) => node.props.role === 'radio')

	/** A key pressed on a swatch, whose row holds elements that can take the focus. */
	function press(swatch: TestNode, key: string, focusable: Array<{ focus: () => void }>) {
		const event = fakeEvent('keydown', { currentTarget: { parentElement: { children: focusable } } })
		return fire(swatch, 'keydown', Object.assign(event, { key }))
	}

	it('stops the Tab key at one swatch, and the arrows pick and move between them', async () => {
		const root = show(ThemePalette, { role: 'primary', label: 'Accent', hint: '' })
		const focusable = THEME_PALETTES.map(() => ({ focus: vi.fn() }))
		const stops = () => swatches(root).filter((node) => node.props.tabindex === 0)

		expect(stops().map((node) => node.props['aria-label']), 'the first, with nothing picked').toEqual([THEME_PALETTES[0]])

		const event = press(swatches(root)[0]!, 'ArrowRight', focusable)
		await nextTick()
		expect(event.prevented).toBe(true)
		expect(theme.state.value.draft?.colors.primary).toBe(THEME_PALETTES[1])
		expect(focusable[1]!.focus).toHaveBeenCalled()
		expect(stops().map((node) => node.props['aria-label'])).toEqual([THEME_PALETTES[1]])

		press(swatches(root)[1]!, 'End', focusable)
		expect(theme.state.value.draft?.colors.primary).toBe(THEME_PALETTES.at(-1))
		press(swatches(root).at(-1)!, 'ArrowRight', focusable)
		expect(theme.state.value.draft?.colors.primary, 'wrapping round').toBe(THEME_PALETTES[0])
		press(swatches(root)[0]!, 'ArrowLeft', focusable)
		expect(theme.state.value.draft?.colors.primary).toBe(THEME_PALETTES.at(-1))
		press(swatches(root).at(-1)!, 'Home', focusable)
		expect(theme.state.value.draft?.colors.primary).toBe(THEME_PALETTES[0])
	})

	it('leaves the other keys alone', () => {
		const root = show(ThemePalette, { role: 'primary', label: 'Accent', hint: '' })
		const event = press(swatches(root)[0]!, 'a', [])
		expect(event.prevented).toBe(false)
		expect(theme.state.value.draft?.colors).toEqual({})
	})
})

describe('a value the theme cannot be saved with', () => {
	it('marks its cell invalid, described by the sentence saying why', async () => {
		const root = show(ThemeVariable, {
			name: '--brand-gap',
			scope: 'modes',
			dmsDefaultValues: {},
			pageMode: 'light',
		})
		theme.setVariable('light', '--brand-gap', 'red; }')
		await nextTick()

		const [light, dark] = findAll(root, (node) => node.tag === 'UInput')
		const reason = findAll(root, (node) => node.tag === 'p' && node.props.id !== undefined)[0]
		expect(reason && textOf(reason)).toContain('cannot hold')
		expect(light?.props['aria-invalid']).toBe(true)
		expect(light?.props['aria-describedby']).toBe(reason?.props.id)
		expect(dark?.props['aria-invalid'], 'the other mode is fine').toBeUndefined()
		expect(dark?.props['aria-describedby']).toBeUndefined()
	})
})

describe('a color of the theme', () => {
	const DMS_TONES = {
		light: [
			{ value: '#f4f6f7', label: 'Page' },
			{ value: '#ffffff', label: 'Cards and panels, Fields' },
		],
		dark: [
			{ value: '#07090b', label: 'Page' },
			{ value: '#10151a', label: 'Cards and panels' },
		],
	}

	function showColor(props: Record<string, unknown> = {}): TestNode {
		return show(ThemeColor, {
			name: '--ui-bg',
			label: 'Cards and panels',
			hint: 'Cards, menus, dialogs and the header',
			dmsDefaultValues: { light: '#ffffff', dark: '#10151a' },
			dmsTones: DMS_TONES,
			pageMode: 'dark',
			expanded: true,
			...props,
		})
	}

	const variables = () => theme.state.value.draft?.variables
	const tone = (root: TestNode, label: string) =>
		findAll(root, (node) => node.tag === 'button' && node.props['aria-label'] === `Cards and panels: the DMS's ${label}`)[0]!
	const codeFields = (root: TestNode) => findAll(root, (node) => node.tag === 'UInput')

	it('shows both modes in its swatch, and edits the one the page shows', async () => {
		const root = showColor()
		const swatch = findAll(root, (node) => node.tag === 'span' && node.props['aria-hidden'] === 'true')[0]
		expect(swatch?.props.style).toEqual({ background: 'linear-gradient(135deg, #ffffff 50%, #10151a 50%)' })

		const picker = findAll(root, (node) => node.tag === 'UColorPicker')[0]!
		fire(picker, 'update:modelValue', '#33445A' as never)
		await nextTick()
		expect(variables()?.dark['--ui-bg'], 'written in the code it is typed in').toBe('#33445a')
		expect(variables()?.light['--ui-bg'], 'the other mode untouched').toBeUndefined()
		const badge = findAll(root, (node) => node.tag === 'UBadge')[0]
		expect(badge?.props.label).toBe('Edited')
	})

	it('takes a color of the DMS, and its own default takes the theme value away', async () => {
		const root = showColor()
		fire(tone(root, 'Page'), 'click')
		await nextTick()
		expect(variables()?.dark['--ui-bg']).toBe('#07090b')
		expect(tone(root, 'Page').props['aria-pressed']).toBe(true)

		fire(tone(root, 'Cards and panels'), 'click')
		await nextTick()
		expect('--ui-bg' in (variables()?.dark ?? {})).toBe(false)
		expect(tone(root, 'Cards and panels').props['aria-pressed']).toBe(true)
	})

	it('keeps the code out of sight until asked for', async () => {
		const root = showColor()
		expect(codeFields(root)).toEqual([])

		const code = findAll(root, (node) => node.tag === 'UButton' && node.props['aria-label'] === 'Cards and panels: the color code')[0]!
		fire(code, 'click')
		await nextTick()
		expect(codeFields(root).map((field) => field.props['aria-label'])).toEqual(['Cards and panels, dark'])
	})

	it('shows the code of a value it cannot hold, described by the sentence saying why', async () => {
		const root = showColor({ pageMode: 'light' })
		theme.setVariable('light', '--ui-bg', 'red; }')
		await nextTick()

		const [field] = codeFields(root)
		const reason = findAll(root, (node) => node.tag === 'p' && node.props.id !== undefined)[0]
		expect(reason && textOf(reason)).toContain('The light value cannot hold')
		expect(field?.props['aria-invalid']).toBe(true)
		expect(field?.props['aria-describedby']).toBe(reason?.props.id)
		const row = findAll(root, (node) => node.tag === 'button' && node.props['aria-expanded'] === true)[0]
		expect(row?.props['aria-describedby'], 'closed, the row still says why').toBe(reason?.props.id)
	})

	it('asks the panel to open it, and to show the page in the other mode', () => {
		const onToggle = vi.fn()
		const onShowMode = vi.fn()
		const root = showColor({ expanded: false, onToggle, onShowMode })
		expect(findAll(root, (node) => node.tag === 'UColorPicker'), 'closed').toEqual([])

		fire(findAll(root, (node) => node.tag === 'button' && node.props['aria-expanded'] === false)[0]!, 'click')
		expect(onToggle).toHaveBeenCalledOnce()

		unmount?.()
		const open = showColor({ onShowMode })
		fire(findAll(open, (node) => node.tag === 'DmsSegmented')[0]!, 'update:modelValue', 'light' as never)
		expect(onShowMode).toHaveBeenCalledWith('light')
	})
})

describe('the font of the theme', () => {
	const DMS_STACK = '"Geist", "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif'
	const INTER_STACK = '"Inter", ui-sans-serif, system-ui, sans-serif'

	function showFont(props: Record<string, unknown> = {}): TestNode {
		return show(ThemeFont, { expanded: true, dmsDefaultValue: DMS_STACK, ...props })
	}

	const font = () => theme.state.value.draft?.variables.shared['--font-sans']
	const choices = (root: TestNode) => findAll(root, (node) => node.tag === 'button' && node.props['data-font-choice'] !== undefined)
	const choice = (root: TestNode, family: string) => choices(root).find((node) => node.props['data-font-choice'] === family)!
	const sample = (root: TestNode) => findAll(root, (node) => node.props['data-font-sample'] !== undefined)[0]!
	const codeFields = (root: TestNode) => findAll(root, (node) => node.tag === 'UInput')

	it('lists the DMS font and the ten it can host, each in its own letters', () => {
		const root = showFont()
		expect(choices(root).map((node) => node.props['data-font-choice'])).toEqual([
			'Geist',
			'Inter',
			'IBM Plex Sans',
			'Public Sans',
			'DM Sans',
			'Manrope',
			'Plus Jakarta Sans',
			'Figtree',
			'Atkinson Hyperlegible Next',
			'Nunito',
			'Source Serif 4',
		])
		expect(choice(root, 'Geist').props['aria-pressed'], 'nothing set: the DMS font').toBe(true)
		const name = findAll(choice(root, 'Source Serif 4'), (node) => node.tag === 'span' && node.props.style !== undefined)[0]
		expect(name?.props.style).toEqual({ fontFamily: '"Source Serif 4", ui-serif, Georgia, serif' })
		expect(codeFields(root), 'no code until asked for').toEqual([])
	})

	it('writes the stack of the font picked, and previews the one under the pointer', async () => {
		const root = showFont()
		fire(choice(root, 'Inter'), 'click')
		await nextTick()
		expect(font()).toBe(INTER_STACK)
		expect(choice(root, 'Inter').props['aria-pressed']).toBe(true)
		expect(findAll(root, (node) => node.tag === 'UBadge')[0]?.props.label).toBe('Edited')
		expect(sample(root).props.style).toEqual({ fontFamily: INTER_STACK })

		fire(choice(root, 'Nunito'), 'pointerenter')
		await nextTick()
		expect(sample(root).props.style).toEqual({ fontFamily: '"Nunito", ui-sans-serif, system-ui, sans-serif' })
		expect(font(), 'only shown, not picked').toBe(INTER_STACK)
		fire(choice(root, 'Nunito'), 'pointerleave')
		await nextTick()
		expect(sample(root).props.style).toEqual({ fontFamily: INTER_STACK })

		const back = findAll(root, (node) => node.tag === 'UButton' && node.props.label === 'Back to the DMS default')[0]!
		fire(back, 'click')
		await nextTick()
		expect('--font-sans' in (theme.state.value.draft?.variables.shared ?? {})).toBe(false)
		expect(choice(root, 'Geist').props['aria-pressed']).toBe(true)
	})

	it('shows the code of a stack naming none of its fonts, and says why one cannot be used', async () => {
		const root = showFont({ expanded: false })
		theme.setVariable('shared', '--font-sans', 'Comic Sans MS, cursive')
		await nextTick()
		expect(textOf(root)).toContain('Comic Sans MS — typed as code')

		unmount?.()
		const open = showFont()
		expect(choices(open).some((node) => node.props['aria-pressed'] === true)).toBe(false)
		expect(codeFields(open).map((field) => field.props['model-value'])).toEqual(['Comic Sans MS, cursive'])

		theme.setVariable('shared', '--font-sans', 'Inter; }')
		await nextTick()
		const reason = findAll(open, (node) => node.tag === 'p' && node.props.id !== undefined)[0]
		expect(reason && textOf(reason)).toContain('cannot be saved')
		expect(codeFields(open)[0]?.props['aria-describedby']).toBe(reason?.props.id)
	})

	it('asks the panel to open it', () => {
		const onToggle = vi.fn()
		const root = showFont({ expanded: false, onToggle })
		expect(choices(root), 'closed').toEqual([])
		fire(findAll(root, (node) => node.tag === 'button' && node.props['aria-expanded'] === false)[0]!, 'click')
		expect(onToggle).toHaveBeenCalledOnce()
	})
})

describe('the strips over the editor', () => {
	const buttons = (root: TestNode) =>
		findAll(root, (node) => node.tag === 'UButton').map((node) => String(node.props.label ?? node.props['aria-label'] ?? ''))

	it('asks before leaving with the theme unsaved, and says where it comes back', async () => {
		theme.setColor('primary', 'violet')
		builder.leave()
		const root = show(Banners)
		await nextTick()

		const dialog = findAll(root, (node) => node.tag === 'UModal')[0]!
		expect(dialog.props.description).toBe('The theme has changes nobody has saved.')
		expect(dialog.props.ui, 'kept on the DMS look, out of the frame').toEqual({
			content: 'dms-builder-chrome',
			overlay: 'dms-builder-chrome',
		})
		expect(textOf(dialog)).toContain('they come back next time you open the editor, on any page')

		builder.setWorkspace('page')
		builder.addBlock('Text')
		await nextTick()
		expect(dialog.props.description).toBe('Sales and the theme have changes nobody has saved.')
		expect(textOf(dialog)).toContain("the page's come back next time you edit this page and the theme's")
	})

	it('says what the device could not keep, and no longer offers to keep it', async () => {
		theme.setColor('primary', 'violet')
		builder.leave()
		builder.session.value.unstoredDraftLabels = ['the theme']
		const root = show(Banners)
		await nextTick()

		expect(textOf(root)).toContain('The changes to the theme could not be kept on this device')
		expect(buttons(root)).toEqual(expect.arrayContaining(['Save and leave', 'Leave without saving', 'Stay']))
		expect(buttons(root)).not.toContain('Leave, keep the draft')
	})

	it('says the page was saved when only the theme was turned down', async () => {
		builder.session.value.lastSave = { outcome: 'failed', at: 0, pageSaved: true }
		builder.session.value.error = { code: 'unsupported', detail: 'The theme was not saved: violet is not declared.' }
		const root = show(Banners)
		await nextTick()

		expect(textOf(root)).toContain('The page was saved. The theme was not saved: violet is not declared.')
		expect(textOf(root)).not.toContain('Nothing was written')
	})

	it('says a theme kept from an earlier visit is back, and offers to drop it', async () => {
		theme.setColor('primary', 'violet')
		theme.state.value.restoredDraft = { at: 0, stale: true }
		const root = show(Banners)
		await nextTick()

		expect(textOf(root)).toContain('Your unsaved theme changes are back')
		expect(textOf(root)).toContain("on top of the theme's files, which changed since")
		fire(findAll(root, (node) => node.tag === 'UButton' && node.props.label === 'Discard')[0]!, 'click')
		expect(theme.dirty.value).toBe(false)
		expect(theme.state.value.restoredDraft).toBe(null)
		expect(builder.session.value.toastUndo).toBe(true)
	})
})

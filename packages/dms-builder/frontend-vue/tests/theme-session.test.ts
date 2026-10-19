import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDmsAppConfig } from '#dms/frontend-module'
import { storedThemeDraft } from '../app/runtime/draft-store'
import { describeError } from '../app/runtime/errors'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import { useThemeEditor, type ThemeEditor } from '../app/runtime/theme'
import type { ThemeStructure } from '../app/runtime/types'
import { installFakeHost, type FakeBackend } from './support/builder-harness'

/**
 * The theme as the editor's session handles it beside the page: kept on the
 * device while unsaved, saved after the page, read once, and taken back with
 * it.
 */

let backend: FakeBackend
let builder: BuilderController
let theme: ThemeEditor
let stored: Map<string, string>

const PAGE = '/reports/sales'
const THEME_ROUTE = 'GET /api/builder/theme'
const SAVE_ROUTE = 'POST /api/builder/theme'

function savedTheme(overrides: Partial<ThemeStructure> = {}): ThemeStructure {
	return {
		layer: { name: 'app-frontend', sourcePath: '/app/frontend-vue' },
		variables: { shared: {}, light: {}, dark: {} },
		colors: {},
		logos: {},
		files: {
			stylesheetPath: 'app/assets/css/theme.css',
			appConfigPath: 'app/app.config.ts',
			entryPath: 'dms.frontend.ts',
			assetsDirectory: 'public/branding',
		},
		stylesheetImported: true,
		version: 't1',
		...overrides,
	}
}

function answerTheme(structure: ThemeStructure): void {
	backend.answers[THEME_ROUTE] = { ok: true, data: structure, changes: [] }
}

/** A PNG as a file chooser hands it over. */
function png(name = 'logo.png', bytes = [137, 80, 78, 71]): File {
	return new File([new Uint8Array(bytes)], name, { type: 'image/png' })
}

/** The logos the dashboard shows, as the app config holds them. */
function shownLogos(): Record<string, Record<string, string>> | undefined {
	return (useDmsAppConfig() as { branding?: { logo?: Record<string, Record<string, string>> } }).branding?.logo
}

async function open(): Promise<void> {
	await builder.open(PAGE)
	await vi.advanceTimersByTimeAsync(200)
}

async function openTheme(): Promise<void> {
	builder.setWorkspace('theme')
	await vi.advanceTimersByTimeAsync(200)
}

function themeReads(): number {
	return backend.calledPaths().filter((path) => path === THEME_ROUTE).length
}

beforeEach(async () => {
	// IndexedDB, where the theme's logos are kept, answers on `setImmediate`,
	// which stays real.
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
	stored = new Map()
	Object.assign(globalThis, {
		localStorage: {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
			removeItem: (key: string) => stored.delete(key),
		},
	})
	backend = installFakeHost()
	answerTheme(savedTheme())
	backend.answers[SAVE_ROUTE] = { ok: true, data: { version: 't2' }, changes: [] }
	builder = useBuilder()
	theme = useThemeEditor()
	builder.close()
	await open()
	await openTheme()
})

afterEach(() => {
	builder.close()
	Object.assign(globalThis, { localStorage: undefined })
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('a theme left with "keep the draft"', () => {
	it('outlives the editor, its logos too, and comes back on the next opening', async () => {
		theme.setColor('primary', 'violet')
		await theme.pickLogo(['default'], 'light', png())
		builder.leave()
		await builder.resolveClose(false, true)

		expect(builder.session.value.active).toBe(false)
		expect(storedThemeDraft()?.draft.colors).toEqual({ primary: 'violet' })

		await open()
		await vi.waitFor(() => expect(theme.state.value.restoredDraft).not.toBe(null))
		expect(theme.state.value.draft?.colors).toEqual({ primary: 'violet' })
		expect(theme.state.value.pendingLogos['default:light']?.upload).toMatchObject({
			contentType: 'image/png',
			base64Content: 'iVBORw==',
		})
		expect(theme.dirty.value).toBe(true)
		// Laid back as one edit: Undo goes back to the theme as saved, and the
		// device forgets it once nothing is left unsaved.
		theme.undo()
		expect(theme.dirty.value).toBe(false)
		expect(storedThemeDraft()).toBeUndefined()
	})

	it('is kept on this device as it changes, as the page is, until saved or dropped', async () => {
		theme.setColor('primary', 'violet')
		expect(storedThemeDraft()?.draft.colors, 'a reload loses none of it').toEqual({ primary: 'violet' })

		await builder.save()
		expect(storedThemeDraft(), 'nothing left unsaved').toBeUndefined()

		theme.setColor('primary', 'rose')
		expect(storedThemeDraft()?.draft.colors).toEqual({ primary: 'rose' })
		builder.leave()
		await builder.resolveClose(false)
		expect(builder.session.value.active).toBe(false)
		expect(storedThemeDraft(), 'left without saving').toBeUndefined()
	})

	it('keeps a logo apart from the draft, once, however many slots and edits name it', async () => {
		const put = vi.spyOn(IDBObjectStore.prototype, 'put')
		await theme.pickLogo(['default', 'collapsed'], 'light', png())
		theme.setColor('primary', 'violet')
		theme.setColor('primary', 'rose')
		expect(await theme.storeOnDevice()).toBe(true)

		expect(stored.get('dms-builder:theme-draft'), 'the draft names the file, without its bytes').not.toContain('iVBORw==')
		const logos = storedThemeDraft()?.pendingLogos
		expect(logos?.['collapsed:light']?.fileName).toBe(logos?.['default:light']?.fileName)
		expect(put, 'written once').toHaveBeenCalledTimes(1)
	})

	it('stays open when the device cannot keep it, and says so', async () => {
		theme.setColor('primary', 'violet')
		const setItem = (key: string, value: string) => {
			if (key === 'dms-builder:theme-draft') {
				throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
			}
			stored.set(key, value)
		}
		Object.assign(globalThis.localStorage, { setItem })
		builder.leave()
		await builder.resolveClose(false, true)

		expect(builder.session.value.active).toBe(true)
		expect(builder.session.value.pendingClose, 'the question stays, to save or drop it').toBe(true)
		expect(builder.session.value.unstoredDraftLabels).toEqual(['the theme'])
		builder.stayOpen()
		expect(builder.session.value.unstoredDraftLabels).toEqual([])
	})
})

describe('a theme save', () => {
	it('forgets a refusal it answers anew, so leaving after a fix goes through', async () => {
		theme.setColor('primary', 'violet')
		backend.answers[SAVE_ROUTE] = {
			ok: false,
			error: { code: 'unsupported', detail: 'app/app.config.ts cannot be rewritten: it sets ui.colors.primary with an expression the builder cannot edit' },
		}
		await builder.save()
		expect(describeError(builder.session.value.error!, null)).toBe(
			'The theme was not saved: app/app.config.ts cannot be rewritten: it sets ui.colors.primary with an expression the builder cannot edit.',
		)

		backend.answers[SAVE_ROUTE] = { ok: true, data: { version: 't2' }, changes: [] }
		builder.leave()
		await builder.resolveClose(true)
		expect(builder.session.value.active).toBe(false)
	})

	it('keeps what is edited while it is under way, undoable, on top of what it wrote', async () => {
		let answer: (value: unknown) => void = () => {}
		backend.answers[SAVE_ROUTE] = new Promise((resolve) => {
			answer = resolve
		})
		theme.setColor('primary', 'violet')
		const saving = builder.save()
		await vi.advanceTimersByTimeAsync(0)
		theme.setColor('error', 'rose')

		answerTheme(savedTheme({ colors: { primary: 'violet' }, version: 't2' }))
		answer({ ok: true, data: { version: 't2' }, changes: [] })
		await saving

		expect(theme.state.value.baseline?.colors).toEqual({ primary: 'violet' })
		expect(theme.state.value.draft?.colors).toEqual({ primary: 'violet', error: 'rose' })
		expect(theme.changeCount.value).toBe(1)
		builder.undo()
		expect(theme.state.value.draft?.colors).toEqual({ primary: 'violet' })
		expect(theme.dirty.value).toBe(false)
		expect(builder.canUndo.value, 'nothing before the save').toBe(false)
	})

	it('says the page went through when only the theme is turned down', async () => {
		builder.setWorkspace('page')
		builder.addBlock('Text')
		theme.setColor('primary', 'violet')
		backend.answers[SAVE_ROUTE] = {
			ok: false,
			error: { code: 'invalid_config', issues: [{ pointer: '/colors/primary', message: 'violet is not declared' }] },
		}
		await builder.save()

		expect(builder.pageDirty.value, 'the page is saved').toBe(false)
		expect(builder.session.value.lastSave).toMatchObject({ outcome: 'failed', pageSaved: true })
		expect(describeError(builder.session.value.error!, null)).toBe('The theme was not saved: violet is not declared.')
	})
})

describe('the theme on the page', () => {
	it('takes a logo the DMS has none of off the dashboard once discarded or undone', async () => {
		await theme.pickLogo(['email'], 'light', png())
		const picked = shownLogos()?.email?.light
		expect(picked).toMatch(/^blob:/)

		builder.cancel()
		expect(shownLogos()?.email, 'nothing to put back, nothing left').toBeUndefined()
		theme.undo()
		expect(shownLogos()?.email?.light).toBe(picked)
		theme.undo()
		expect(shownLogos()?.email).toBeUndefined()
	})

	it("brings both back from the toast's Undo after discarding the page and the theme", async () => {
		builder.setWorkspace('page')
		builder.addBlock('Text')
		await openTheme()
		theme.setVariable('shared', '--ui-radius', '0rem')
		builder.cancel()
		expect(builder.dirty.value).toBe(false)

		builder.undoFromToast()
		expect(theme.state.value.draft?.variables.shared).toEqual({ '--ui-radius': '0rem' })
		expect(builder.pageDirty.value, 'the page too, whatever the workspace').toBe(true)
		expect(builder.session.value.toast).toBe(null)
	})

	it('takes no step of undo for an edit that changes nothing', () => {
		theme.setColor('primary', 'violet')
		theme.setVariable('shared', '--ui-radius', '0rem')
		const steps = theme.state.value.history.length
		theme.setColor('primary', 'violet')
		theme.resetLogo(['email'], 'dark')

		expect(theme.state.value.history, 'the swatch already chosen, no logo to hand back').toHaveLength(steps)
		theme.undo()
		expect(theme.state.value.draft?.variables.shared, 'Undo takes back the last real edit').toEqual({})
	})

	it('holds nothing unsaved after a value is cleared and typed again', async () => {
		answerTheme(savedTheme({ variables: { shared: {}, light: { '--ui-bg': '#fff', '--ui-text': '#111' }, dark: {} } }))
		theme.clear()
		await theme.load()
		theme.setVariable('light', '--ui-bg', '')
		theme.setVariable('light', '--ui-bg', '#fff')

		expect(theme.changeCount.value).toBe(0)
		expect(theme.dirty.value, 'nor holds back leaving').toBe(false)
		builder.leave()
		expect(builder.session.value.active).toBe(false)
	})

	it('reads the theme once as its workspace and its panel both ask', async () => {
		theme.clear()
		const before = themeReads()
		builder.setWorkspace('page')
		builder.setWorkspace('theme')
		await theme.load()
		expect(themeReads() - before).toBe(1)
	})

	it('lets go of a logo picked once neither the draft nor its history holds it', async () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL')
		await theme.pickLogo(['favicon'], 'dark', png())
		const url = theme.state.value.pendingLogos['favicon:dark']?.previewUrl
		await theme.pickLogo(['favicon'], 'dark', png('other.png', [1, 2, 3]))
		expect(revoke, 'Undo can still bring it back').not.toHaveBeenCalledWith(url)

		theme.undo()
		theme.undo()
		theme.setColor('primary', 'violet')
		// Both picks were in the steps to redo, which an edit drops.
		expect(revoke).toHaveBeenCalledWith(url)
	})
})

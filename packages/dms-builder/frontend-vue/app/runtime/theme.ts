import { computed, type ComputedRef, type Ref } from 'vue'
import {
	useDmsAppConfig,
	useDmsState as useState,
} from '#dms/frontend-module'
import { useBuilderApi } from './api'
import {
	LOGO_CONTENT_TYPES,
	MAX_LOGO_BYTES,
	THEME_PREVIEW_STYLE_ID,
	THEME_STATE_KEY,
} from './constants'
import type {
	BuilderError,
	LogoSlot,
	LogoSources,
	LogoUpload,
	OpResult,
	ThemeDraft,
	ThemeLogos,
	ThemeMode,
	ThemeStructure,
	ThemeVariableSets,
	ThemeVariables,
} from './types'

export const THEME_MODES: ThemeMode[] = ['light', 'dark']

/**
 * The selectors the theme overrides each mode at, the ones the module writes.
 * Light is not plain `:root`: unlayered, a `:root` rule still matches a page in
 * dark mode and wins over the DMS's layered `.dark` default, so a value set for
 * light alone would show in dark too.
 */
const MODE_SELECTORS: Record<ThemeMode, string> = {
	light: ':root:not(.dark)',
	dark: '.dark',
}

/**
 * The value that hands a variable back to the DMS default. The DMS declares its
 * defaults in a cascade layer and the theme overrides them unlayered, so
 * rolling the cascade back one layer skips the saved override, whatever
 * stylesheet holds it.
 */
const DMS_DEFAULT = 'revert-layer'

/** A logo picked and not saved yet: what the save sends, and a URL to show it until then. */
export interface PendingLogo {
	upload: LogoUpload
	url: string
}

export interface ThemeEditorState {
	structure: ThemeStructure | null
	draft: ThemeDraft | null
	baseline: ThemeDraft | null
	/** Logos picked since the last save, by `slot:mode`. */
	pending: Record<string, PendingLogo>
	loading: boolean
	/** Why the theme cannot be read, when it cannot. */
	error: BuilderError | null
	/** The logos the dashboard showed when the editor opened, put back on discard. */
	shownLogos: ThemeLogos | null
}

/** The slice of the host's app config the logo preview writes into. */
interface BrandingConfig {
	branding?: { logo?: ThemeLogos }
}

function emptyThemeState(): ThemeEditorState {
	return {
		structure: null,
		draft: null,
		baseline: null,
		pending: {},
		loading: false,
		error: null,
		shownLogos: null,
	}
}

export function logoKey(slot: LogoSlot, mode: ThemeMode): string {
	return `${slot}:${mode}`
}

export function cloneTheme(draft: ThemeDraft): ThemeDraft {
	return JSON.parse(JSON.stringify(draft)) as ThemeDraft
}

/**
 * What a theme value may not hold, as the module words it: anything that ends
 * a declaration or a rule, a comment, an escape, markup, or a resource fetched
 * from elsewhere. Checked here too, so a cell says so as it is typed.
 */
const UNSAFE_VALUE = /[;{}<>\\]|\/\*|\*\/|url\(|@import|!important/i
const MAX_VALUE_LENGTH = 512

/** Why a value cannot be written to the theme, if it cannot. */
export function valueProblem(value: string): string | undefined {
	if (value.length > MAX_VALUE_LENGTH) {
		return `A value holds at most ${MAX_VALUE_LENGTH} characters.`
	}
	return UNSAFE_VALUE.test(value)
		? 'A value cannot hold ; { } < > \\, a comment, url(), @import or !important.'
		: undefined
}

/** One declaration of the preview: a custom property and the value it shows. */
export type PreviewDeclaration = [name: string, value: string]

/**
 * What the preview declares in one mode: the draft's values, and the DMS
 * default back for every saved override the draft dropped. A value the
 * theme could not be saved with is left out rather than shown.
 */
export function previewDeclarations(
	draft: ThemeVariables,
	saved: ThemeVariables,
): PreviewDeclaration[] {
	const dropped = Object.keys(saved)
		.filter((name) => !(name in draft))
		.map((name): PreviewDeclaration => [name, DMS_DEFAULT])
	const kept = Object.entries(draft).filter(([, value]) => !valueProblem(value))
	return [...dropped, ...kept]
}

/**
 * Show a draft on the live page, through a style element kept last in
 * `<head>`: unlayered, it wins over the saved theme without replacing it.
 * The values go in through the CSSOM rather than as text, so no value can
 * close its rule and open another.
 */
function writePreview(
	element: HTMLStyleElement,
	draft: ThemeVariableSets,
	saved: ThemeVariableSets,
): void {
	const sheet = element.sheet
	if (!sheet) {
		return
	}
	for (const mode of THEME_MODES) {
		const index = sheet.insertRule(`${MODE_SELECTORS[mode]} {}`, sheet.cssRules.length)
		const rule = sheet.cssRules[index]
		if (!(rule instanceof CSSStyleRule)) {
			continue
		}
		for (const [name, value] of previewDeclarations(draft[mode], saved[mode])) {
			rule.style.setProperty(name, value)
		}
	}
}

/** Why a file cannot be a logo, before it is sent: the module checks again. */
export function logoRefusal(file: { type: string; size: number }): string | undefined {
	if (!LOGO_CONTENT_TYPES.some((type) => type === file.type)) {
		return 'A logo is an SVG, PNG, WebP or ICO file.'
	}
	return file.size > MAX_LOGO_BYTES
		? `A logo holds at most ${MAX_LOGO_BYTES / 1024} KiB.`
		: undefined
}

/**
 * The logo each slot shows in the preview: the file picked, else the path the
 * draft keeps, else — when the draft drops a saved override — nothing the
 * editor can name, so the dashboard keeps what it shows until the save.
 */
export function previewLogo(
	state: ThemeEditorState,
	slot: LogoSlot,
	mode: ThemeMode,
): string | undefined {
	const picked = state.pending[logoKey(slot, mode)]?.url
	const kept = state.draft?.logos[slot]?.[mode]
	const saved = state.baseline?.logos[slot]?.[mode]
	return picked ?? kept ?? (saved ? undefined : state.shownLogos?.[slot]?.[mode])
}

function toBase64(buffer: ArrayBuffer): string {
	let binary = ''
	for (const byte of new Uint8Array(buffer)) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary)
}

/** The values as the stylesheet holds them, without the spaces typed around them. */
export function trimmedVariables(variables: ThemeVariableSets): ThemeVariableSets {
	const trim = (values: ThemeVariables): ThemeVariables =>
		Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value.trim()]))
	return { light: trim(variables.light), dark: trim(variables.dark) }
}

function draftOf(structure: ThemeStructure): ThemeDraft {
	return cloneTheme({ variables: structure.variables, logos: structure.logos })
}

function runtimeLogos(): ThemeLogos | undefined {
	const config: BrandingConfig = useDmsAppConfig()
	return config.branding?.logo
}

export interface ThemeEditor {
	state: Ref<ThemeEditorState>
	dirty: ComputedRef<boolean>
	load: (force?: boolean) => Promise<void>
	setVariable: (mode: ThemeMode, name: string, value: string) => void
	resetVariable: (mode: ThemeMode, name: string) => void
	pickLogo: (slot: LogoSlot, mode: ThemeMode, file: File) => Promise<string | undefined>
	resetLogo: (slot: LogoSlot, mode: ThemeMode) => void
	discard: () => void
	save: () => Promise<OpResult<{ version: string }> | undefined>
	clear: () => void
}

export function useThemeEditor(): ThemeEditor {
	const state = useState<ThemeEditorState>(THEME_STATE_KEY, emptyThemeState)
	const api = useBuilderApi()

	const dirty = computed(
		() =>
			!!state.value.draft &&
			(JSON.stringify(state.value.draft) !== JSON.stringify(state.value.baseline) ||
				Object.keys(state.value.pending).length > 0),
	)

	function previewStyles(): void {
		const { draft, baseline } = state.value
		document.getElementById(THEME_PREVIEW_STYLE_ID)?.remove()
		const element = document.createElement('style')
		element.id = THEME_PREVIEW_STYLE_ID
		document.head.appendChild(element)
		if (draft && baseline) {
			writePreview(element, draft.variables, baseline.variables)
		}
	}

	function previewLogos(): void {
		const logos = runtimeLogos()
		for (const [slot, sources] of Object.entries(logos ?? {}) as Array<[LogoSlot, LogoSources]>) {
			for (const mode of THEME_MODES) {
				const shown = previewLogo(state.value, slot, mode)
				if (shown !== undefined && sources[mode] !== shown) {
					sources[mode] = shown
				}
			}
		}
	}

	function preview(): void {
		previewStyles()
		previewLogos()
	}

	async function load(force = false): Promise<void> {
		if (state.value.draft && !force) {
			return
		}
		state.value.loading = true
		try {
			const result = await api.theme()
			if (!result.ok) {
				state.value.error = result.error
				return
			}
			state.value.structure = result.data
			state.value.draft = draftOf(result.data)
			state.value.baseline = draftOf(result.data)
			state.value.shownLogos ??= JSON.parse(JSON.stringify(runtimeLogos() ?? {})) as ThemeLogos
			state.value.error = null
			preview()
		} finally {
			state.value.loading = false
		}
	}

	function edit(apply: (draft: ThemeDraft) => void): void {
		if (!state.value.draft) {
			return
		}
		const next = cloneTheme(state.value.draft)
		apply(next)
		state.value.draft = next
		preview()
	}

	/**
	 * Set a value as it is typed, spaces and all: trimming it here would take
	 * the space away from under the caret. The save sends it trimmed.
	 */
	function setVariable(mode: ThemeMode, name: string, value: string): void {
		edit((draft) => {
			if (value.trim() === '') {
				delete draft.variables[mode][name]
				return
			}
			draft.variables[mode][name] = value
		})
	}

	function resetVariable(mode: ThemeMode, name: string): void {
		edit((draft) => {
			delete draft.variables[mode][name]
		})
	}

	function dropPending(key: string): void {
		const entry = state.value.pending[key]
		if (!entry) {
			return
		}
		const { [key]: _dropped, ...rest } = state.value.pending
		state.value.pending = rest
	}

	async function pickLogo(
		slot: LogoSlot,
		mode: ThemeMode,
		file: File,
	): Promise<string | undefined> {
		const refusal = logoRefusal(file)
		if (refusal) {
			return refusal
		}
		const data = toBase64(await file.arrayBuffer())
		const upload: LogoUpload = { slot, mode, contentType: file.type, data }
		state.value.pending = {
			...state.value.pending,
			[logoKey(slot, mode)]: { upload, url: URL.createObjectURL(file) },
		}
		edit((draft) => {
			delete draft.logos[slot]?.[mode]
		})
		return undefined
	}

	function resetLogo(slot: LogoSlot, mode: ThemeMode): void {
		dropPending(logoKey(slot, mode))
		edit((draft) => {
			delete draft.logos[slot]?.[mode]
		})
	}

	function restoreShownLogos(): void {
		const logos = runtimeLogos()
		const shown = state.value.shownLogos ?? {}
		for (const [slot, sources] of Object.entries(logos ?? {}) as Array<[LogoSlot, LogoSources]>) {
			Object.assign(sources, shown[slot] ?? {})
		}
	}

	function discard(): void {
		if (!state.value.baseline) {
			return
		}
		state.value.pending = {}
		state.value.draft = cloneTheme(state.value.baseline)
		restoreShownLogos()
		preview()
	}

	async function save(): Promise<OpResult<{ version: string }> | undefined> {
		const { draft, structure } = state.value
		if (!draft || !dirty.value) {
			return undefined
		}
		const uploads = Object.values(state.value.pending).map((entry) => entry.upload)
		const result = await api.saveTheme({
			draft: { variables: trimmedVariables(draft.variables), logos: draft.logos, uploads },
			expectedVersion: structure?.version,
		})
		if (result.ok) {
			state.value.pending = {}
			state.value.shownLogos = null
			await load(true)
		}
		return result
	}

	/**
	 * Take the preview off the page and forget the theme. Only a theme that was
	 * loaded has put anything on the page, so an editor that never opened the
	 * theme touches nothing.
	 */
	function clear(): void {
		if (state.value.draft) {
			restoreShownLogos()
			document.getElementById(THEME_PREVIEW_STYLE_ID)?.remove()
		}
		state.value = emptyThemeState()
	}

	return {
		state,
		dirty,
		load,
		setVariable,
		resetVariable,
		pickLogo,
		resetLogo,
		discard,
		save,
		clear,
	}
}

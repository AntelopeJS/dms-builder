import { computed, type ComputedRef, type Ref } from 'vue'
import {
	useDmsAppConfig,
	useDmsState as useState,
} from '#dms/frontend-module'
import { useBuilderApi } from './api'
import { catalogEntry, type ThemeValueKind } from './theme-catalog'
import {
	LOGO_TYPES_BY_EXTENSION,
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
	ValidationIssue,
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

/** What a value of each kind is, as a refusal names it. */
const KIND_NAMES: Record<ThemeValueKind, string> = {
	color: 'a color',
	'border-radius': 'a length such as 0.5rem',
	'font-family': 'a list of fonts such as "Inter", sans-serif',
}

/**
 * Whether the browser takes a value for a property of its kind. The module has
 * no CSS engine to ask; where the editor runs, the browser is one.
 */
function isOfKind(value: string, kind: ThemeValueKind): boolean {
	const css = globalThis.CSS
	return value.trim() === '' || !css?.supports || css.supports(kind, value)
}

/**
 * Why a value cannot be written to the theme, if it cannot, said of the value:
 * "is not a color". A value of the wrong kind is refused here only: the module
 * cannot tell, and the dashboard would draw it as nothing.
 */
export function valueProblem(value: string, kind?: ThemeValueKind): string | undefined {
	if (value.length > MAX_VALUE_LENGTH) {
		return `holds more than ${MAX_VALUE_LENGTH} characters`
	}
	if (UNSAFE_VALUE.test(value)) {
		return 'cannot hold ; { } < > \\, a comment, url(), @import or !important'
	}
	return kind && !isOfKind(value, kind) ? `is not ${KIND_NAMES[kind]}` : undefined
}

/** A color set on the canvas before the one resolved, to tell whether the canvas took it. */
const UNLIKELY_COLOR = '#fe01fd'

/** The 2D context colors are resolved through, made on first use. */
let colorContext: CanvasRenderingContext2D | null | undefined

/**
 * A CSS color as the `#rrggbb` a color input holds, if the browser can draw
 * it: the input takes nothing else, and a picker opened on black for an
 * `oklch()` or a named color loses the color the author started from. Alpha is
 * dropped, as the input has none.
 */
export function hexOf(color: string): string | undefined {
	if (typeof document === 'undefined' || color.trim() === '') {
		return undefined
	}
	colorContext ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
	if (!colorContext) {
		return undefined
	}
	colorContext.fillStyle = UNLIKELY_COLOR
	colorContext.fillStyle = color
	if (colorContext.fillStyle === UNLIKELY_COLOR) {
		return undefined
	}
	colorContext.clearRect(0, 0, 1, 1)
	colorContext.fillRect(0, 0, 1, 1)
	const [red = 0, green = 0, blue = 0] = colorContext.getImageData(0, 0, 1, 1).data
	return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Why the theme's value for a variable cannot be written, the catalog telling its kind. */
export function variableProblem(name: string, value: string): string | undefined {
	return valueProblem(value, catalogEntry(name)?.kind)
}

/** Every value of a draft the theme could not be saved with, named after its row. */
export function themeIssues(variables: ThemeVariableSets): ValidationIssue[] {
	return THEME_MODES.flatMap((mode) =>
		Object.entries(variables[mode]).flatMap(([name, value]) => {
			const problem = variableProblem(name, value)
			const label = catalogEntry(name)?.label ?? name
			return problem ? [{ pointer: `/variables/${mode}/${name}`, message: `${label} (${mode}) ${problem}` }] : []
		}),
	)
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
	const kept = Object.entries(draft).filter(([name, value]) => !variableProblem(name, value))
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

/** What the editor knows of a file picked as a logo. */
export type PickedFile = Pick<File, 'name' | 'type' | 'size'>

/** Every type a logo may be sent as, and what the file chooser offers. */
export const LOGO_ACCEPT = [
	...Object.values(LOGO_TYPES_BY_EXTENSION).flat(),
	...Object.keys(LOGO_TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
].join(',')

/**
 * The type a logo is sent as: the one the browser gives, or, when it gives
 * none, the one its extension names. The module checks the bytes either way.
 */
export function logoContentType(file: PickedFile): string | undefined {
	const accepted = Object.values(LOGO_TYPES_BY_EXTENSION).flat()
	if (file.type !== '') {
		return accepted.includes(file.type) ? file.type : undefined
	}
	const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
	return LOGO_TYPES_BY_EXTENSION[extension]?.[0]
}

/** Why a file cannot be a logo, before it is sent: the module checks again. */
export function logoRefusal(file: PickedFile): string | undefined {
	if (!logoContentType(file)) {
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

/**
 * A set of values the author edited, moved onto the same set read again:
 * what the author changed from what they started with — set or removed — goes
 * on top of the new one, and what they left alone reads as the new one has it.
 */
function rebaseValues<K extends string>(
	draft: Partial<Record<K, string>>,
	from: Partial<Record<K, string>>,
	onto: Partial<Record<K, string>>,
): Partial<Record<K, string>> {
	const result = { ...onto }
	const names = new Set([...Object.keys(draft), ...Object.keys(from)] as K[])
	for (const name of names) {
		const value = draft[name]
		if (value === from[name]) {
			continue
		}
		if (value === undefined) {
			delete result[name]
		} else {
			result[name] = value
		}
	}
	return result
}

/** An author's draft, moved from the theme it started from onto the theme the files hold now. */
export function rebaseTheme(draft: ThemeDraft, from: ThemeDraft, onto: ThemeDraft): ThemeDraft {
	const slots = new Set([draft, from, onto].flatMap((theme) => Object.keys(theme.logos) as LogoSlot[]))
	const logos: ThemeLogos = {}
	for (const slot of slots) {
		const sources = rebaseValues(draft.logos[slot] ?? {}, from.logos[slot] ?? {}, onto.logos[slot] ?? {})
		if (Object.keys(sources).length > 0) {
			logos[slot] = sources
		}
	}
	return {
		variables: {
			light: rebaseValues(draft.variables.light, from.variables.light, onto.variables.light) as ThemeVariables,
			dark: rebaseValues(draft.variables.dark, from.variables.dark, onto.variables.dark) as ThemeVariables,
		},
		logos,
	}
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
	/** Read the theme's files again after they changed on disk, keeping the author's changes on top. */
	refresh: () => Promise<void>
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
		const contentType = logoContentType(file)
		if (refusal || !contentType) {
			return refusal
		}
		const data = toBase64(await file.arrayBuffer())
		const upload: LogoUpload = { slot, mode, contentType, data }
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
		const issues = themeIssues(draft.variables)
		if (issues.length > 0) {
			return { ok: false, error: { code: 'invalid_config', issues } }
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
	 * Read the theme again once its files changed on disk: the new files become
	 * what the draft is compared with, and the author's changes stay on top, so
	 * a save writes over the files knowingly and a discard keeps them.
	 */
	async function refresh(): Promise<void> {
		const { draft, baseline } = state.value
		const result = await api.theme()
		if (!result.ok) {
			state.value.error = result.error
			return
		}
		const onDisk = draftOf(result.data)
		state.value.structure = result.data
		state.value.baseline = onDisk
		state.value.draft = draft && baseline ? rebaseTheme(draft, baseline, onDisk) : cloneTheme(onDisk)
		preview()
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
		refresh,
		clear,
	}
}

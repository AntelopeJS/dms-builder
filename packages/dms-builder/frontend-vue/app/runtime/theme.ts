import { computed, type ComputedRef, type Ref } from 'vue'
import { useDmsAppConfig, useDmsState as useState } from '#dms/frontend-module'
import { useBuilderApi } from './api'
import {
	HISTORY_LIMIT,
	LOGO_TYPES_BY_EXTENSION,
	MAX_LOGO_BYTES,
	THEME_STATE_KEY,
	UNDO_GROUP_MS,
} from './constants'
import {
	catalogEntry,
	SQUARE_LOGO_SLOTS,
	THEME_LOGO_SLOTS,
	WIDE_LOGO_SLOTS,
	type ThemeValueKind,
} from './theme-catalog'
import {
	isolateChrome,
	releaseChrome,
	removePreview,
	showPageIn,
	THEME_MODES,
	writePreview,
} from './theme-preview'
import { isSvg, rasterizeForEmail } from './theme-raster'
import type {
	BuilderError,
	LogoSlot,
	LogoSources,
	LogoUpload,
	OpResult,
	ThemeColorRole,
	ThemeColors,
	ThemeDraft,
	ThemeLayer,
	ThemeLogos,
	ThemeMode,
	ThemeStructure,
	ThemeVariableSets,
	ThemeVariables,
	ValidationIssue,
} from './types'

export { THEME_MODES }

/** Where a variable's value is kept: the set both modes share, or one mode's own. */
export type VariableSet = keyof ThemeVariableSets

const VARIABLE_SETS: VariableSet[] = ['shared', 'light', 'dark']

/** A logo picked and not saved yet: what the save sends, and a URL to show it until then. */
export interface PendingLogo {
	upload: LogoUpload
	url: string
}

/** The theme as one step of undo holds it. */
interface ThemeSnapshot {
	draft: ThemeDraft
	pending: Record<string, PendingLogo>
}

export interface ThemeEditorState {
	structure: ThemeStructure | null
	draft: ThemeDraft | null
	baseline: ThemeDraft | null
	/** Logos picked since the last save, by `slot:mode`. */
	pending: Record<string, PendingLogo>
	/**
	 * The theme's own steps of undo: the page's history is about the page,
	 * and ⌘Z takes back what is under the author's eyes.
	 */
	history: ThemeSnapshot[]
	future: ThemeSnapshot[]
	loading: boolean
	/** Why the theme cannot be read, when it cannot. */
	error: BuilderError | null
	/** Where the project's frontend layer would be created, when it has none. */
	missingLayer: string | null
	creatingLayer: boolean
	/** The layer just created, which the frontend dev server serves once restarted. */
	createdLayer: ThemeLayer | null
	/** The logos the dashboard showed when the editor opened, put back on discard. */
	shownLogos: ThemeLogos | null
	/** The mode the page is shown in for the preview; null leaves it in the viewer's. */
	previewMode: ThemeMode | null
}

/**
 * What the DMS publishes of its own look in its app config, for an editor to
 * show a reset before it is saved: the logos and palettes a project's layer
 * leaves alone.
 */
interface DmsDefaults {
	logo?: ThemeLogos
	colors?: ThemeColors
}

/** The slice of the host's app config the editor reads and the logo preview writes. */
interface BrandingConfig {
	branding?: { logo?: ThemeLogos; defaults?: DmsDefaults }
}

function emptyThemeState(): ThemeEditorState {
	return {
		structure: null,
		draft: null,
		baseline: null,
		pending: {},
		history: [],
		future: [],
		loading: false,
		error: null,
		missingLayer: null,
		creatingLayer: false,
		createdLayer: null,
		shownLogos: null,
		previewMode: null,
	}
}

/** The last step of undo pushed, and what it was about. */
let lastStep: { group: string | null; at: number } = { group: null, at: 0 }

export function logoKey(slot: LogoSlot, mode: ThemeMode): string {
	return `${slot}:${mode}`
}

export function cloneTheme(draft: ThemeDraft): ThemeDraft {
	return JSON.parse(JSON.stringify(draft)) as ThemeDraft
}

export function emptyVariables(): ThemeVariableSets {
	return { shared: {}, light: {}, dark: {} }
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

/** A palette name as the module takes it. */
const PALETTE_NAME = /^[a-z][a-z0-9-]*$/

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

/** Why the theme's value for a variable cannot be written, the catalog telling its kind. */
export function variableProblem(name: string, value: string): string | undefined {
	return valueProblem(value, catalogEntry(name)?.kind)
}

const SET_NAMES: Record<VariableSet, string> = {
	shared: 'both modes',
	light: 'light',
	dark: 'dark',
}

/** Every value of a draft the theme could not be saved with, named after its row. */
export function themeIssues(draft: ThemeDraft): ValidationIssue[] {
	const variables = VARIABLE_SETS.flatMap((set) =>
		Object.entries(draft.variables[set]).flatMap(([name, value]) => {
			const problem = variableProblem(name, value)
			const label = catalogEntry(name)?.label ?? name
			return problem
				? [{ pointer: `/variables/${set}/${name}`, message: `${label} (${SET_NAMES[set]}) ${problem}` }]
				: []
		}),
	)
	const colors = Object.entries(draft.colors).flatMap(([role, palette]) =>
		palette && !PALETTE_NAME.test(palette)
			? [{ pointer: `/colors/${role}`, message: `${palette} is not a palette name such as violet` }]
			: [],
	)
	return [...variables, ...colors]
}

/** A color as a color input holds it, `#rrggbb`, when the browser can draw it. */
const UNLIKELY_COLOR = '#fe01fd'
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

/** The name the builder gives a logo it writes ends with its content's hash. */
const CONTENT_NAME = /-([0-9a-f]{8}\.[a-z]+)$/

/**
 * Whether two slots show the same logo: the same file picked, or saved files
 * of the same content — the builder names a file after its bytes.
 */
export function sameLogo(
	state: Pick<ThemeEditorState, 'pending' | 'draft'>,
	first: LogoSlot,
	second: LogoSlot,
	mode: ThemeMode,
): boolean {
	const pendingFirst = state.pending[logoKey(first, mode)]
	const pendingSecond = state.pending[logoKey(second, mode)]
	if (pendingFirst || pendingSecond) {
		return pendingFirst?.upload.data === pendingSecond?.upload.data
	}
	const savedFirst = state.draft?.logos[first]?.[mode]
	const savedSecond = state.draft?.logos[second]?.[mode]
	if (savedFirst === savedSecond) {
		return true
	}
	const contentFirst = savedFirst ? CONTENT_NAME.exec(savedFirst)?.[1] : undefined
	return contentFirst !== undefined && contentFirst === (savedSecond ? CONTENT_NAME.exec(savedSecond)?.[1] : undefined)
}

/** The slot the simple mode's logo is shown by, and the one its square icon is. */
export const SIMPLE_LOGO_SLOT: LogoSlot = 'default'
export const SIMPLE_ICON_SLOT: LogoSlot = 'collapsed'

/** Whether a slot holds something of the project's in a mode, saved or picked. */
export function holdsLogo(
	state: Pick<ThemeEditorState, 'pending' | 'draft'>,
	slot: LogoSlot,
	mode: ThemeMode,
): boolean {
	return state.pending[logoKey(slot, mode)] !== undefined || state.draft?.logos[slot]?.[mode] !== undefined
}

/** Whether the square slots only repeat the simple mode's logo in a mode. */
export function iconFollowsLogo(state: Pick<ThemeEditorState, 'pending' | 'draft'>, mode: ThemeMode): boolean {
	return holdsLogo(state, SIMPLE_LOGO_SLOT, mode) && sameLogo(state, SIMPLE_LOGO_SLOT, SIMPLE_ICON_SLOT, mode)
}

/**
 * The slots the simple mode's logo goes to in a mode: everywhere a logo
 * shows, but the square slots when they hold an icon of their own.
 */
export function simpleLogoSlots(state: Pick<ThemeEditorState, 'pending' | 'draft'>, mode: ThemeMode): LogoSlot[] {
	const ownIcon = holdsLogo(state, SIMPLE_ICON_SLOT, mode) && !iconFollowsLogo(state, mode)
	return ownIcon ? WIDE_LOGO_SLOTS : [...WIDE_LOGO_SLOTS, ...SQUARE_LOGO_SLOTS]
}

/**
 * The logo a slot shows in the preview: the file picked, else the path the
 * draft keeps, else — when the draft drops a saved logo — the DMS's own if it
 * says which, else nothing the editor can name.
 */
export function previewLogo(
	state: Pick<ThemeEditorState, 'pending' | 'draft' | 'baseline' | 'shownLogos'>,
	slot: LogoSlot,
	mode: ThemeMode,
	defaults?: ThemeLogos,
): string | undefined {
	const picked = state.pending[logoKey(slot, mode)]?.url
	const kept = state.draft?.logos[slot]?.[mode]
	if (picked ?? kept) {
		return picked ?? kept
	}
	const dmsLogo = defaults?.[slot]?.[mode]
	return state.baseline?.logos[slot]?.[mode] ? dmsLogo : (state.shownLogos?.[slot]?.[mode] ?? dmsLogo)
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
	return { shared: trim(variables.shared), light: trim(variables.light), dark: trim(variables.dark) }
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
	const variables = emptyVariables()
	for (const set of VARIABLE_SETS) {
		variables[set] = rebaseValues(draft.variables[set], from.variables[set], onto.variables[set]) as ThemeVariables
	}
	return { variables, colors: rebaseValues(draft.colors, from.colors, onto.colors), logos }
}

/** How many things a draft changes from the saved theme, as the bar counts them. */
export function themeChangeCount(state: Pick<ThemeEditorState, 'draft' | 'baseline' | 'pending'>): number {
	const { draft, baseline } = state
	if (!draft || !baseline) {
		return 0
	}
	const differing = <T>(next: Record<string, T>, saved: Record<string, T>): number =>
		new Set([...Object.keys(next), ...Object.keys(saved)]).size -
		Object.keys(next).filter((key) => key in saved && JSON.stringify(next[key]) === JSON.stringify(saved[key])).length
	const variables = VARIABLE_SETS.reduce(
		(count, set) => count + differing(draft.variables[set], baseline.variables[set]),
		0,
	)
	const logos = THEME_LOGO_SLOTS.reduce(
		(count, { slot }) =>
			count +
			THEME_MODES.filter(
				(mode) =>
					state.pending[logoKey(slot, mode)] !== undefined ||
					draft.logos[slot]?.[mode] !== baseline.logos[slot]?.[mode],
			).length,
		0,
	)
	return variables + differing(draft.colors, baseline.colors) + logos
}

function draftOf(structure: ThemeStructure): ThemeDraft {
	return cloneTheme({ variables: structure.variables, colors: structure.colors, logos: structure.logos })
}

/** The file a picked logo is sent as for one slot, the email's drawn as a PNG. */
async function fileForSlot(slot: LogoSlot, file: File): Promise<File | undefined> {
	return slot === 'email' && isSvg(file) ? rasterizeForEmail(file) : file
}

export interface ThemeEditor {
	state: Ref<ThemeEditorState>
	dirty: ComputedRef<boolean>
	changeCount: ComputedRef<number>
	canUndo: ComputedRef<boolean>
	canRedo: ComputedRef<boolean>
	/** The DMS's own logos and palettes, when it says which. */
	defaults: ComputedRef<DmsDefaults>
	load: (force?: boolean) => Promise<void>
	setVariable: (set: VariableSet, name: string, value: string) => void
	/** Set several variables of one set as one edit; `undefined` hands one back. */
	setVariables: (set: VariableSet, values: Record<string, string | undefined>) => void
	/** Hand a variable back to the DMS default, in every set. */
	resetVariable: (name: string) => void
	setColor: (role: ThemeColorRole, palette: string | undefined) => void
	/** Put a file in slots, one mode: answers why it cannot, or what it could not do. */
	pickLogo: (slots: LogoSlot[], mode: ThemeMode, file: File) => Promise<string | undefined>
	/** Hand slots back, one mode: to `follow`'s logo when given, else to the DMS's. */
	resetLogo: (slots: LogoSlot[], mode: ThemeMode, follow?: LogoSlot) => void
	setPreviewMode: (mode: ThemeMode | null) => void
	undo: () => void
	redo: () => void
	discard: () => void
	save: () => Promise<OpResult<{ version: string }> | undefined>
	/** Read the theme's files again after they changed on disk, keeping the author's changes on top. */
	refresh: () => Promise<void>
	createLayer: () => Promise<OpResult<ThemeLayer>>
	/** Keep the builder's own frame on the DMS look, read anew. */
	isolate: () => void
	clear: () => void
}

export function useThemeEditor(): ThemeEditor {
	const state = useState<ThemeEditorState>(THEME_STATE_KEY, emptyThemeState)
	const api = useBuilderApi()
	const appConfig: BrandingConfig = useDmsAppConfig()

	const dirty = computed(
		() =>
			!!state.value.draft &&
			(JSON.stringify(state.value.draft) !== JSON.stringify(state.value.baseline) ||
				Object.keys(state.value.pending).length > 0),
	)
	const changeCount = computed(() => themeChangeCount(state.value))
	const canUndo = computed(() => state.value.history.length > 0)
	const canRedo = computed(() => state.value.future.length > 0)
	const defaults = computed<DmsDefaults>(() => appConfig.branding?.defaults ?? {})

	function runtimeLogos(): ThemeLogos {
		appConfig.branding ??= {}
		appConfig.branding.logo ??= {}
		return appConfig.branding.logo
	}

	function previewLogos(): void {
		const logos = runtimeLogos()
		for (const { slot } of THEME_LOGO_SLOTS) {
			for (const mode of THEME_MODES) {
				const shown = previewLogo(state.value, slot, mode, defaults.value.logo)
				if (shown !== undefined && logos[slot]?.[mode] !== shown) {
					logos[slot] = { ...logos[slot], [mode]: shown } as LogoSources
				}
			}
		}
	}

	function preview(): void {
		const { draft, baseline } = state.value
		if (!draft || !baseline) {
			return
		}
		writePreview({
			draft,
			saved: baseline,
			defaults: defaults.value.colors,
			isValid: (name, value) => !variableProblem(name, value),
		})
		previewLogos()
	}

	function isolate(): void {
		isolateChrome(defaults.value.colors)
	}

	async function load(force = false): Promise<void> {
		if (state.value.draft && !force) {
			return
		}
		state.value.loading = true
		try {
			const result = await api.theme()
			if (!result.ok) {
				state.value.missingLayer = result.error.code === 'not_found' ? result.error.ref : null
				state.value.error = result.error
				return
			}
			state.value.structure = result.data
			state.value.draft = draftOf(result.data)
			state.value.baseline = draftOf(result.data)
			state.value.shownLogos ??= JSON.parse(JSON.stringify(runtimeLogos())) as ThemeLogos
			state.value.error = null
			state.value.missingLayer = null
			state.value.createdLayer = null
			preview()
		} finally {
			state.value.loading = false
		}
	}

	function snapshot(): ThemeSnapshot | undefined {
		const { draft, pending } = state.value
		return draft ? { draft: cloneTheme(draft), pending: { ...pending } } : undefined
	}

	/**
	 * Apply an edit as one step of undo — or, made about the same thing within
	 * a moment of the previous one, as part of it: typing a color is one step.
	 */
	function edit(apply: (draft: ThemeDraft) => void, group: string | null = null): void {
		const before = snapshot()
		if (!before) {
			return
		}
		const now = Date.now()
		if (group === null || lastStep.group !== group || now - lastStep.at > UNDO_GROUP_MS) {
			state.value.history = [...state.value.history, before].slice(-HISTORY_LIMIT)
		}
		lastStep = { group, at: now }
		state.value.future = []
		const next = cloneTheme(before.draft)
		apply(next)
		state.value.draft = next
		preview()
	}

	function restore(step: ThemeSnapshot): void {
		state.value.draft = step.draft
		state.value.pending = step.pending
		lastStep = { group: null, at: 0 }
		preview()
	}

	function undo(): void {
		const previous = state.value.history.at(-1)
		const current = snapshot()
		if (!previous || !current) {
			return
		}
		state.value.history = state.value.history.slice(0, -1)
		state.value.future = [current, ...state.value.future]
		restore(previous)
	}

	function redo(): void {
		const next = state.value.future[0]
		const current = snapshot()
		if (!next || !current) {
			return
		}
		state.value.future = state.value.future.slice(1)
		state.value.history = [...state.value.history, current]
		restore(next)
	}

	/**
	 * Set a value as it is typed, spaces and all: trimming it here would take
	 * the space away from under the caret. The save sends it trimmed.
	 */
	function setVariable(set: VariableSet, name: string, value: string): void {
		edit((draft) => {
			if (value.trim() === '') {
				delete draft.variables[set][name]
				return
			}
			draft.variables[set][name] = value
		}, `variable:${set}:${name}`)
	}

	function setVariables(set: VariableSet, values: Record<string, string | undefined>): void {
		edit((draft) => {
			for (const [name, value] of Object.entries(values)) {
				if (value === undefined) {
					delete draft.variables[set][name]
				} else {
					draft.variables[set][name] = value
				}
			}
		})
	}

	function resetVariable(name: string): void {
		edit((draft) => {
			for (const set of VARIABLE_SETS) {
				delete draft.variables[set][name]
			}
		})
	}

	function setColor(role: ThemeColorRole, palette: string | undefined): void {
		edit((draft) => {
			if (palette === undefined || palette === '') {
				delete draft.colors[role]
				return
			}
			draft.colors[role] = palette
		}, `color:${role}`)
	}

	async function uploadFor(slot: LogoSlot, mode: ThemeMode, file: File): Promise<PendingLogo | undefined> {
		const sent = await fileForSlot(slot, file)
		const contentType = sent ? logoContentType(sent) : undefined
		if (!sent || !contentType) {
			return undefined
		}
		return {
			upload: { slot, mode, contentType, data: toBase64(await sent.arrayBuffer()) },
			url: URL.createObjectURL(sent),
		}
	}

	async function pickLogo(slots: LogoSlot[], mode: ThemeMode, file: File): Promise<string | undefined> {
		const refusal = logoRefusal(file)
		if (refusal) {
			return refusal
		}
		const picked = await Promise.all(slots.map((slot) => uploadFor(slot, mode, file)))
		const missed = slots.filter((_, index) => !picked[index])
		const before = snapshot()
		if (!before) {
			return undefined
		}
		const pending = { ...state.value.pending }
		slots.forEach((slot, index) => {
			const entry = picked[index]
			if (entry) {
				pending[logoKey(slot, mode)] = entry
			}
		})
		edit((draft) => {
			for (const slot of slots) {
				delete draft.logos[slot]?.[mode]
			}
		})
		state.value.pending = pending
		preview()
		return missed.length
			? `The ${missed.join(' and ')} logo could not be made from this file: the browser could not draw it.`
			: undefined
	}

	function resetLogo(slots: LogoSlot[], mode: ThemeMode, follow?: LogoSlot): void {
		const followed = follow ? state.value.pending[logoKey(follow, mode)] : undefined
		const pending = { ...state.value.pending }
		for (const slot of slots) {
			delete pending[logoKey(slot, mode)]
			if (followed) {
				pending[logoKey(slot, mode)] = { ...followed, upload: { ...followed.upload, slot } }
			}
		}
		edit((draft) => {
			const path = follow ? draft.logos[follow]?.[mode] : undefined
			for (const slot of slots) {
				if (path && !followed) {
					draft.logos[slot] = { ...draft.logos[slot], [mode]: path }
				} else {
					delete draft.logos[slot]?.[mode]
				}
			}
		})
		state.value.pending = pending
		preview()
	}

	function setPreviewMode(mode: ThemeMode | null): void {
		state.value.previewMode = mode
		showPageIn(mode)
	}

	/**
	 * The logo a slot shows once the preview is gone: the saved theme's, else
	 * the DMS's own, else what the dashboard showed when the editor opened. A
	 * save moves the first along, so leaving after one keeps the new logos.
	 */
	function restingLogo(slot: LogoSlot, mode: ThemeMode): string | undefined {
		return (
			state.value.baseline?.logos[slot]?.[mode] ??
			defaults.value.logo?.[slot]?.[mode] ??
			state.value.shownLogos?.[slot]?.[mode]
		)
	}

	function restoreShownLogos(): void {
		const logos = runtimeLogos()
		for (const { slot } of THEME_LOGO_SLOTS) {
			for (const mode of THEME_MODES) {
				const resting = restingLogo(slot, mode)
				if (resting !== undefined && logos[slot]?.[mode] !== resting) {
					logos[slot] = { ...logos[slot], [mode]: resting } as LogoSources
				}
			}
		}
	}

	function discard(): void {
		const before = snapshot()
		if (!state.value.baseline || !before) {
			return
		}
		state.value.history = [...state.value.history, before].slice(-HISTORY_LIMIT)
		state.value.future = []
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
		const issues = themeIssues(draft)
		if (issues.length > 0) {
			return { ok: false, error: { code: 'invalid_config', issues } }
		}
		const uploads = Object.values(state.value.pending).map((entry) => entry.upload)
		const result = await api.saveTheme({
			draft: { variables: trimmedVariables(draft.variables), colors: draft.colors, logos: draft.logos, uploads },
			expectedVersion: structure?.version,
		})
		if (result.ok) {
			state.value.pending = {}
			state.value.history = []
			state.value.future = []
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

	async function createLayer(): Promise<OpResult<ThemeLayer>> {
		state.value.creatingLayer = true
		try {
			const result = await api.createThemeLayer()
			if (result.ok) {
				state.value.createdLayer = result.data
				state.value.missingLayer = null
				state.value.error = null
			}
			return result
		} finally {
			state.value.creatingLayer = false
		}
	}

	/**
	 * Take the preview off the page and forget the theme. Only a theme that was
	 * loaded has put anything on the page, so an editor that never opened the
	 * theme touches nothing but the frame it kept on the DMS look.
	 */
	function clear(): void {
		if (state.value.draft) {
			restoreShownLogos()
			removePreview()
		}
		for (const entry of Object.values(state.value.pending)) {
			URL.revokeObjectURL(entry.url)
		}
		showPageIn(null)
		releaseChrome()
		lastStep = { group: null, at: 0 }
		state.value = emptyThemeState()
	}

	return {
		state,
		dirty,
		changeCount,
		canUndo,
		canRedo,
		defaults,
		load,
		setVariable,
		setVariables,
		resetVariable,
		setColor,
		pickLogo,
		resetLogo,
		setPreviewMode,
		undo,
		redo,
		discard,
		save,
		refresh,
		createLayer,
		isolate,
		clear,
	}
}

/** The slots the simple mode's logo goes to, and those that follow it without an icon of their own. */
export { SQUARE_LOGO_SLOTS, WIDE_LOGO_SLOTS }

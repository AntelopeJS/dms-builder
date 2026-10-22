import { computed, type ComputedRef, type Ref } from 'vue'
import { useDmsState } from '#dms/frontend-module'
import { useBuilderApi } from './api'
import { LOGO_TYPES_BY_EXTENSION, MAX_LOGO_BYTES, THEME_STATE_KEY } from './constants'
import {
	forgetLogoFilesExcept,
	forgetThemeDraft,
	logoFileName,
	type StoredLogo,
	storedLogoFiles,
	storedThemeDraft,
	storeLogoFile,
	storeThemeDraft,
	type StoredThemeDraft,
} from './draft-store'
import { type LastEdit, NO_EDIT, pushStep, recordEdit, stepBack, stepForward } from './history'
import {
	dmsBrandingDefaults as readDmsBrandingDefaults,
	type DmsDefaults,
	hostLogos,
	type LogoPatch,
	showHostLogos,
} from './host-branding'
import {
	catalogEntry,
	SQUARE_LOGO_SLOTS,
	THEME_LOGO_SLOTS,
	WIDE_LOGO_SLOTS,
	type ThemeValueKind,
} from './theme-catalog'
import { declareCatalogFonts, forgetCatalogFonts } from './theme-fonts'
import {
	isolateChrome,
	releaseChrome,
	removePreview,
	showPageIn,
	THEME_MODES,
	writePreview,
} from './theme-preview'
import { isMailable, rasterizeForEmail } from './theme-raster'
import type {
	BuilderError,
	LogoSlot,
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

/** Where a variable's value is set: the set both modes share, or one mode's own. */
export type VariableSetName = keyof ThemeVariableSets

const VARIABLE_SET_NAMES: VariableSetName[] = ['shared', 'light', 'dark']

/** A logo picked and not saved yet. */
export interface PendingLogo {
	upload: LogoUpload
	previewUrl: string
	/** Derived from the bytes, so the same file always gets the same name. */
	storedFileName: string
}

/** The theme editor's state as one undo step. */
export interface ThemeSnapshot {
	draft: ThemeDraft
	pendingLogos: Record<string, PendingLogo>
	/** Increases with every snapshot; a save uses it to find the steps taken while it was in flight. */
	seq: number
}

export interface ThemeEditorState {
	structure: ThemeStructure | null
	draft: ThemeDraft | null
	baseline: ThemeDraft | null
	/** By `slot:mode`. */
	pendingLogos: Record<string, PendingLogo>
	/** Kept apart from the page's undo steps: ⌘Z undoes in the workspace on screen. */
	history: ThemeSnapshot[]
	future: ThemeSnapshot[]
	loading: boolean
	readError: BuilderError | null
	/**
	 * The ref of a `not_found` read: where the missing frontend layer would be
	 * created, or the layer's missing entry file.
	 */
	missingLayerPath: string | null
	creatingLayer: boolean
	/** The layer just created, which the frontend dev server serves once restarted. */
	createdLayer: ThemeLayer | null
	/** Taken at the first read: the fallback for slots the saved theme leaves unset. */
	initialHostLogos: ThemeLogos | null
	/** The mode the page is shown in for the preview; null leaves it in the viewer's. */
	previewMode: ThemeMode | null
	/**
	 * Set while the restored-draft banner shows: when the draft was stored, and
	 * whether the theme files changed since.
	 */
	restoredDraft: { at: number; stale: boolean } | null
}

function emptyThemeState(): ThemeEditorState {
	return {
		structure: null,
		draft: null,
		baseline: null,
		pendingLogos: {},
		history: [],
		future: [],
		loading: false,
		readError: null,
		missingLayerPath: null,
		creatingLayer: false,
		createdLayer: null,
		initialHostLogos: null,
		previewMode: null,
		restoredDraft: null,
	}
}

// Kept here rather than in the state: each component calling
// `useThemeEditor()` gets its own functions, which must share these.

let lastEdit: LastEdit = NO_EDIT
let lastSnapshotSeq = 0
/** Shared by a second load() instead of reading again. */
let inFlightRead: Promise<void> | undefined
/** Bumped by each read and by clear(); the result of an older read is dropped. */
let latestReadId = 0
/** Shared by a second restoreKept(), so the stored draft is applied once. */
let inFlightRestore: Promise<void> | undefined
/** Blob URLs of picked logos, revoked once neither the pending logos nor an undo or redo step uses them. */
const logoObjectUrls = new Set<string>()

export function logoKey(slot: LogoSlot, mode: ThemeMode): string {
	return `${slot}:${mode}`
}

function parseLogoKey(key: string): { slot: LogoSlot; mode: ThemeMode } | undefined {
	const [slot, mode] = key.split(':')
	return THEME_LOGO_SLOTS.some((entry) => entry.slot === slot) && THEME_MODES.some((known) => known === mode)
		? { slot: slot as LogoSlot, mode: mode as ThemeMode }
		: undefined
}

/** Remove one mode of a slot from a set of logos, and the slot once it has no mode left. */
function dropLogo(logos: ThemeLogos, slot: LogoSlot, mode: ThemeMode): void {
	const sources = logos[slot]
	if (!sources) {
		return
	}
	delete sources[mode]
	if (Object.keys(sources).length === 0) {
		delete logos[slot]
	}
}

function samePendingLogos(first: Record<string, PendingLogo>, second: Record<string, PendingLogo>): boolean {
	const keys = Object.keys(first)
	return keys.length === Object.keys(second).length && keys.every((key) => first[key] === second[key])
}

export function cloneTheme(draft: ThemeDraft): ThemeDraft {
	return JSON.parse(JSON.stringify(draft)) as ThemeDraft
}

export function createEmptyVariableSets(): ThemeVariableSets {
	return { shared: {}, light: {}, dark: {} }
}

/**
 * The module's own check, repeated so a cell flags a value as it is typed:
 * anything that ends a declaration or a rule, a comment, an escape, markup,
 * !important, or a resource fetched from elsewhere.
 */
const UNSAFE_VALUE = /[;{}<>\\]|\/\*|\*\/|url\(|@import|!important/i
const MAX_VALUE_LENGTH = 512

/** Completes "is not …" in a refusal. */
const KIND_DESCRIPTIONS: Record<ThemeValueKind, string> = {
	color: 'a color',
	'border-radius': 'a length such as 0.5rem',
	'font-family': 'a list of fonts such as "Inter", sans-serif',
}

/** A palette name the module accepts. */
const PALETTE_NAME = /^[a-z][a-z0-9-]*$/

/**
 * Asks the browser's CSS parser, which the module lacks. An empty value, or no
 * `CSS.supports`, passes.
 */
function isOfKind(value: string, kind: ThemeValueKind): boolean {
	const css = globalThis.CSS
	return value.trim() === '' || !css?.supports || css.supports(kind, value)
}

/**
 * Why a value cannot be written to the theme, worded to follow the value's
 * label: "is not a color". A value of the wrong kind is refused only here: the
 * module cannot tell, and the dashboard would ignore it.
 */
export function valueProblem(value: string, kind?: ThemeValueKind): string | undefined {
	if (value.length > MAX_VALUE_LENGTH) {
		return `holds more than ${MAX_VALUE_LENGTH} characters`
	}
	if (UNSAFE_VALUE.test(value)) {
		return 'cannot hold ; { } < > \\, a comment, url(), @import or !important'
	}
	return kind && !isOfKind(value, kind) ? `is not ${KIND_DESCRIPTIONS[kind]}` : undefined
}

/** `valueProblem` with the kind the catalog gives the variable. */
export function variableProblem(name: string, value: string): string | undefined {
	return valueProblem(value, catalogEntry(name)?.kind)
}

const SET_LABELS: Record<VariableSetName, string> = {
	shared: 'both modes',
	light: 'light',
	dark: 'dark',
}

/** The draft's invalid variable values and palette names; a variable is named by its catalog label. */
export function themeIssues(draft: ThemeDraft): ValidationIssue[] {
	const variableIssues = VARIABLE_SET_NAMES.flatMap((setName) =>
		Object.entries(draft.variables[setName]).flatMap(([name, value]) => {
			const problem = variableProblem(name, value)
			const label = catalogEntry(name)?.label ?? name
			return problem
				? [{ pointer: `/variables/${setName}/${name}`, message: `${label} (${SET_LABELS[setName]}) ${problem}` }]
				: []
		}),
	)
	const colorIssues = Object.entries(draft.colors).flatMap(([role, palette]) =>
		palette && !PALETTE_NAME.test(palette)
			? [{ pointer: `/colors/${role}`, message: `${palette} is not a palette name such as violet` }]
			: [],
	)
	return [...variableIssues, ...colorIssues]
}

/** A color nobody types: if `fillStyle` still holds it after the assignment, the browser rejected the color. */
const SENTINEL_COLOR = '#fe01fd'
let colorContext: CanvasRenderingContext2D | null | undefined

/**
 * A CSS color as the `#rrggbb` a color input holds, if the browser can draw
 * it: the input takes nothing else, and a picker opened on black for an
 * `oklch()` or a named color loses the color the author started from. Alpha is
 * dropped, as the input has none.
 */
export function hexOf(color: string): string | undefined {
	// No canvas outside a browser: during SSR, or in the test DOM components
	// are mounted in.
	if (typeof document === 'undefined' || typeof document.createElement !== 'function' || color.trim() === '') {
		return undefined
	}
	colorContext ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
	if (!colorContext) {
		return undefined
	}
	colorContext.fillStyle = SENTINEL_COLOR
	colorContext.fillStyle = color
	if (colorContext.fillStyle === SENTINEL_COLOR) {
		return undefined
	}
	colorContext.clearRect(0, 0, 1, 1)
	colorContext.fillRect(0, 0, 1, 1)
	const [red = 0, green = 0, blue = 0] = colorContext.getImageData(0, 0, 1, 1).data
	return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** What the editor knows of a file picked as a logo. */
export type PickedFile = Pick<File, 'name' | 'type' | 'size'>

/** Every logo MIME type and extension. */
export const LOGO_INPUT_ACCEPT = [
	...new Set([
		...Object.values(LOGO_TYPES_BY_EXTENSION).flat(),
		...Object.keys(LOGO_TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
	]),
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
		return 'A logo is an SVG, PNG, JPEG, WebP or ICO file.'
	}
	return file.size > MAX_LOGO_BYTES
		? `A logo holds at most ${MAX_LOGO_BYTES / 1024} KiB.`
		: undefined
}

/** The builder ends each logo file name it writes with a hash of the content. */
const HASHED_NAME_SUFFIX = /-([0-9a-f]{8}\.[a-z]+)$/

/** Whether two slots show the same logo: the same file picked, or saved files with the same content hash. */
export function sameLogo(
	state: Pick<ThemeEditorState, 'pendingLogos' | 'draft'>,
	first: LogoSlot,
	second: LogoSlot,
	mode: ThemeMode,
): boolean {
	const pendingFirst = state.pendingLogos[logoKey(first, mode)]
	const pendingSecond = state.pendingLogos[logoKey(second, mode)]
	if (pendingFirst || pendingSecond) {
		return pendingFirst?.upload.base64Content === pendingSecond?.upload.base64Content
	}
	const savedFirst = state.draft?.logos[first]?.[mode]
	const savedSecond = state.draft?.logos[second]?.[mode]
	if (savedFirst === savedSecond) {
		return true
	}
	const hashFirst = savedFirst ? HASHED_NAME_SUFFIX.exec(savedFirst)?.[1] : undefined
	return hashFirst !== undefined && hashFirst === (savedSecond ? HASHED_NAME_SUFFIX.exec(savedSecond)?.[1] : undefined)
}

/** The slots simple mode edits its logo and its square icon through. */
export const SIMPLE_LOGO_SLOT: LogoSlot = 'default'
export const SIMPLE_ICON_SLOT: LogoSlot = 'collapsed'

/** Whether a slot has a project logo in a mode, saved or picked; the DMS's own does not count. */
export function holdsLogo(
	state: Pick<ThemeEditorState, 'pendingLogos' | 'draft'>,
	slot: LogoSlot,
	mode: ThemeMode,
): boolean {
	return state.pendingLogos[logoKey(slot, mode)] !== undefined || state.draft?.logos[slot]?.[mode] !== undefined
}

/** Whether, in a mode, `SIMPLE_ICON_SLOT` shows the same project logo as `SIMPLE_LOGO_SLOT`. */
export function iconFollowsLogo(state: Pick<ThemeEditorState, 'pendingLogos' | 'draft'>, mode: ThemeMode): boolean {
	return holdsLogo(state, SIMPLE_LOGO_SLOT, mode) && sameLogo(state, SIMPLE_LOGO_SLOT, SIMPLE_ICON_SLOT, mode)
}

/**
 * The slots simple mode's logo goes to in a mode: all of them, except the
 * square ones when `SIMPLE_ICON_SLOT` has an icon of its own.
 */
export function simpleLogoSlots(state: Pick<ThemeEditorState, 'pendingLogos' | 'draft'>, mode: ThemeMode): LogoSlot[] {
	const hasOwnIcon = holdsLogo(state, SIMPLE_ICON_SLOT, mode) && !iconFollowsLogo(state, mode)
	return hasOwnIcon ? WIDE_LOGO_SLOTS : [...WIDE_LOGO_SLOTS, ...SQUARE_LOGO_SLOTS]
}

/**
 * The logo a slot previews: the picked file, else the draft's path; if the
 * draft drops a saved logo, the DMS's; if the saved theme sets none, the
 * initial host logo, else the DMS's.
 */
export function previewLogo(
	state: Pick<ThemeEditorState, 'pendingLogos' | 'draft' | 'baseline' | 'initialHostLogos'>,
	slot: LogoSlot,
	mode: ThemeMode,
	dmsLogos?: ThemeLogos,
): string | undefined {
	const pickedUrl = state.pendingLogos[logoKey(slot, mode)]?.previewUrl
	const draftPath = state.draft?.logos[slot]?.[mode]
	if (pickedUrl ?? draftPath) {
		return pickedUrl ?? draftPath
	}
	const dmsLogo = dmsLogos?.[slot]?.[mode]
	return state.baseline?.logos[slot]?.[mode] ? dmsLogo : (state.initialHostLogos?.[slot]?.[mode] ?? dmsLogo)
}

function toBase64(buffer: ArrayBuffer): string {
	let binary = ''
	for (const byte of new Uint8Array(buffer)) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary)
}

export function trimmedVariables(variables: ThemeVariableSets): ThemeVariableSets {
	const trim = (values: ThemeVariables): ThemeVariables =>
		Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value.trim()]))
	return { shared: trim(variables.shared), light: trim(variables.light), dark: trim(variables.dark) }
}

/**
 * Three-way merge: each key the draft changed from `from`, set or removed, is
 * applied on top of `onto`; the others keep `onto`'s value.
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
	const variables = createEmptyVariableSets()
	for (const setName of VARIABLE_SET_NAMES) {
		variables[setName] = rebaseValues(
			draft.variables[setName],
			from.variables[setName],
			onto.variables[setName],
		) as ThemeVariables
	}
	return { variables, colors: rebaseValues(draft.colors, from.colors, onto.colors), logos }
}

/**
 * How many changes the bar counts between the draft and the saved theme: each
 * value set, changed or removed, and each logo picked or reset, per mode.
 * Values are compared key by key, so a value cleared then typed again is no
 * change. `dirty` is this count, so the bar and the leave guard always agree.
 */
export function themeChangeCount(state: Pick<ThemeEditorState, 'draft' | 'baseline' | 'pendingLogos'>): number {
	const { draft, baseline } = state
	if (!draft || !baseline) {
		return 0
	}
	const countDifferences = (next: Partial<Record<string, string>>, saved: Partial<Record<string, string>>): number =>
		[...new Set([...Object.keys(next), ...Object.keys(saved)])].filter((key) => next[key] !== saved[key]).length
	const variableChanges = VARIABLE_SET_NAMES.reduce(
		(count, setName) => count + countDifferences(draft.variables[setName], baseline.variables[setName]),
		0,
	)
	const slots = new Set<LogoSlot>([
		...THEME_LOGO_SLOTS.map(({ slot }) => slot),
		...(Object.keys(draft.logos) as LogoSlot[]),
		...(Object.keys(baseline.logos) as LogoSlot[]),
	])
	const logoChanges = [...slots].reduce(
		(count, slot) =>
			count +
			THEME_MODES.filter(
				(mode) =>
					state.pendingLogos[logoKey(slot, mode)] !== undefined ||
					draft.logos[slot]?.[mode] !== baseline.logos[slot]?.[mode],
			).length,
		0,
	)
	return variableChanges + countDifferences(draft.colors, baseline.colors) + logoChanges
}

/**
 * Move a step taken while a save was in flight onto the theme the save wrote:
 * its changes since `sent` go on top of `saved`; logos that were sent leave its
 * pending ones; a logo it removed after they were sent is removed from the
 * draft too.
 */
export function rebaseOnSave(step: ThemeSnapshot, sent: ThemeSnapshot, saved: ThemeDraft): ThemeSnapshot {
	const draft = rebaseTheme(step.draft, sent.draft, saved)
	const pendingLogos: Record<string, PendingLogo> = {}
	for (const [key, entry] of Object.entries(step.pendingLogos)) {
		if (sent.pendingLogos[key]?.upload.base64Content !== entry.upload.base64Content) {
			pendingLogos[key] = entry
		}
	}
	for (const key of Object.keys(sent.pendingLogos)) {
		const parsedKey = parseLogoKey(key)
		if (
			parsedKey &&
			!(key in step.pendingLogos) &&
			step.draft.logos[parsedKey.slot]?.[parsedKey.mode] === undefined
		) {
			dropLogo(draft.logos, parsedKey.slot, parsedKey.mode)
		}
	}
	return { draft, pendingLogos, seq: step.seq }
}

function draftOf(structure: ThemeStructure): ThemeDraft {
	return cloneTheme({ variables: structure.variables, colors: structure.colors, logos: structure.logos })
}

/**
 * The email slot takes PNG or JPEG only, as mail clients show nothing else, so
 * other files are rasterized to PNG first.
 */
export function canSendAsIs(slot: LogoSlot, file: Pick<File, 'type' | 'name'>): boolean {
	return slot !== 'email' || isMailable(file)
}

async function fileForSlot(slot: LogoSlot, file: File): Promise<File | undefined> {
	return canSendAsIs(slot, file) ? file : rasterizeForEmail(file)
}

/** undefined when the stored entry is malformed. */
function storedLogoFileName(logo: StoredLogo | undefined): string | undefined {
	return typeof logo?.fileName === 'string' && typeof logo.contentType === 'string' ? logo.fileName : undefined
}

/**
 * Pending logos rebuilt from a stored draft's logos and their stored files,
 * previewed through data URLs. Unknown keys and missing files are skipped.
 */
export function restorePendingLogos(
	storedLogos: StoredThemeDraft['pendingLogos'],
	logoFiles: Record<string, string>,
): Record<string, PendingLogo> {
	const pendingLogos: Record<string, PendingLogo> = {}
	for (const [key, storedLogo] of Object.entries(storedLogos)) {
		const parsedKey = parseLogoKey(key)
		const fileName = storedLogoFileName(storedLogo)
		const base64Content = fileName ? logoFiles[fileName] : undefined
		if (parsedKey && fileName && base64Content) {
			pendingLogos[key] = {
				upload: { ...parsedKey, contentType: storedLogo.contentType, base64Content },
				previewUrl: `data:${storedLogo.contentType};base64,${base64Content}`,
				storedFileName: fileName,
			}
		}
	}
	return pendingLogos
}

export interface ThemeEditor {
	state: Ref<ThemeEditorState>
	dirty: ComputedRef<boolean>
	changeCount: ComputedRef<number>
	canUndo: ComputedRef<boolean>
	canRedo: ComputedRef<boolean>
	/** Empty with a DMS older than 0.9. */
	dmsBrandingDefaults: ComputedRef<DmsDefaults>
	load: (force?: boolean) => Promise<void>
	setVariable: (setName: VariableSetName, name: string, value: string) => void
	/** Set several variables of one set as one undo step; `undefined` removes one. */
	setVariables: (setName: VariableSetName, values: Record<string, string | undefined>) => void
	/** Remove a variable from every set, so the DMS default applies. */
	resetVariable: (name: string) => void
	setColor: (role: ThemeColorRole, palette: string | undefined) => void
	/** Put a file in slots for one mode; resolves to an error message when refused or partly failed. */
	pickLogo: (slots: LogoSlot[], mode: ThemeMode, file: File) => Promise<string | undefined>
	/** Reset slots in one mode: to `sourceSlot`'s logo when given and set, else to the DMS's. */
	resetLogo: (slots: LogoSlot[], mode: ThemeMode, sourceSlot?: LogoSlot) => void
	setPreviewMode: (mode: ThemeMode | null) => void
	undo: () => void
	redo: () => void
	discard: () => void
	save: () => Promise<OpResult<{ version: string }> | undefined>
	/** Read the theme's files again after they changed on disk, keeping the author's changes on top. */
	refresh: () => Promise<void>
	createLayer: () => Promise<OpResult<ThemeLayer>>
	/** Re-read the DMS tokens and pin the builder's own UI to them. */
	isolateChrome: () => void
	/** Store the unsaved theme, logo files included; resolves to whether everything was stored. */
	storeOnDevice: () => Promise<boolean>
	forgetOnDevice: () => void
	/** Re-apply the draft stored on this device, if any, on top of the current theme. */
	restoreKept: () => Promise<void>
	clear: () => void
}

export function useThemeEditor(): ThemeEditor {
	const state = useDmsState<ThemeEditorState>(THEME_STATE_KEY, emptyThemeState)
	const api = useBuilderApi()

	const changeCount = computed(() => themeChangeCount(state.value))
	const dirty = computed(() => changeCount.value > 0)
	const canUndo = computed(() => state.value.history.length > 0)
	const canRedo = computed(() => state.value.future.length > 0)
	const dmsBrandingDefaults = computed<DmsDefaults>(() => readDmsBrandingDefaults())

	function logoPatch(logoFor: (slot: LogoSlot, mode: ThemeMode) => string | undefined): LogoPatch {
		return Object.fromEntries(
			THEME_LOGO_SLOTS.map(({ slot }) => [slot, Object.fromEntries(THEME_MODES.map((mode) => [mode, logoFor(slot, mode)]))]),
		)
	}

	function previewLogos(): void {
		showHostLogos(logoPatch((slot, mode) => previewLogo(state.value, slot, mode, dmsBrandingDefaults.value.logo)))
	}

	/**
	 * Preview the draft as overrides of `saved`, the theme the page's
	 * stylesheet holds: the baseline, except right after a save.
	 */
	function preview(saved: ThemeDraft | null = state.value.baseline): void {
		const { draft } = state.value
		if (!draft || !saved) {
			return
		}
		declareCatalogFonts()
		writePreview({
			draft,
			saved,
			dmsColors: dmsBrandingDefaults.value.colors,
			isValid: (name, value) => !variableProblem(name, value),
		})
		previewLogos()
	}

	function isolateChromeWithDmsColors(): void {
		isolateChrome(dmsBrandingDefaults.value.colors)
	}

	function revokeUnusedLogoUrls(): void {
		const usedUrls = new Set(
			[state.value, ...state.value.history, ...state.value.future].flatMap((step) =>
				Object.values(step.pendingLogos).map((entry) => entry.previewUrl),
			),
		)
		for (const url of logoObjectUrls) {
			if (!usedUrls.has(url)) {
				URL.revokeObjectURL(url)
				logoObjectUrls.delete(url)
			}
		}
	}

	/**
	 * Read the theme once: a second call during a read (the workspace and its
	 * panel both call it as it opens) waits for that read instead of reading
	 * again over an edit made meanwhile.
	 */
	async function load(force = false): Promise<void> {
		if (state.value.draft && !force) {
			return
		}
		if (inFlightRead && !force) {
			return inFlightRead
		}
		const currentRead = readTheme(++latestReadId)
		inFlightRead = currentRead
		try {
			await currentRead
		} finally {
			if (inFlightRead === currentRead) {
				inFlightRead = undefined
			}
		}
	}

	async function readTheme(readId: number): Promise<void> {
		state.value.loading = true
		try {
			const result = await api.theme()
			// Drop the result if a newer read started or the editor closed.
			if (readId !== latestReadId) {
				return
			}
			if (!result.ok) {
				state.value.missingLayerPath = result.error.code === 'not_found' ? result.error.ref : null
				state.value.readError = result.error
				return
			}
			state.value.structure = result.data
			state.value.draft = draftOf(result.data)
			state.value.baseline = draftOf(result.data)
			state.value.initialHostLogos ??= JSON.parse(JSON.stringify(hostLogos())) as ThemeLogos
			state.value.readError = null
			state.value.missingLayerPath = null
			state.value.createdLayer = null
			preview()
		} finally {
			state.value.loading = false
		}
	}

	/**
	 * The draft and pending logos as an undo step. The draft is not copied:
	 * every edit replaces it instead of mutating it.
	 */
	function snapshot(): ThemeSnapshot | undefined {
		const { draft, pendingLogos } = state.value
		return draft ? { draft, pendingLogos: { ...pendingLogos }, seq: ++lastSnapshotSeq } : undefined
	}

	/**
	 * Apply an edit as one undo step, or as part of the previous one when it has
	 * the same group within `UNDO_GROUP_MS`: typing a color is one step.
	 * `nextPendingLogos` replaces the pending logos. An edit that changes
	 * nothing adds no step, as on the page: Undo would have nothing to undo.
	 */
	function edit(
		apply: (draft: ThemeDraft) => void,
		group: string | null = null,
		nextPendingLogos?: Record<string, PendingLogo>,
	): void {
		const before = snapshot()
		if (!before) {
			return
		}
		const next = cloneTheme(before.draft)
		apply(next)
		if (
			JSON.stringify(next) === JSON.stringify(before.draft) &&
			samePendingLogos(nextPendingLogos ?? before.pendingLogos, before.pendingLogos)
		) {
			return
		}
		lastEdit = recordEdit(state.value, () => before, group, lastEdit)
		state.value.draft = next
		if (nextPendingLogos) {
			for (const entry of Object.values(nextPendingLogos)) {
				if (entry.previewUrl.startsWith('blob:')) {
					logoObjectUrls.add(entry.previewUrl)
				}
			}
			state.value.pendingLogos = nextPendingLogos
		}
		preview()
		revokeUnusedLogoUrls()
		syncDeviceCopy()
	}

	function applyStep(step: ThemeSnapshot | undefined): void {
		if (!step) {
			return
		}
		state.value.draft = step.draft
		state.value.pendingLogos = step.pendingLogos
		lastEdit = NO_EDIT
		preview()
		syncDeviceCopy()
	}

	function undo(): void {
		const current = snapshot()
		applyStep(current && stepBack(state.value, current))
	}

	function redo(): void {
		const current = snapshot()
		applyStep(current && stepForward(state.value, current))
	}

	/**
	 * Set a value as it is typed, spaces and all: trimming it here would take
	 * the space away from under the caret. The save sends it trimmed.
	 */
	function setVariable(setName: VariableSetName, name: string, value: string): void {
		edit((draft) => {
			if (value.trim() === '') {
				delete draft.variables[setName][name]
				return
			}
			draft.variables[setName][name] = value
		}, `variable:${setName}:${name}`)
	}

	function setVariables(setName: VariableSetName, values: Record<string, string | undefined>): void {
		edit((draft) => {
			for (const [name, value] of Object.entries(values)) {
				if (value === undefined) {
					delete draft.variables[setName][name]
				} else {
					draft.variables[setName][name] = value
				}
			}
		})
	}

	function resetVariable(name: string): void {
		edit((draft) => {
			for (const setName of VARIABLE_SET_NAMES) {
				delete draft.variables[setName][name]
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

	async function pendingLogoFor(slot: LogoSlot, mode: ThemeMode, file: File): Promise<PendingLogo | undefined> {
		const fileToSend = await fileForSlot(slot, file)
		const contentType = fileToSend ? logoContentType(fileToSend) : undefined
		if (!fileToSend || !contentType) {
			return undefined
		}
		const base64Content = toBase64(await fileToSend.arrayBuffer())
		return {
			upload: { slot, mode, contentType, base64Content },
			previewUrl: URL.createObjectURL(fileToSend),
			storedFileName: logoFileName(base64Content),
		}
	}

	async function pickLogo(slots: LogoSlot[], mode: ThemeMode, file: File): Promise<string | undefined> {
		const refusal = logoRefusal(file)
		if (refusal) {
			return refusal
		}
		const pickedLogos = await Promise.all(slots.map((slot) => pendingLogoFor(slot, mode, file)))
		const missedSlots = slots.filter((_, index) => !pickedLogos[index])
		if (!state.value.draft) {
			// Closed while the file was read: nothing shows these.
			pickedLogos.forEach((entry) => entry && URL.revokeObjectURL(entry.previewUrl))
			return undefined
		}
		const nextPendingLogos = { ...state.value.pendingLogos }
		const placedSlots = slots.filter((slot, index) => {
			const entry = pickedLogos[index]
			if (entry) {
				nextPendingLogos[logoKey(slot, mode)] = entry
			}
			return entry !== undefined
		})
		edit(
			(draft) => {
				for (const slot of placedSlots) {
					dropLogo(draft.logos, slot, mode)
				}
			},
			null,
			nextPendingLogos,
		)
		return missedSlots.length
			? `The ${missedSlots.join(' and ')} logo could not be made from this file: the browser could not draw it.`
			: undefined
	}

	function resetLogo(slots: LogoSlot[], mode: ThemeMode, sourceSlot?: LogoSlot): void {
		const sourcePendingLogo = sourceSlot ? state.value.pendingLogos[logoKey(sourceSlot, mode)] : undefined
		const nextPendingLogos = { ...state.value.pendingLogos }
		for (const slot of slots) {
			delete nextPendingLogos[logoKey(slot, mode)]
			if (sourcePendingLogo) {
				nextPendingLogos[logoKey(slot, mode)] = { ...sourcePendingLogo, upload: { ...sourcePendingLogo.upload, slot } }
			}
		}
		edit(
			(draft) => {
				const sourcePath = sourceSlot ? draft.logos[sourceSlot]?.[mode] : undefined
				for (const slot of slots) {
					if (sourcePath && !sourcePendingLogo) {
						draft.logos[slot] = { ...draft.logos[slot], [mode]: sourcePath }
					} else {
						dropLogo(draft.logos, slot, mode)
					}
				}
			},
			null,
			nextPendingLogos,
		)
	}

	function setPreviewMode(mode: ThemeMode | null): void {
		state.value.previewMode = mode
		showPageIn(mode)
	}

	/**
	 * The saved theme's logo, else the DMS's, else the initial host logo. A save
	 * updates the baseline, so leaving after one keeps the new logos.
	 */
	function logoWithoutPreview(slot: LogoSlot, mode: ThemeMode): string | undefined {
		return (
			state.value.baseline?.logos[slot]?.[mode] ??
			dmsBrandingDefaults.value.logo?.[slot]?.[mode] ??
			state.value.initialHostLogos?.[slot]?.[mode]
		)
	}

	function showLogosWithoutPreview(): void {
		showHostLogos(logoPatch(logoWithoutPreview))
	}

	function discard(): void {
		const before = snapshot()
		if (!state.value.baseline || !before) {
			return
		}
		pushStep(state.value, before)
		state.value.pendingLogos = {}
		state.value.draft = cloneTheme(state.value.baseline)
		state.value.restoredDraft = null
		showLogosWithoutPreview()
		preview()
		revokeUnusedLogoUrls()
		syncDeviceCopy()
	}

	async function save(): Promise<OpResult<{ version: string }> | undefined> {
		const sent = snapshot()
		const version = state.value.structure?.version
		if (!sent || !dirty.value) {
			return undefined
		}
		const issues = themeIssues(sent.draft)
		if (issues.length > 0) {
			return { ok: false, error: { code: 'invalid_config', issues } }
		}
		const { variables, colors, logos } = sent.draft
		const result = await api.saveTheme({
			draft: {
				variables: trimmedVariables(variables),
				colors,
				logos,
				uploads: Object.values(sent.pendingLogos).map((entry) => entry.upload),
			},
			expectedVersion: version,
		})
		if (result.ok) {
			await readSaved(sent)
		}
		return result
	}

	/**
	 * Read the theme back after a save. The save runs a typecheck and can take
	 * seconds while the editor stays open: what the author did since it was
	 * sent (an edit, a logo picked, an undo) stays on top of what it wrote,
	 * still undoable. Undo steps from before the save are dropped, as the
	 * page's are.
	 */
	async function readSaved(sent: ThemeSnapshot): Promise<void> {
		const readId = ++latestReadId
		const result = await api.theme()
		if (readId !== latestReadId) {
			return
		}
		if (!result.ok) {
			state.value.readError = result.error
			return
		}
		const saved = draftOf(result.data)
		const rebaseStep = (step: ThemeSnapshot): ThemeSnapshot => rebaseOnSave(step, sent, saved)
		const isAfterSave = (step: ThemeSnapshot): boolean => step.seq > sent.seq
		const current = snapshot()
		const previousBaseline = state.value.baseline
		state.value.structure = result.data
		state.value.baseline = saved
		state.value.history = state.value.history.filter(isAfterSave).map(rebaseStep)
		state.value.future = state.value.future.filter(isAfterSave).map(rebaseStep)
		if (current) {
			const rebasedCurrent = rebaseStep(current)
			state.value.draft = rebasedCurrent.draft
			state.value.pendingLogos = rebasedCurrent.pendingLogos
		}
		state.value.restoredDraft = null
		lastEdit = NO_EDIT
		// Preview against the theme from before the save: the dev server swaps
		// in the new stylesheet a moment after the response, and until then the
		// page still has the old one. Against the new files, the preview would
		// drop what was just saved and show the old values meanwhile; the next
		// edit previews against the new files.
		preview(previousBaseline)
		revokeUnusedLogoUrls()
		syncDeviceCopy()
	}

	/**
	 * Read the theme again after its files changed on disk: they become the
	 * baseline and the author's changes stay on top, so Save knowingly writes
	 * over them and Discard keeps them.
	 */
	async function refresh(): Promise<void> {
		const readId = ++latestReadId
		const result = await api.theme()
		if (readId !== latestReadId) {
			return
		}
		if (!result.ok) {
			state.value.readError = result.error
			return
		}
		const { draft, baseline } = state.value
		const onDisk = draftOf(result.data)
		state.value.structure = result.data
		state.value.baseline = onDisk
		state.value.draft = draft && baseline ? rebaseTheme(draft, baseline, onDisk) : cloneTheme(onDisk)
		preview()
		syncDeviceCopy()
	}

	async function createLayer(): Promise<OpResult<ThemeLayer>> {
		state.value.creatingLayer = true
		try {
			const result = await api.createThemeLayer()
			if (result.ok) {
				state.value.createdLayer = result.data
				state.value.missingLayerPath = null
				state.value.readError = null
			}
			return result
		} finally {
			state.value.creatingLayer = false
		}
	}

	/**
	 * Store the unsaved theme on this device: the draft, its baseline, and each
	 * pending logo's file once. Stored files no current pending logo names are
	 * deleted, even if an undo step still names them. Resolves to whether
	 * everything was stored.
	 */
	async function storeOnDevice(): Promise<boolean> {
		const { draft, baseline, structure, pendingLogos } = state.value
		if (!draft || !baseline) {
			return true
		}
		const storedLogos: Record<string, StoredLogo> = {}
		const logoFiles = new Map<string, string>()
		for (const [key, entry] of Object.entries(pendingLogos)) {
			storedLogos[key] = { fileName: entry.storedFileName, contentType: entry.upload.contentType }
			logoFiles.set(entry.storedFileName, entry.upload.base64Content)
		}
		const draftStored = storeThemeDraft({
			draft,
			baseline,
			version: structure?.version ?? null,
			pendingLogos: storedLogos,
			at: Date.now(),
		})
		forgetLogoFilesExcept(new Set(logoFiles.keys()))
		const fileWrites = await Promise.all(
			[...logoFiles].map(([fileName, base64Content]) => storeLogoFile(fileName, base64Content)),
		)
		return draftStored && fileWrites.every(Boolean)
	}

	/**
	 * Store the theme on this device while it has changes and forget it once it
	 * has none, as the page's draft is, so a reload or a closed tab loses none of
	 * it. Every change rewrites the draft, which is small; a logo file is written
	 * only the first time the draft names it. A failure is silent here: the
	 * leave dialog stores again and reports it.
	 */
	function syncDeviceCopy(): void {
		if (!state.value.draft) {
			return
		}
		if (dirty.value) {
			void storeOnDevice()
		} else {
			forgetThemeDraft()
		}
	}

	function forgetOnDevice(): void {
		forgetThemeDraft()
	}

	/**
	 * Apply a stored draft as one undoable edit, rebased on the current theme so
	 * files saved since stay. If the theme cannot be read, the draft stays
	 * stored for the next opening.
	 */
	async function applyStoredDraft(stored: StoredThemeDraft): Promise<void> {
		const fileNames = Object.values(stored.pendingLogos).flatMap((logo) => storedLogoFileName(logo) ?? [])
		const [logoFiles] = await Promise.all([storedLogoFiles(fileNames), load()])
		if (!state.value.draft) {
			return
		}
		edit(
			(draft) => Object.assign(draft, rebaseTheme(stored.draft, stored.baseline, draft)),
			null,
			{ ...state.value.pendingLogos, ...restorePendingLogos(stored.pendingLogos, logoFiles) },
		)
		state.value.restoredDraft = { at: stored.at, stale: stored.version !== (state.value.structure?.version ?? null) }
	}

	function restoreKept(): Promise<void> {
		const stored = storedThemeDraft()
		if (!stored) {
			return Promise.resolve()
		}
		inFlightRestore ??= applyStoredDraft(stored).finally(() => {
			inFlightRestore = undefined
		})
		return inFlightRestore
	}

	/**
	 * Remove the preview and reset the editor. The draft stored on this device
	 * is already in sync and stays as it is. Only a loaded theme has put logos
	 * and a preview on the page.
	 */
	function clear(): void {
		if (state.value.draft) {
			showLogosWithoutPreview()
			removePreview()
		}
		for (const url of logoObjectUrls) {
			URL.revokeObjectURL(url)
		}
		logoObjectUrls.clear()
		showPageIn(null)
		releaseChrome()
		forgetCatalogFonts()
		lastEdit = NO_EDIT
		// Drop the result of any read in flight.
		latestReadId += 1
		inFlightRead = undefined
		state.value = emptyThemeState()
	}

	return {
		state,
		dirty,
		changeCount,
		canUndo,
		canRedo,
		dmsBrandingDefaults,
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
		isolateChrome: isolateChromeWithDmsColors,
		storeOnDevice,
		forgetOnDevice,
		restoreKept,
		clear,
	}
}

export { SQUARE_LOGO_SLOTS, WIDE_LOGO_SLOTS }

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { describeError } from '../runtime/errors'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import { THEME_MODES, useThemeEditor } from '../runtime/theme'
import {
	catalogEntry,
	catalogNames,
	FONT_VARIABLE,
	isVariableName,
	THEME_COLOR_ROLES,
	THEME_MODE_OPTIONS,
	THEME_VARIABLE_GROUPS,
	dmsTones,
	uncatalogedVariableNames,
	type DmsTone,
	type ThemeVariableEntry,
} from '../runtime/theme-catalog'
import { DARK_CLASS } from '../runtime/theme-mirror'
import { affectsDmsDefaults, dmsDefaults, viewerMode } from '../runtime/theme-preview'
import type { ThemeMode, ThemeVariables } from '../runtime/types'

const editor = useThemeEditor()
const state = editor.state
const builder = useBuilder()
const { advanced } = useBuilderMode()
// Auto-imported from the host's own layer: the DMS's confirmation dialog.
const { confirm } = useConfirm()

/**
 * How long the stylesheets have to stay still before the DMS defaults are read
 * again: the dev server swaps several in a row when a layer changes.
 */
const DEFAULTS_SETTLE_MS = 250

/** Read from the page's dark class, whether the viewer or the preview set it. */
const pageMode = ref<ThemeMode>('light')
const dmsDefaultValues = ref<Record<ThemeMode, ThemeVariables>>({ light: {}, dark: {} })
const addedVariableNames = ref<string[]>([])
const newName = ref('')
const addRefusal = ref<string | null>(null)
/** The row open, one at a time: a color's or the font's, by its variable. */
const openRowName = ref<string | null>(null)
let observers: MutationObserver[] = []
let readDefaultsTimer: ReturnType<typeof setTimeout> | undefined

const groups = computed(() =>
	advanced.value
		? THEME_VARIABLE_GROUPS
		: THEME_VARIABLE_GROUPS.map((group) => ({
				...group,
				variables: group.variables.filter((entry) => entry.inSimpleMode),
			})).filter((group) => group.variables.length > 0),
)
const roles = computed(() =>
	advanced.value ? THEME_COLOR_ROLES : THEME_COLOR_ROLES.filter((entry) => entry.role === 'primary'),
)

const themedVariableNames = computed(() =>
	(['shared', ...THEME_MODES] as const).flatMap((setName) => [
		...Object.keys(state.value.draft?.variables[setName] ?? {}),
		...Object.keys(state.value.baseline?.variables[setName] ?? {}),
	]),
)
const otherVariableNames = computed(() => uncatalogedVariableNames([...addedVariableNames.value, ...themedVariableNames.value]))
const variableNames = computed(() => [...catalogNames(), ...otherVariableNames.value])
/** Joined so the watch fires only when a name is added or removed, not on every draft edit. */
const variableNamesKey = computed(() => variableNames.value.join(' '))

const missingLayerFolder = computed(() => `${state.value.missingLayerPath?.split(/[\\/]/).pop() ?? 'frontend-vue'}/`)

const themeFilePaths = computed(() => {
	const structure = state.value.structure
	return structure
		? [structure.files.stylesheetPath, structure.files.appConfigPath, `${structure.files.assetsDirectory}/`]
		: []
})

function readPageMode(): void {
	pageMode.value = document.documentElement.classList.contains(DARK_CLASS) ? 'dark' : 'light'
}

/** The theme's own stylesheets are left out, so only another stylesheet or a list change needs a re-read. */
function readDefaults(): void {
	dmsDefaultValues.value = dmsDefaults(variableNames.value, editor.dmsBrandingDefaults.value.colors)
}

/** Debounced; ignores the preview and the theme's own stylesheets (see affectsDmsDefaults). */
function scheduleDefaultsRead(records: MutationRecord[]): void {
	if (!affectsDmsDefaults(records)) {
		return
	}
	clearTimeout(readDefaultsTimer)
	readDefaultsTimer = setTimeout(readDefaults, DEFAULTS_SETTLE_MS)
}

function dmsDefaultsOf(name: string): Partial<Record<ThemeMode, string>> {
	return { light: dmsDefaultValues.value.light[name], dark: dmsDefaultValues.value.dark[name] }
}

/** Every group's DMS colors, the simple mode's rows offering those of the whole group. */
const dmsTonesByGroup = computed(
	() => new Map(THEME_VARIABLE_GROUPS.map((group) => [group.id, dmsTones(group, dmsDefaultValues.value)])),
)

function dmsTonesOf(groupId: string): Record<ThemeMode, DmsTone[]> {
	return dmsTonesByGroup.value.get(groupId) ?? { light: [], dark: [] }
}

/** A color set per mode is a row of its own; anything else is typed. */
function isColorRow(entry: ThemeVariableEntry): boolean {
	return entry.kind === 'color' && entry.scope === 'modes'
}

function toggleRow(name: string): void {
	openRowName.value = openRowName.value === name ? null : name
}

/** Watch the page's mode, and the stylesheets the DMS defaults are read from. */
function watchPage(): MutationObserver[] {
	const modeObserver = new MutationObserver(readPageMode)
	modeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
	const stylesObserver = new MutationObserver(scheduleDefaultsRead)
	stylesObserver.observe(document.head, { childList: true, subtree: true, characterData: true })
	return [modeObserver, stylesObserver]
}

/** Picking the viewer's own mode clears the override, so the page follows the viewer again. */
function showMode(mode: string | number): void {
	editor.setPreviewMode(mode === viewerMode() ? null : (mode as ThemeMode))
}

function duplicateNameRefusal(name: string): string | undefined {
	const entry = catalogEntry(name)
	if (entry) {
		return `${name} is already in the list, as ${entry.label}.`
	}
	return otherVariableNames.value.includes(name) ? `${name} is already in the list.` : undefined
}

function addVariable(): void {
	const name = newName.value.trim()
	if (!isVariableName(name)) {
		return
	}
	const refusal = duplicateNameRefusal(name)
	if (refusal) {
		addRefusal.value = refusal
		return
	}
	addedVariableNames.value = [...addedVariableNames.value, name]
	newName.value = ''
}

function removeAdded(name: string): void {
	addedVariableNames.value = addedVariableNames.value.filter((entry) => entry !== name)
}

async function createLayer(): Promise<void> {
	const confirmed = await confirm({
		title: 'Give the project a frontend layer?',
		description: `The builder creates ${missingLayerFolder.value} beside the project's sources, with an entry, and registers it from the project's start(), above the DMS. The backend reloads with it; the frontend dev server serves it once restarted.`,
		confirmLabel: 'Create the layer',
		cancelLabel: 'Not now',
	})
	if (!confirmed) {
		return
	}
	const result = await editor.createLayer()
	if (!result.ok) {
		builder.session.value.error = result.error
		return
	}
	builder.notify(`${result.data.name} created`)
}

watch(newName, () => {
	addRefusal.value = null
})
watch(variableNamesKey, readDefaults)

onMounted(() => {
	observers = watchPage()
	readPageMode()
	readDefaults()
	void editor.load()
})

onUnmounted(() => {
	observers.forEach((observer) => observer.disconnect())
	clearTimeout(readDefaultsTimer)
})
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col">
		<header class="flex flex-col gap-2 border-b border-default px-4 py-3.5">
			<div class="flex items-center gap-2">
				<UIcon name="i-ph-palette-light" class="size-4 text-primary" />
				<p class="flex-1 text-sm font-semibold text-highlighted">Theme</p>
				<DmsSegmented
					:model-value="pageMode"
					:items="THEME_MODE_OPTIONS"
					size="xs"
					aria-label="Show the page in"
					@update:model-value="showMode($event)"
				/>
			</div>
			<p class="text-xs text-muted">
				One theme for the whole project. The page shows it as you go; the bar's Save
				writes it to the project's files, and it ships with the next deploy.
			</p>
		</header>

		<div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
			<div v-if="state.loading && !state.draft" class="flex justify-center py-8">
				<UIcon name="i-ph-circle-notch" class="size-6 animate-spin text-dimmed" />
			</div>

			<div
				v-else-if="state.createdLayer"
				class="flex flex-col gap-3 rounded-lg border border-default bg-default p-3.5"
			>
				<p class="text-sm font-semibold text-highlighted">The project's layer is ready</p>
				<p class="text-xs text-muted">
					<span class="font-mono">{{ state.createdLayer.name }}</span> is created and
					registered. Restart the frontend dev server (<span class="font-mono">ajs dms dev</span>)
					so it serves it, then read the theme again.
				</p>
				<UButton
					label="Read the theme again"
					icon="i-ph-arrow-clockwise-light"
					size="sm"
					class="self-start"
					@click="editor.load(true)"
				/>
			</div>

			<div
				v-else-if="state.missingLayerPath"
				class="flex flex-col gap-3 rounded-lg border border-default bg-default p-3.5"
			>
				<p class="text-sm font-semibold text-highlighted">The project has no frontend layer yet</p>
				<p class="text-xs text-muted">
					A theme is written to a frontend layer of the project's own, above the DMS. The
					builder can create one:
					<span class="font-mono" :title="state.missingLayerPath ?? undefined">{{ missingLayerFolder }}</span>,
					beside the project's sources.
				</p>
				<UButton
					label="Create the layer…"
					icon="i-ph-folder-plus-light"
					size="sm"
					class="self-start"
					:loading="state.creatingLayer"
					@click="createLayer"
				/>
			</div>

			<UAlert
				v-else-if="state.readError"
				color="warning"
				variant="subtle"
				icon="i-ph-warning-light"
				title="The theme cannot be edited here"
				:description="describeError(state.readError, null)"
			/>

			<template v-else-if="state.draft">
				<section class="flex flex-col gap-4">
					<DmsEyebrow>{{ advanced ? 'Palettes' : 'Accent' }}</DmsEyebrow>
					<DmsBuilderThemePalette
						v-for="entry in roles"
						:key="entry.role"
						:role="entry.role"
						:label="entry.label"
						:hint="entry.hint"
					/>
				</section>

				<section v-for="group in groups" :key="group.id" class="flex flex-col gap-3">
					<DmsEyebrow>{{ group.label }}</DmsEyebrow>
					<div v-if="group.variables.some(isColorRow)" class="flex flex-col gap-1.5">
						<DmsBuilderThemeColor
							v-for="entry in group.variables.filter(isColorRow)"
							:key="entry.name"
							:name="entry.name"
							:label="entry.label"
							:hint="entry.hint"
							:dms-default-values="dmsDefaultsOf(entry.name)"
							:dms-tones="dmsTonesOf(group.id)"
							:page-mode="pageMode"
							:expanded="openRowName === entry.name"
							@toggle="toggleRow(entry.name)"
							@show-mode="showMode"
						/>
					</div>
					<template v-for="entry in group.variables.filter((entry) => !isColorRow(entry))" :key="entry.name">
						<DmsBuilderThemeFont
							v-if="entry.name === FONT_VARIABLE"
							:expanded="openRowName === entry.name"
							:dms-default-value="dmsDefaultsOf(entry.name)[pageMode]"
							@toggle="toggleRow(entry.name)"
						/>
						<DmsBuilderThemeVariable
							v-else
							:name="entry.name"
							:label="entry.label"
							:hint="entry.hint"
							:scope="entry.scope"
							:dms-default-values="dmsDefaultsOf(entry.name)"
							:page-mode="pageMode"
						/>
					</template>
				</section>

				<section v-if="!advanced" class="flex flex-col gap-3">
					<DmsEyebrow>Shape and type</DmsEyebrow>
					<DmsBuilderThemeShape />
					<DmsBuilderThemeFont
						:expanded="openRowName === FONT_VARIABLE"
						:dms-default-value="dmsDefaultsOf(FONT_VARIABLE)[pageMode]"
						@toggle="toggleRow(FONT_VARIABLE)"
					/>
				</section>

				<section v-if="advanced" class="flex flex-col gap-3">
					<DmsEyebrow>Other variables</DmsEyebrow>
					<DmsBuilderThemeVariable
						v-for="name in otherVariableNames"
						:key="name"
						:name="name"
						scope="modes"
						:dms-default-values="dmsDefaultsOf(name)"
						:page-mode="pageMode"
						:removable="addedVariableNames.includes(name) && !themedVariableNames.includes(name)"
						@remove="removeAdded(name)"
					/>
					<form class="flex items-center gap-2" @submit.prevent="addVariable">
						<UInput
							v-model="newName"
							size="sm"
							class="flex-1"
							:ui="{ base: 'font-mono text-xs' }"
							placeholder="--any-custom-property"
							aria-label="Name of a CSS variable to override"
						/>
						<UButton
							type="submit"
							size="sm"
							color="neutral"
							variant="outline"
							icon="i-ph-plus-light"
							label="Add"
							:disabled="!isVariableName(newName.trim())"
						/>
					</form>
					<p v-if="addRefusal" class="text-xs text-warning" role="status">{{ addRefusal }}</p>
				</section>

				<section class="flex flex-col gap-3">
					<DmsEyebrow>Logos</DmsEyebrow>
					<DmsBuilderThemeLogos />
				</section>

				<section
					v-if="advanced"
					class="flex flex-col gap-1.5 rounded-md border border-default bg-elevated/50 p-3"
				>
					<p class="text-xs font-medium text-highlighted">
						Written to {{ state.structure?.layer.name }} by the bar's Save
					</p>
					<ul class="flex flex-col gap-0.5 font-mono text-[11px] text-muted">
						<li v-for="path in themeFilePaths" :key="path">{{ path }}</li>
					</ul>
					<p v-if="!state.structure?.stylesheetImported" class="text-[11px] text-dimmed">
						The first save also imports the stylesheet from the layer's entry, which reloads
						the page once.
					</p>
				</section>
			</template>
		</div>
	</div>
</template>

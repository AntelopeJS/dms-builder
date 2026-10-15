<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { describeError } from '../runtime/errors'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import { THEME_MODES, useThemeEditor } from '../runtime/theme'
import {
	catalogEntry,
	catalogNames,
	isVariableName,
	otherVariables,
	THEME_COLOR_ROLES,
	THEME_MODE_ENTRIES,
	THEME_VARIABLE_GROUPS,
} from '../runtime/theme-catalog'
import { DARK_CLASS, ModeMirror } from '../runtime/theme-mirror'
import { chosenMode } from '../runtime/theme-preview'
import type { ThemeMode, ThemeVariables } from '../runtime/types'

const editor = useThemeEditor()
const state = editor.state
const builder = useBuilder()
const { advanced } = useBuilderMode()
// Auto-imported from the host's own layer: the DMS's confirmation dialog.
const { confirm } = useConfirm()

/** The mode the page shows now, whichever way it came to. */
const pageMode = ref<ThemeMode>('light')
const observed = ref<Record<ThemeMode, ThemeVariables>>({ light: {}, dark: {} })
const added = ref<string[]>([])
const newName = ref('')
/** Why the name typed was not added, said until it changes. */
const addRefusal = ref<string | null>(null)
let mirror: ModeMirror | undefined
let observers: MutationObserver[] = []
let pendingFrame = 0

/** The groups of variables on screen: the simple mode keeps the backgrounds it names. */
const groups = computed(() =>
	advanced.value
		? THEME_VARIABLE_GROUPS
		: THEME_VARIABLE_GROUPS.map((group) => ({
				...group,
				variables: group.variables.filter((entry) => entry.simple),
			})).filter((group) => group.variables.length > 0),
)
const roles = computed(() =>
	advanced.value ? THEME_COLOR_ROLES : THEME_COLOR_ROLES.filter((entry) => entry.role === 'primary'),
)

const themed = computed(() =>
	(['shared', ...THEME_MODES] as const).flatMap((set) => [
		...Object.keys(state.value.draft?.variables[set] ?? {}),
		...Object.keys(state.value.baseline?.variables[set] ?? {}),
	]),
)
const others = computed(() => otherVariables([...added.value, ...themed.value]))
const variableNames = computed(() => [...catalogNames(), ...others.value])

/** Where the layer would go, as the project names it: the folder beside its sources. */
const missingFolder = computed(() => `${state.value.missingLayer?.split(/[\\/]/).pop() ?? 'frontend-vue'}/`)

const files = computed(() => {
	const structure = state.value.structure
	return structure
		? [structure.files.stylesheet, structure.files.appConfig, `${structure.files.assets}/`]
		: []
})

function readPageMode(): void {
	pageMode.value = document.documentElement.classList.contains(DARK_CLASS) ? 'dark' : 'light'
}

/** Read what each variable shows in each mode, whichever one the page shows. */
function observe(): void {
	readPageMode()
	if (mirror) {
		observed.value = mirror.read(variableNames.value)
	}
}

/**
 * One read of the variables per frame, however many edits, class changes and
 * stylesheet swaps asked. The page's mode is read at once: it is cheap, and
 * the mode switch shows it.
 */
function scheduleObserve(): void {
	readPageMode()
	if (pendingFrame) {
		return
	}
	pendingFrame = requestAnimationFrame(() => {
		pendingFrame = 0
		observe()
	})
}

function valuesOf(name: string): Partial<Record<ThemeMode, string>> {
	return { light: observed.value.light[name], dark: observed.value.dark[name] }
}

/** Watch what changes what the variables compute to: the mode, and the stylesheets. */
function watchPage(): MutationObserver[] {
	const mode = new MutationObserver(scheduleObserve)
	mode.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
	const styles = new MutationObserver(scheduleObserve)
	styles.observe(document.head, { childList: true, subtree: true, characterData: true })
	return [mode, styles]
}

/** Show the page in a mode for the preview; the viewer's own mode lets it follow them again. */
function showMode(mode: string | number): void {
	editor.setPreviewMode(mode === chosenMode() ? null : (mode as ThemeMode))
}

/** Why a name cannot join the list: the catalog or the list already has it. */
function listedAs(name: string): string | undefined {
	const entry = catalogEntry(name)
	if (entry) {
		return `${name} is already in the list, as ${entry.label}.`
	}
	return others.value.includes(name) ? `${name} is already in the list.` : undefined
}

function addVariable(): void {
	const name = newName.value.trim()
	if (!isVariableName(name)) {
		return
	}
	const listed = listedAs(name)
	if (listed) {
		addRefusal.value = listed
		return
	}
	added.value = [...added.value, name]
	newName.value = ''
}

function removeAdded(name: string): void {
	added.value = added.value.filter((entry) => entry !== name)
}

async function createLayer(): Promise<void> {
	const asked = await confirm({
		title: 'Give the project a frontend layer?',
		description: `The builder creates ${missingFolder.value} beside the project's sources, with an entry, and registers it from the project's start(), above the DMS. The backend reloads with it; the frontend dev server serves it once restarted.`,
		confirmLabel: 'Create the layer',
		cancelLabel: 'Not now',
	})
	if (!asked) {
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
watch(() => state.value.draft, scheduleObserve, { deep: true, flush: 'post' })
watch(variableNames, scheduleObserve, { flush: 'post' })

onMounted(() => {
	mirror = new ModeMirror()
	observers = watchPage()
	void editor.load().then(scheduleObserve)
	scheduleObserve()
})

onUnmounted(() => {
	observers.forEach((observer) => observer.disconnect())
	cancelAnimationFrame(pendingFrame)
	pendingFrame = 0
	mirror?.dispose()
	mirror = undefined
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
					:items="THEME_MODE_ENTRIES"
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
				v-else-if="state.missingLayer"
				class="flex flex-col gap-3 rounded-lg border border-default bg-default p-3.5"
			>
				<p class="text-sm font-semibold text-highlighted">The project has no frontend layer yet</p>
				<p class="text-xs text-muted">
					A theme is written to a frontend layer of the project's own, above the DMS. The
					builder can create one:
					<span class="font-mono" :title="state.missingLayer ?? undefined">{{ missingFolder }}</span>,
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
				v-else-if="state.error"
				color="warning"
				variant="subtle"
				icon="i-ph-warning-light"
				title="The theme cannot be edited here"
				:description="describeError(state.error, null)"
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
					<DmsBuilderThemeVariable
						v-for="entry in group.variables"
						:key="entry.name"
						:name="entry.name"
						:label="entry.label"
						:hint="entry.hint"
						:color="entry.kind === 'color'"
						:scope="entry.scope"
						:observed="valuesOf(entry.name)"
						:shown-mode="pageMode"
					/>
				</section>

				<section v-if="!advanced" class="flex flex-col gap-3">
					<DmsEyebrow>Shape and type</DmsEyebrow>
					<DmsBuilderThemeShape />
				</section>

				<section v-if="advanced" class="flex flex-col gap-3">
					<DmsEyebrow>Other variables</DmsEyebrow>
					<DmsBuilderThemeVariable
						v-for="name in others"
						:key="name"
						:name="name"
						:color="false"
						scope="modes"
						:observed="valuesOf(name)"
						:shown-mode="pageMode"
						:removable="added.includes(name) && !themed.includes(name)"
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
						<li v-for="file in files" :key="file">{{ file }}</li>
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

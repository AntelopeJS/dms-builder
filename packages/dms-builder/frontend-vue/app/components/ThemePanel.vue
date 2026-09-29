<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { describeError } from '../runtime/errors'
import { THEME_MODES, useThemeEditor } from '../runtime/theme'
import { DARK_CLASS, ModeMirror } from '../runtime/theme-mirror'
import {
	isVariableName,
	otherVariables,
	THEME_LOGO_SLOTS,
	THEME_VARIABLE_GROUPS,
} from '../runtime/theme-catalog'
import type { ThemeMode, ThemeVariables } from '../runtime/types'

const MODE_ITEMS = [
	{ label: 'Light', value: 'light', icon: 'i-ph-sun' },
	{ label: 'Dark', value: 'dark', icon: 'i-ph-moon' },
]

const editor = useThemeEditor()
const state = editor.state
const colorMode = useColorModePreference()

const shownMode = ref<ThemeMode>('light')
const observed = ref<Record<ThemeMode, ThemeVariables>>({ light: {}, dark: {} })
const added = ref<string[]>([])
const newName = ref('')
let mirror: ModeMirror | undefined
let observers: MutationObserver[] = []
let pendingFrame = 0

const others = computed(() =>
	otherVariables([
		...added.value,
		...THEME_MODES.flatMap((mode) => [
			...Object.keys(state.value.draft?.variables[mode] ?? {}),
			...Object.keys(state.value.baseline?.variables[mode] ?? {}),
		]),
	]),
)
const variableNames = computed(() => [
	...THEME_VARIABLE_GROUPS.flatMap((group) => group.variables.map((entry) => entry.name)),
	...others.value,
])
const files = computed(() => {
	const structure = state.value.structure
	return structure
		? [structure.files.stylesheet, structure.files.appConfig, `${structure.files.assets}/`, structure.files.applier, structure.files.entry]
		: []
})

/** Read what each variable shows in each mode, whichever one the page shows. */
function observe(): void {
	shownMode.value = document.documentElement.classList.contains(DARK_CLASS) ? 'dark' : 'light'
	if (mirror) {
		observed.value = mirror.read(variableNames.value)
	}
}

/** One read per frame, however many edits, class changes and stylesheet swaps asked. */
function scheduleObserve(): void {
	if (pendingFrame) {
		return
	}
	pendingFrame = requestAnimationFrame(() => {
		pendingFrame = 0
		observe()
	})
}

function valuesOf(name: string): Partial<Record<ThemeMode, string>> {
	return {
		light: observed.value.light[name],
		dark: observed.value.dark[name],
	}
}

/** Watch what changes what the variables compute to: the mode, and the stylesheets. */
function watchPage(): MutationObserver[] {
	const mode = new MutationObserver(scheduleObserve)
	mode.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
	const styles = new MutationObserver(scheduleObserve)
	styles.observe(document.head, { childList: true, subtree: true, characterData: true })
	return [mode, styles]
}

function showMode(mode: string | number): void {
	colorMode.value = mode === 'dark' ? 'dark' : 'light'
}

function addVariable(): void {
	const name = newName.value.trim()
	if (!isVariableName(name)) {
		return
	}
	added.value = [...new Set([...added.value, name])]
	newName.value = ''
}

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
	<div class="flex flex-col gap-5">
		<div v-if="state.loading && !state.draft" class="flex justify-center py-8">
			<UIcon name="i-ph-circle-notch" class="size-6 animate-spin text-dimmed" />
		</div>

		<UAlert
			v-else-if="state.error"
			color="warning"
			variant="subtle"
			icon="i-ph-warning"
			title="The theme cannot be edited here"
			:description="describeError(state.error, null)"
		/>

		<template v-else-if="state.draft">
			<div class="flex items-center gap-3">
				<p class="flex-1 text-xs text-muted">
					One theme for the whole project, written to
					<span class="font-medium text-highlighted">{{ state.structure?.layer.name }}</span>
					when you save. Changes show on the page as you make them.
				</p>
				<DmsSegmented
					:model-value="shownMode"
					:items="MODE_ITEMS"
					size="xs"
					aria-label="Show the page in"
					@update:model-value="showMode($event)"
				/>
			</div>

			<section
				v-for="group in THEME_VARIABLE_GROUPS"
				:key="group.label"
				class="flex flex-col gap-2"
			>
				<div class="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,1fr)_1.75rem] gap-2">
					<p class="text-xs font-semibold uppercase tracking-wide text-dimmed">{{ group.label }}</p>
					<p class="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-dimmed">
						<UIcon name="i-ph-sun" class="size-3" /> Light
					</p>
					<p class="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-dimmed">
						<UIcon name="i-ph-moon" class="size-3" /> Dark
					</p>
				</div>
				<DmsBuilderThemeVariable
					v-for="entry in group.variables"
					:key="entry.name"
					:name="entry.name"
					:label="entry.label"
					:hint="entry.hint"
					:color="entry.kind === 'color'"
					:observed="valuesOf(entry.name)"
				/>
			</section>

			<section class="flex flex-col gap-2">
				<p class="text-xs font-semibold uppercase tracking-wide text-dimmed">Other variables</p>
				<DmsBuilderThemeVariable
					v-for="name in others"
					:key="name"
					:name="name"
					:color="false"
					:observed="valuesOf(name)"
				/>
				<form class="flex items-center gap-2" @submit.prevent="addVariable">
					<UInput
						v-model="newName"
						size="xs"
						class="flex-1 font-mono"
						placeholder="--any-custom-property"
						aria-label="Name of a CSS variable to override"
					/>
					<UButton
						type="submit"
						size="xs"
						color="neutral"
						variant="outline"
						icon="i-ph-plus"
						label="Add"
						:disabled="!isVariableName(newName.trim())"
					/>
				</form>
			</section>

			<section class="flex flex-col gap-3">
				<p class="text-xs font-semibold uppercase tracking-wide text-dimmed">Logos</p>
				<DmsBuilderThemeLogo
					v-for="entry in THEME_LOGO_SLOTS"
					:key="entry.slot"
					:logo-slot="entry.slot"
					:label="entry.label"
					:hint="entry.hint"
				/>
			</section>

			<section class="flex flex-col gap-1.5 rounded-md border border-default bg-elevated/50 p-3">
				<p class="text-xs font-medium text-highlighted">Saved with the page, from the bar</p>
				<ul class="flex flex-col gap-0.5 font-mono text-[11px] text-muted">
					<li v-for="file in files" :key="file">{{ file }}</li>
				</ul>
				<p v-if="!state.structure?.applied" class="text-[11px] text-dimmed">
					The first save also makes the layer's entry apply the theme.
				</p>
			</section>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { describeError } from '../runtime/errors'
import { THEME_MODES, useThemeEditor } from '../runtime/theme'
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
const DARK_CLASS = 'dark'

const editor = useThemeEditor()
const state = editor.state
const colorMode = useColorModePreference()

const shownMode = ref<ThemeMode>('light')
const observed = ref<Partial<Record<ThemeMode, ThemeVariables>>>({})
const added = ref<string[]>([])
const newName = ref('')
let observer: MutationObserver | undefined

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

function readVariables(element: Element): ThemeVariables {
	const style = getComputedStyle(element)
	return Object.fromEntries(
		variableNames.value.map((name) => [name, style.getPropertyValue(name).trim()]),
	)
}

/**
 * Read what each variable shows now. The dark values are read off a hidden
 * element carrying the class the DMS keys dark mode on, which works in either
 * mode; the light ones only off the page itself, so they are kept from the
 * last time the page was light.
 */
function observe(): void {
	const root = document.documentElement
	shownMode.value = root.classList.contains(DARK_CLASS) ? 'dark' : 'light'
	const probe = document.createElement('div')
	probe.className = DARK_CLASS
	probe.hidden = true
	document.body.appendChild(probe)
	const dark = readVariables(probe)
	probe.remove()
	const light = shownMode.value === 'light' ? readVariables(root) : observed.value.light
	observed.value = { light, dark }
}

function valuesOf(name: string): Partial<Record<ThemeMode, string>> {
	return {
		light: observed.value.light?.[name],
		dark: observed.value.dark?.[name],
	}
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

watch(() => state.value.draft, observe, { deep: true, flush: 'post' })
watch(variableNames, observe, { flush: 'post' })

onMounted(() => {
	void editor.load().then(observe)
	observer = new MutationObserver(observe)
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['class'],
	})
	observe()
})

onUnmounted(() => observer?.disconnect())
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
					:color="entry.color"
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

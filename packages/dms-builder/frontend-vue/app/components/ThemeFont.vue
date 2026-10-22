<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useThemeEditor, variableProblem } from '../runtime/theme'
import { FONT_VARIABLE } from '../runtime/theme-catalog'
import {
	DMS_FONT_FAMILY,
	fontStack,
	leadingFamily,
	THEME_FONTS,
	themeFontOf,
	type ThemeFont,
} from '../runtime/theme-fonts'

/**
 * The dashboard's font, as a row showing it in its own letters: opening it
 * lists the fonts the theme can host, each in its own letters too, above a
 * sample of a dashboard in the one under the pointer. The font stack itself
 * is there once asked for, or when it names no font of the list.
 */

const props = defineProps<{
	expanded: boolean
	/** What the DMS sets the variable to, shown in an empty stack field. */
	dmsDefaultValue?: string
}>()

const emit = defineEmits<{
	toggle: []
}>()

const LABEL = 'Font'

interface FontChoice {
	family: string
	character: string
	stack: string
	/** None for the DMS's own, which the theme leaves the variable unset for. */
	font?: ThemeFont
}

const DMS_CHOICE: FontChoice = {
	family: DMS_FONT_FAMILY,
	character: "The DMS's own",
	stack: fontStack({ family: DMS_FONT_FAMILY, generic: 'sans-serif' }),
}

const CHOICES: FontChoice[] = [
	DMS_CHOICE,
	...THEME_FONTS.map((font) => ({ family: font.family, character: font.character, stack: fontStack(font), font })),
]

const editor = useThemeEditor()
const state = editor.state

const editorId = useId()
const problemId = useId()
const codeRequested = ref(false)
/** The choice under the pointer or the focus, which the sample shows. */
const consideredChoice = ref<FontChoice | null>(null)

const value = computed(() => state.value.draft?.variables.shared[FONT_VARIABLE] ?? '')
const savedValue = computed(() => state.value.baseline?.variables.shared[FONT_VARIABLE] ?? '')
const problem = computed(() => (value.value ? variableProblem(FONT_VARIABLE, value.value) : undefined))

const chosen = computed<FontChoice | undefined>(() => {
	if (value.value === '') {
		return DMS_CHOICE
	}
	const font = themeFontOf(value.value)
	return font ? CHOICES.find((choice) => choice.font === font) : undefined
})

/** What the page's text shows in: the theme's stack, else the DMS's; the DMS's for a value it cannot hold. */
const shownStack = computed(() => (value.value && !problem.value ? value.value : DMS_CHOICE.stack))
const sampleStack = computed(() => consideredChoice.value?.stack ?? shownStack.value)

const summary = computed(() => {
	if (chosen.value) {
		return `${chosen.value.family} — ${chosen.value.character}`
	}
	return problem.value ? 'A font stack that cannot be used' : `${leadingFamily(value.value)} — typed as code`
})

const codeShown = computed(() => codeRequested.value || (value.value !== '' && !chosen.value))

function choose(choice: FontChoice): void {
	editor.setVariable('shared', FONT_VARIABLE, choice.font ? choice.stack : '')
}

function codeColor(): 'error' | 'primary' | 'neutral' {
	if (problem.value) {
		return 'error'
	}
	return value.value === savedValue.value ? 'neutral' : 'primary'
}

/** Trimmed as the save will, so the field shows what gets written. */
function trimCode(): void {
	if (value.value !== value.value.trim()) {
		editor.setVariable('shared', FONT_VARIABLE, value.value.trim())
	}
}
</script>

<template>
	<div class="flex flex-col gap-1.5" :data-theme-row="FONT_VARIABLE">
		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverted"
			:class="expanded ? 'border-primary/45 bg-elevated' : 'border-default bg-elevated/40 hover:bg-elevated'"
			:aria-expanded="expanded"
			:aria-controls="expanded ? editorId : undefined"
			:aria-describedby="problem ? problemId : undefined"
			@click="emit('toggle')"
		>
			<span
				aria-hidden="true"
				class="flex size-9 shrink-0 items-center justify-center rounded-md bg-default text-base font-medium text-highlighted ring ring-default"
				:style="{ fontFamily: shownStack }"
			>Aa</span>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate text-[13px] font-medium text-highlighted">{{ LABEL }}</span>
				<span class="truncate text-xs text-muted">{{ summary }}</span>
			</span>
			<UIcon v-if="problem" name="i-ph-warning-light" class="size-4 shrink-0 text-error" />
			<UBadge v-else-if="value !== ''" label="Edited" color="primary" variant="soft" size="sm" />
			<UIcon
				:name="expanded ? 'i-ph-caret-down-light' : 'i-ph-caret-right-light'"
				class="size-3.5 shrink-0 text-dimmed"
			/>
		</button>

		<div
			v-if="expanded"
			:id="editorId"
			class="flex flex-col gap-3 rounded-lg border border-default bg-elevated/40 p-3"
			:data-theme-editor="FONT_VARIABLE"
		>
			<div
				aria-hidden="true"
				class="flex flex-col gap-0.5 rounded-md border border-default bg-default px-3 py-2.5"
				:style="{ fontFamily: sampleStack }"
				data-font-sample
			>
				<span class="text-[11px] font-medium text-muted">Revenue this month</span>
				<span class="text-xl font-semibold tabular-nums text-highlighted">€48,250.75</span>
				<span class="text-xs text-toned">Orders shipped on time, by region and by week</span>
			</div>

			<div class="flex flex-col gap-0.5" role="group" :aria-label="`${LABEL}: the fonts to pick from`">
				<button
					v-for="choice in CHOICES"
					:key="choice.family"
					type="button"
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverted"
					:class="choice === chosen ? 'bg-primary/10 ring ring-primary/40' : 'hover:bg-elevated'"
					:aria-pressed="choice === chosen"
					:data-font-choice="choice.family"
					@click="choose(choice)"
					@pointerenter="consideredChoice = choice"
					@pointerleave="consideredChoice = null"
					@focus="consideredChoice = choice"
					@blur="consideredChoice = null"
				>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-[15px] leading-snug text-highlighted" :style="{ fontFamily: choice.stack }">
							{{ choice.family }}
						</span>
						<span class="truncate text-[11.5px] text-muted">{{ choice.character }}</span>
					</span>
					<UIcon v-if="choice === chosen" name="i-ph-check-light" class="size-4 shrink-0 text-primary" />
				</button>
			</div>

			<div class="flex items-center gap-2">
				<UButton
					label="Back to the DMS default"
					icon="i-ph-arrow-counter-clockwise-light"
					size="xs"
					color="neutral"
					variant="outline"
					:disabled="value === ''"
					@click="choose(DMS_CHOICE)"
				/>
				<UButton
					icon="i-ph-code-light"
					size="xs"
					color="neutral"
					:variant="codeShown ? 'soft' : 'ghost'"
					class="ml-auto"
					:aria-pressed="codeShown"
					:aria-label="`${LABEL}: the font stack`"
					:title="codeShown ? 'Hide the font stack' : 'Show the font stack'"
					@click="codeRequested = !codeRequested"
				/>
			</div>
			<UInput
				v-if="codeShown"
				:model-value="value"
				:placeholder="props.dmsDefaultValue ?? ''"
				:color="codeColor()"
				:highlight="codeColor() !== 'neutral'"
				size="sm"
				class="w-full"
				:ui="{ base: 'font-mono text-xs placeholder:text-muted' }"
				:aria-label="`${LABEL}, the font stack`"
				:aria-invalid="problem ? true : undefined"
				:aria-describedby="problem ? problemId : undefined"
				@update:model-value="editor.setVariable('shared', FONT_VARIABLE, String($event))"
				@change="trimCode"
			/>
			<p class="text-[11px] text-dimmed">
				Save downloads the font into the project, which then serves it itself: the dashboard
				fetches nothing from elsewhere.
			</p>
		</div>

		<p v-if="problem" :id="problemId" class="text-xs text-error">
			The value {{ problem }}. It shows nowhere, and the theme cannot be saved with it.
		</p>
	</div>
</template>

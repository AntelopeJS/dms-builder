<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDmsAppConfig } from '#dms/frontend-module'
import { LOGO_ACCEPT, THEME_MODES, logoKey, previewLogo, useThemeEditor } from '../runtime/theme'
import type { LogoSlot, ThemeLogos, ThemeMode } from '../runtime/types'

interface BrandingConfig {
	branding?: { logo?: ThemeLogos }
}

const TILE_CLASSES: Record<ThemeMode, string> = {
	light: 'bg-white text-neutral-500',
	dark: 'bg-neutral-950 text-neutral-400',
}

const props = defineProps<{
	logoSlot: LogoSlot
	label: string
	hint: string
}>()

const editor = useThemeEditor()
const state = editor.state
const appConfig: BrandingConfig = useDmsAppConfig()
const refusal = ref<string | null>(null)

const customized = computed(() =>
	THEME_MODES.some(
		(mode) =>
			state.value.baseline?.logos[props.logoSlot]?.[mode] !== undefined ||
			state.value.pending[logoKey(props.logoSlot, mode)] !== undefined,
	),
)

function source(mode: ThemeMode): string | undefined {
	return previewLogo(state.value, props.logoSlot, mode) ?? appConfig.branding?.logo?.[props.logoSlot]?.[mode]
}

function status(mode: ThemeMode): string {
	if (state.value.pending[logoKey(props.logoSlot, mode)]) {
		return 'new'
	}
	if (state.value.draft?.logos[props.logoSlot]?.[mode] !== undefined) {
		return 'saved'
	}
	return state.value.baseline?.logos[props.logoSlot]?.[mode] ? 'reset' : 'default'
}

async function pick(mode: ThemeMode, event: Event): Promise<void> {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) {
		return
	}
	refusal.value = (await editor.pickLogo(props.logoSlot, mode, file)) ?? null
}

function reset(): void {
	for (const mode of THEME_MODES) {
		editor.resetLogo(props.logoSlot, mode)
	}
	refusal.value = null
}
</script>

<template>
	<div class="flex flex-col gap-1.5">
		<div class="flex items-center gap-2">
			<div class="min-w-0 flex-1">
				<p class="text-xs font-medium text-highlighted">{{ label }}</p>
				<p class="text-[10px] text-dimmed">{{ hint }}</p>
			</div>
			<UButton
				v-if="customized"
				icon="i-ph-arrow-counter-clockwise"
				size="xs"
				color="neutral"
				variant="ghost"
				:aria-label="`Reset the ${label.toLowerCase()} to the DMS logo`"
				title="Back to the DMS logo, in both modes"
				@click="reset"
			/>
		</div>
		<div class="grid grid-cols-2 gap-2">
			<label
				v-for="mode in THEME_MODES"
				:key="mode"
				class="group relative flex h-20 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-default px-3"
				:class="TILE_CLASSES[mode]"
				:data-theme-logo="`${logoSlot}:${mode}`"
				:title="`Upload the ${mode} ${label.toLowerCase()}`"
			>
				<img
					v-if="source(mode)"
					:src="source(mode)"
					:alt="`${label}, ${mode}`"
					class="max-h-12 max-w-full object-contain"
				/>
				<UIcon v-else name="i-ph-image" class="size-6" />
				<span class="absolute left-1.5 top-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
					{{ mode }} · {{ status(mode) }}
				</span>
				<span class="absolute bottom-1 right-1.5 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-80">
					Upload
				</span>
				<input type="file" class="sr-only" :accept="LOGO_ACCEPT" @change="pick(mode, $event)" />
			</label>
		</div>
		<p v-if="refusal" class="text-xs text-error">{{ refusal }}</p>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDmsAppConfig } from '#dms/frontend-module'
import { LOGO_ACCEPT, THEME_MODES, logoKey, previewLogo, useThemeEditor } from '../runtime/theme'
import type { LogoSlot, ThemeLogos, ThemeMode } from '../runtime/types'

interface BrandingConfig {
	branding?: { logo?: ThemeLogos }
}

/** What a tile's corner says of the logo it shows. */
type LogoStatus = 'new' | 'saved' | 'reset' | 'default' | 'follows'

const STATUS_LABELS: Record<LogoStatus, string> = {
	new: 'new',
	saved: 'saved',
	reset: 'DMS logo once saved',
	default: 'DMS logo',
	follows: 'the logo',
}

/** Each tile draws its logo on its own mode's ground, whatever mode the page shows. */
const TILE_CLASSES: Record<ThemeMode, string> = {
	light: 'bg-white text-neutral-600',
	dark: 'bg-neutral-950 text-neutral-300',
}

const props = defineProps<{
	/** The slot whose logo the tiles show. */
	logoSlot: LogoSlot
	label: string
	hint: string
	/** The modes in which this slot only repeats another one's logo. */
	follows?: Partial<Record<ThemeMode, boolean>>
	/** What the tiles say instead of "DMS logo" when nothing is set. */
	emptyLabel?: string
	/** A square tile, for an icon. */
	square?: boolean
}>()

const emit = defineEmits<{
	pick: [mode: ThemeMode, file: File]
	reset: [mode: ThemeMode]
}>()

const editor = useThemeEditor()
const state = editor.state
const appConfig: BrandingConfig = useDmsAppConfig()

function status(mode: ThemeMode): LogoStatus {
	if (props.follows?.[mode]) {
		return 'follows'
	}
	if (state.value.pending[logoKey(props.logoSlot, mode)]) {
		return 'new'
	}
	if (state.value.draft?.logos[props.logoSlot]?.[mode] !== undefined) {
		return 'saved'
	}
	return state.value.baseline?.logos[props.logoSlot]?.[mode] ? 'reset' : 'default'
}

function statusLabel(mode: ThemeMode): string {
	const shown = status(mode)
	return shown === 'default' && props.emptyLabel ? props.emptyLabel : STATUS_LABELS[shown]
}

/** Whether the slot holds something of the project's in this mode, saved or not. */
function customized(mode: ThemeMode): boolean {
	return status(mode) === 'new' || status(mode) === 'saved'
}

const anyCustomized = computed(() => THEME_MODES.some(customized))

/**
 * The logo a tile shows: the file picked or kept, the DMS's own for one the
 * draft hands back when the DMS says which, else what the dashboard shows.
 */
function source(mode: ThemeMode): string | undefined {
	return (
		previewLogo(state.value, props.logoSlot, mode, editor.defaults.value.logo) ??
		appConfig.branding?.logo?.[props.logoSlot]?.[mode]
	)
}

function pick(mode: ThemeMode, event: Event): void {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (file) {
		emit('pick', mode, file)
	}
}

function reset(): void {
	for (const mode of THEME_MODES) {
		if (customized(mode)) {
			emit('reset', mode)
		}
	}
}
</script>

<template>
	<div class="flex flex-col gap-1.5">
		<div class="flex items-center gap-2">
			<div class="min-w-0 flex-1">
				<p class="text-[13px] font-medium text-highlighted">{{ label }}</p>
				<p class="text-xs text-muted">{{ hint }}</p>
			</div>
			<UButton
				v-if="anyCustomized"
				icon="i-ph-arrow-counter-clockwise-light"
				size="xs"
				color="neutral"
				variant="ghost"
				:aria-label="`Reset the ${label.toLowerCase()}`"
				title="Back to what it was before, in both modes"
				@click="reset"
			/>
		</div>
		<div class="grid grid-cols-2 gap-2">
			<label
				v-for="mode in THEME_MODES"
				:key="mode"
				class="group relative flex h-20 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-default px-3 focus-within:ring-2 focus-within:ring-primary"
				:class="TILE_CLASSES[mode]"
				:data-theme-logo="`${logoSlot}:${mode}`"
				:title="`Upload the ${mode} ${label.toLowerCase()}`"
			>
				<img
					v-if="source(mode)"
					:src="source(mode)"
					:alt="`${label}, ${mode}`"
					class="max-w-full object-contain"
					:class="square ? 'size-10' : 'max-h-12'"
				/>
				<UIcon v-else name="i-ph-image-light" class="size-6" />
				<span class="absolute top-1 left-1.5 text-[10px] font-medium tracking-wide uppercase">
					{{ mode }} · {{ statusLabel(mode) }}
				</span>
				<span
					class="absolute right-1.5 bottom-1 flex items-center gap-1 text-[11px] font-medium opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
				>
					<UIcon name="i-ph-upload-simple-light" class="size-3.5" />
					Upload
				</span>
				<input
					type="file"
					class="sr-only"
					:accept="LOGO_ACCEPT"
					:aria-label="`Upload the ${mode} ${label.toLowerCase()}`"
					@change="pick(mode, $event)"
				/>
			</label>
		</div>
	</div>
</template>

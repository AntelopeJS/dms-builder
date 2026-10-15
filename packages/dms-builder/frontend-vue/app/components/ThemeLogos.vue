<script setup lang="ts">
import { ref } from 'vue'
import { useBuilderMode } from '../runtime/mode'
import {
	holdsLogo,
	iconFollowsLogo,
	SIMPLE_ICON_SLOT,
	SIMPLE_LOGO_SLOT,
	simpleLogoSlots,
	SQUARE_LOGO_SLOTS,
	useThemeEditor,
} from '../runtime/theme'
import { THEME_LOGO_SLOTS } from '../runtime/theme-catalog'
import type { LogoSlot, ThemeMode } from '../runtime/types'

/**
 * The logos. The simple mode takes one logo per mode and puts it everywhere a
 * logo shows — the email gets it as a PNG — and an optional square icon for
 * the places that are square: the folded sidebar and the browser tab. The
 * developer mode sets each slot on its own.
 */

const editor = useThemeEditor()
const state = editor.state
const { advanced } = useBuilderMode()
const refusals = ref<Record<string, string>>({})

const follows = (): Partial<Record<ThemeMode, boolean>> => ({
	light: iconFollowsLogo(state.value, 'light'),
	dark: iconFollowsLogo(state.value, 'dark'),
})

async function pick(row: string, slots: LogoSlot[], mode: ThemeMode, file: File): Promise<void> {
	const refusal = await editor.pickLogo(slots, mode, file)
	const { [row]: _cleared, ...rest } = refusals.value
	refusals.value = refusal ? { ...rest, [row]: refusal } : rest
}

function pickLogo(mode: ThemeMode, file: File): void {
	void pick('logo', simpleLogoSlots(state.value, mode), mode, file)
}

function resetLogo(mode: ThemeMode): void {
	editor.resetLogo(simpleLogoSlots(state.value, mode), mode)
}

function pickIcon(mode: ThemeMode, file: File): void {
	void pick('icon', SQUARE_LOGO_SLOTS, mode, file)
}

/** An icon taken away hands the square slots back to the logo, or to the DMS's icon. */
function resetIcon(mode: ThemeMode): void {
	const logo = holdsLogo(state.value, SIMPLE_LOGO_SLOT, mode) ? SIMPLE_LOGO_SLOT : undefined
	editor.resetLogo(SQUARE_LOGO_SLOTS, mode, logo)
}

function pickSlot(slot: LogoSlot, mode: ThemeMode, file: File): void {
	void pick(slot, [slot], mode, file)
}

function resetSlot(slot: LogoSlot, mode: ThemeMode): void {
	editor.resetLogo([slot], mode)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<template v-if="!advanced">
			<div class="flex flex-col gap-1">
				<DmsBuilderThemeLogo
					:logo-slot="SIMPLE_LOGO_SLOT"
					label="Logo"
					hint="Everywhere the dashboard shows its logo, emails included."
					@pick="pickLogo"
					@reset="resetLogo"
				/>
				<p v-if="refusals.logo" class="text-xs text-error">{{ refusals.logo }}</p>
			</div>
			<div class="flex flex-col gap-1">
				<DmsBuilderThemeLogo
					:logo-slot="SIMPLE_ICON_SLOT"
					label="Square icon, if the logo is wide"
					hint="The folded sidebar and the browser tab. Without one, they show the logo, smaller."
					:follows="follows()"
					empty-label="DMS icon"
					square
					@pick="pickIcon"
					@reset="resetIcon"
				/>
				<p v-if="refusals.icon" class="text-xs text-error">{{ refusals.icon }}</p>
			</div>
		</template>
		<template v-else>
			<div v-for="entry in THEME_LOGO_SLOTS" :key="entry.slot" class="flex flex-col gap-1">
				<DmsBuilderThemeLogo
					:logo-slot="entry.slot"
					:label="entry.label"
					:hint="entry.hint"
					:square="entry.slot === 'collapsed' || entry.slot === 'favicon'"
					@pick="(mode: ThemeMode, file: File) => pickSlot(entry.slot, mode, file)"
					@reset="(mode: ThemeMode) => resetSlot(entry.slot, mode)"
				/>
				<p v-if="refusals[entry.slot]" class="text-xs text-error">{{ refusals[entry.slot] }}</p>
			</div>
		</template>
	</div>
</template>

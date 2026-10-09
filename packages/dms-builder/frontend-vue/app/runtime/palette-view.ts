/**
 * How the palette lays its blocks out: tiles, three to a row, an icon over a
 * name — what is there to add, taken in at a glance — or lines, each saying
 * under its name what the block is for. The tiles say it on hover.
 *
 * The choice is the viewer's, remembered in their browser like the mode.
 */
import { ref } from 'vue'

export type PaletteLayout = 'grid' | 'list'

const STORAGE_KEY = 'dms-builder:palette'

function remembered(): PaletteLayout {
	try {
		return globalThis.localStorage?.getItem(STORAGE_KEY) === 'list' ? 'list' : 'grid'
	} catch {
		return 'grid'
	}
}

const layout = ref<PaletteLayout>(remembered())

function setLayout(next: PaletteLayout): void {
	layout.value = next
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, next)
	} catch {
		// A browser refusing storage still switches; it only forgets next time.
	}
}

export function usePaletteView() {
	return { layout, setLayout }
}

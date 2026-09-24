/**
 * Whether the builder speaks to someone building a page or to a developer.
 *
 * The simple mode leaves out what only code reads — a field's key, the settings
 * a block files under "Advanced", why a block is locked and where it lives —
 * and the builder writes what it hides itself. The advanced view shows all of
 * it. The choice is the viewer's, remembered in their browser and nowhere else.
 */
import { computed, ref } from 'vue'

export type BuilderMode = 'simple' | 'advanced'

const STORAGE_KEY = 'dms-builder:mode'

function remembered(): BuilderMode {
	try {
		return globalThis.localStorage?.getItem(STORAGE_KEY) === 'advanced'
			? 'advanced'
			: 'simple'
	} catch {
		return 'simple'
	}
}

const mode = ref<BuilderMode>(remembered())
const advanced = computed(() => mode.value === 'advanced')

function setMode(next: BuilderMode): void {
	mode.value = next
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, next)
	} catch {
		// A browser refusing storage still switches; it only forgets next time.
	}
}

export function useBuilderMode() {
	return { mode, advanced, setMode }
}

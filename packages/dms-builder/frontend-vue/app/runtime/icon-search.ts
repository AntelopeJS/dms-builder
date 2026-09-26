/**
 * Searching the icons the frontend bundles, by name.
 *
 * The frontend bundles Phosphor and Lucide only, so an icon from any other
 * collection would resolve to nothing: the search is scoped to those two
 * rather than offering names that cannot render.
 */
import { ref, watch } from 'vue'
import { ICON_PREFIXES, ICON_SEARCH_LIMIT, ICON_SEARCH_URL } from './constants'

/** Whether a name is one of the bundled collections', or no name at all. */
export function isBundledIcon(name: string | undefined): boolean {
	return (
		!name || ICON_PREFIXES.some((prefix) => name.startsWith(`i-${prefix}-`))
	)
}

/** `i-ph-house` → `{ prefixes: "ph", query: "house" }`, else a plain search. */
function searchParams(text: string): { prefixes: string; query: string } {
	const bare = text.replace(/^i-/, '')
	const prefix = ICON_PREFIXES.find((entry) => bare.startsWith(`${entry}-`))
	return {
		prefixes: prefix ?? ICON_PREFIXES.join(','),
		query: prefix ? bare.slice(prefix.length + 1) : bare,
	}
}

/** A query, the icons it found, and whether the search could be reached. */
export function useIconSearch() {
	const query = ref('')
	const results = ref<string[]>([])
	const searching = ref(false)
	const offline = ref(false)
	let debounce: ReturnType<typeof setTimeout> | undefined

	async function search(text: string): Promise<void> {
		const params = searchParams(text.trim())
		if (params.query.length < 2) {
			results.value = []
			return
		}
		searching.value = true
		try {
			const url = `${ICON_SEARCH_URL}?query=${encodeURIComponent(params.query)}&prefixes=${params.prefixes}&limit=${ICON_SEARCH_LIMIT}`
			const answer = (await $fetch<{ icons?: string[] }>(url)) ?? {}
			results.value = (answer.icons ?? []).map(
				(name) => `i-${name.replace(':', '-')}`,
			)
			offline.value = false
		} catch {
			// Searching needs the Iconify API; typing a name by hand does not.
			results.value = []
			offline.value = true
		} finally {
			searching.value = false
		}
	}

	watch(query, (text) => {
		clearTimeout(debounce)
		debounce = setTimeout(() => void search(text), 250)
	})

	function reset(): void {
		query.value = ''
		results.value = []
	}

	return { query, results, searching, offline, reset }
}

/**
 * A block, as a panel of its own edits it in the simple mode.
 *
 * Every such panel reads the same things of the block it is opened on — the
 * options it is written with, the ones its type declares — and writes them
 * back the same way. What differs from one panel to the next is which options
 * it edits, and how.
 */
import { computed } from 'vue'
import { descriptorOf } from './catalog'
import { findNode } from './draft'
import { useBuilder } from './session'
import type { OptionSchema } from './types'

export function useBlockPanel(path: () => string) {
	const builder = useBuilder()
	const session = builder.session

	const block = computed(() =>
		session.value.draft ? findNode(session.value.draft, path()) : undefined,
	)
	const config = computed<Record<string, unknown>>(() => block.value?.config ?? {})
	const options = computed<Record<string, OptionSchema>>(
		() => descriptorOf(session.value.catalog, block.value?.type)?.config ?? {},
	)

	function has(key: string): boolean {
		return key in options.value
	}

	function text(key: string): string {
		const value = config.value[key]
		return typeof value === 'string' ? value : ''
	}

	function patch(values: Record<string, unknown>): void {
		builder.patchConfig(path(), values)
	}

	/** An option emptied goes back to what the block does without it. */
	function write(key: string, value: unknown): void {
		patch({ [key]: value === '' ? undefined : value })
	}

	return { block, config, options, has, text, patch, write }
}

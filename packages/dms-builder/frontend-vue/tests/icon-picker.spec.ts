import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import IconPicker from '../app/components/IconPicker.vue'
import { SUGGESTED_ICONS } from '../app/runtime/constants'
import { findAll, installDocumentStub, mount, stub, textOf, type TestNode } from './support/render'

/**
 * The icon picker, opened: something to pick from before anything is searched,
 * the search's answers once it is, and the icon picked named under them.
 */

installDocumentStub()

let unmount: (() => void) | undefined

function open(modelValue?: string): TestNode {
	const view = mount(IconPicker, {
		props: { modelValue },
		components: {
			UPopover: stub('UPopover'),
			UInput: stub('UInput'),
			UButton: stub('UButton'),
		},
	})
	unmount = view.unmount
	return view.root
}

/** The icons offered in the grid, by name. */
const offered = (root: TestNode) =>
	findAll(root, (node) => node.tag === 'UButton' && node.props['aria-pressed'] !== undefined).map(
		(node) => node.props.icon,
	)

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	unmount?.()
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe('the icon picker', () => {
	it('offers two rows of icons before anything is searched', () => {
		const root = open()

		expect(offered(root)).toEqual([...SUGGESTED_ICONS])
		expect(SUGGESTED_ICONS, 'two rows of its seven columns').toHaveLength(14)
		expect(textOf(root)).not.toContain('No icon')
	})

	it('names the icon picked, with the way to take it off', () => {
		const root = open('i-ph-house')

		expect(textOf(root)).toContain('i-ph-house')
		expect(
			findAll(root, (node) => node.tag === 'UButton' && node.props.label === 'Remove'),
		).toHaveLength(1)
	})

	it('offers what the search answers once a name is typed', async () => {
		vi.stubGlobal('$fetch', vi.fn(async () => ({ icons: ['ph:star', 'lucide:star'] })))
		const root = open()
		const search = findAll(root, (node) => node.tag === 'UInput')[0]!
		;(search.props['onUpdate:modelValue'] as (value: string) => void)('star')
		await vi.advanceTimersByTimeAsync(300)
		await nextTick()

		expect(offered(root)).toEqual(['i-ph-star', 'i-lucide-star'])
	})
})

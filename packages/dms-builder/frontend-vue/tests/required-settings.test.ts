import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { descriptorOf, missingSettings } from '../app/runtime/catalog'
import { describeError, errorDetail } from '../app/runtime/errors'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import { installFakeHost, testCatalog, type FakeBackend } from './support/builder-harness'
import type { BlockDraft, BuilderError } from '../app/runtime/types'

/**
 * How the editor answers a setting nobody filled in.
 *
 * The engine typechecks the page it writes, so the last word on an empty
 * required setting is a compiler error against generated source — a line number
 * in a file the author never opens, about a property the panel may not even
 * show. These read the same gap off the catalog instead, which is what lets the
 * field be marked where it is empty and Save name it.
 */

let backend: FakeBackend
let builder: BuilderController

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(200)
}

function tabBlock(items: Array<Record<string, unknown>>): BlockDraft {
	return { name: 'tab', type: 'Tab', config: { items } }
}

const tabDescriptor = () => descriptorOf(testCatalog(), 'Tab')

beforeEach(async () => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
	await builder.open('/reports/sales')
	await settle()
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

describe('what the catalog says is still empty', () => {
	it('names a setting nested in a list by the list entry it belongs to', () => {
		const gaps = missingSettings(
			tabDescriptor(),
			tabBlock([{ slot: 'orders', label: 'Orders' }, { slot: 'sends' }]),
		)

		expect(gaps.map((gap) => gap.label)).toEqual(['Tabs #2 → Label'])
		expect(gaps[0]?.path, 'and addresses it in the options').toEqual([
			'items',
			'1',
			'label',
		])
	})

	it('counts an emptied setting as empty, not only a missing one', () => {
		const gaps = missingSettings(
			tabDescriptor(),
			tabBlock([{ slot: 'orders', label: '' }]),
		)

		expect(gaps.map((gap) => gap.label)).toEqual(['Tabs #1 → Label'])
	})

	it('says nothing about the region id, which the editor writes itself', () => {
		expect(missingSettings(tabDescriptor(), tabBlock([{ label: 'Orders' }]))).toEqual(
			[],
		)
	})

	it('leaves an optional setting alone', () => {
		const gaps = missingSettings(
			tabDescriptor(),
			tabBlock([{ slot: 'orders', label: 'Orders' }]),
		)

		expect(gaps).toEqual([])
	})

	it("names the block's own missing option, and the table it reads from", () => {
		const table = descriptorOf(testCatalog(), 'TableView')
		const gaps = missingSettings(table, { name: 'table', type: 'TableView' })

		expect(gaps.map((gap) => gap.label)).toEqual(['Database table'])
	})

	it('reads a gap inside a list entry that takes one of several shapes', () => {
		// A form field carries a key and a type, both required, and its entry in
		// the list is one branch of a union. A walk that stopped at the union saw
		// an entry holding something and reported nothing.
		const form = descriptorOf(testCatalog(), 'Form')
		const gaps = missingSettings(form, {
			name: 'form',
			type: 'Form',
			config: { fields: [{}] },
		})

		expect(gaps.map((gap) => gap.label)).toEqual([
			'Fields #1 → Key',
			'Fields #1 → Type',
		])
		expect(gaps[0]?.path).toEqual(['fields', '0', 'id'])
	})

	it('reads it off the branch the entry belongs to, not the first declared', () => {
		// The same entry as a group: a group needs a key and fields of its own,
		// and says nothing about a type.
		const form = descriptorOf(testCatalog(), 'Form')
		const gaps = missingSettings(form, {
			name: 'form',
			type: 'Form',
			config: { fields: [{ id: 'address', fields: [] }] },
		})

		expect(gaps).toEqual([])
	})
})

describe('Save on a page with a setting left empty', () => {
	async function tabWithNoTitle(): Promise<void> {
		builder.addBlock('Tab')
		// A region that already has its id: the title is the author's to give, and
		// this one has cleared it.
		builder.patchConfig('tab', { items: [{ slot: 'orders' }] })
		await settle()
	}

	it('counts the block in the badge the bar shows', async () => {
		await tabWithNoTitle()
		expect(builder.problems.value).toEqual(['tab'])
	})

	it('names the setting and opens the panel on it rather than asking the engine', async () => {
		await tabWithNoTitle()
		builder.select(null)
		await builder.save()

		expect(backend.calledPaths()).not.toContain('POST /api/builder/page/blocks')
		expect(builder.session.value.selection, 'the block is in front of them').toBe(
			'tab',
		)
		expect(
			describeError(builder.session.value.error!, builder.session.value.draft),
		).toBe(
			'Tabs #1 → Label is still empty. Fill in the settings marked in the panel, then save.',
		)
	})

	it('saves once it is filled in', async () => {
		await tabWithNoTitle()
		builder.patchConfig('tab', { items: [{ slot: 'orders', label: 'Orders' }] })
		await settle()
		await builder.save()

		expect(backend.calledPaths()).toContain('POST /api/builder/page/blocks')
		expect(builder.session.value.error).toBe(null)
	})
})

describe('a refusal the engine words as a compiler error', () => {
	/** Three tabs with no region id, as `tsc` answers for the page they wrote. */
	const refusal: BuilderError = {
		code: 'typecheck_failed',
		diagnostics: [1, 2, 3].map(() => ({
			file: 'pages/sales.ts',
			line: 47,
			message:
				"Property 'slot' is missing in type '{ label: string; }' but required in type 'TabItem'.",
		})),
	}

	it('says it once, in terms of the setting', () => {
		expect(describeError(refusal, null)).toBe(
			'This page cannot be built as it stands: a required setting is missing (slot).',
		)
	})

	it('reads a value of the wrong kind as one', () => {
		const message = describeError(
			{
				code: 'typecheck_failed',
				diagnostics: [
					{
						file: 'pages/sales.ts',
						line: 12,
						message:
							"Type 'string' is not assignable to type 'number'.",
					},
				],
			},
			null,
		)

		expect(message).toBe(
			'This page cannot be built as it stands: a setting holds the wrong kind of value (expected number).',
		)
	})

	it("keeps the module's own wording for whoever wants it, once", () => {
		expect(errorDetail(refusal)).toEqual([
			"pages/sales.ts:47 — Property 'slot' is missing in type '{ label: string; }' but required in type 'TabItem'.",
		])
	})

	it('offers no details for a refusal that carries none', () => {
		expect(errorDetail({ code: 'not_found', ref: '/reports/sales' })).toEqual([])
	})
})

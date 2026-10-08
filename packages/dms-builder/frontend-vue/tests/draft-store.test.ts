import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEEP_DRAFT_MS, storedDraft } from '../app/runtime/draft-store'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import { installFakeHost, type FakeBackend } from './support/builder-harness'

/**
 * The draft kept on the viewer's device: written as it changes, put back the
 * next time the page is edited, forgotten once saved or dropped.
 */

let backend: FakeBackend
let builder: BuilderController
let stored: Map<string, string>

const PAGE = '/reports/sales'

function names(): string[] {
	return (builder.session.value.draft?.blocks ?? []).map((block) => block.name)
}

async function open(): Promise<void> {
	await builder.open(PAGE)
	await vi.advanceTimersByTimeAsync(200)
}

beforeEach(async () => {
	vi.useFakeTimers()
	stored = new Map()
	Object.assign(globalThis, {
		localStorage: {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
			removeItem: (key: string) => stored.delete(key),
		},
	})
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
	await open()
})

afterEach(() => {
	builder.close()
	Object.assign(globalThis, { localStorage: undefined })
	vi.useRealTimers()
})

describe('a draft kept on this device', () => {
	it('outlives the editor, and comes back with the page', async () => {
		builder.addBlock('Text')
		expect(storedDraft(PAGE)?.draft.blocks.map((block) => block.name)).toEqual([
			'title',
			'intro',
			'text',
		])

		builder.close()
		await open()

		expect(names()).toEqual(['title', 'intro', 'text'])
		expect(builder.dirty.value).toBe(true)
		expect(builder.session.value.restored).toMatchObject({ stale: false })
		// Put back as one edit: Undo goes back to the page as saved.
		builder.undo()
		expect(names()).toEqual(['title', 'intro'])
	})

	it('is forgotten once saved', async () => {
		builder.addBlock('Text')
		await builder.save()
		expect(storedDraft(PAGE)).toBeUndefined()
	})

	it('is only offered when the page has moved on since it was made', async () => {
		builder.addBlock('Text')
		builder.close()
		backend.structure = { ...backend.structure, version: 'v7' }
		await open()

		expect(names(), 'nothing laid on a page that changed').toEqual(['title', 'intro'])
		expect(builder.session.value.restored).toMatchObject({ stale: true })

		builder.restoreAnyway()
		expect(names()).toEqual(['title', 'intro', 'text'])
	})

	it('is dropped when leaving without saving, and kept when asked to', async () => {
		builder.addBlock('Text')
		builder.leave()
		await builder.resolveClose(false, true)
		expect(storedDraft(PAGE)).toBeDefined()

		await open()
		builder.leave()
		await builder.resolveClose(false)
		expect(storedDraft(PAGE)).toBeUndefined()
	})

	it('is not trusted past a week', () => {
		builder.addBlock('Text')
		expect(storedDraft(PAGE, Date.now() + KEEP_DRAFT_MS + 1)).toBeUndefined()
	})
})

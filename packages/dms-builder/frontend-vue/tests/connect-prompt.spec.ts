import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ConnectPrompt from '../app/components/ConnectPrompt.vue'
import { DISMISSED_KEY } from '../app/runtime/connect-prompt'
import { ASSISTANT_ACTIONS_KEY } from '../app/runtime/database-build'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import { signedIn, useDmsRoute } from './stubs/frontend-module'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import { findAll, fire, installDocumentStub, mount, textOf, type TestNode } from './support/render'

const host = vi.hoisted(() => ({ onboarded: true, dialogOpen: { value: false } }))

vi.mock('#dms-onboarding/app/composables/onboarding/useOnboarding', () => ({
	useOnboarding: () =>
		host.onboarded ? Promise.resolve({ hasOnboarded: true }) : Promise.resolve({ hasOnboarded: false }),
}))
vi.mock('#dms-ui/app/entries/composables/containers/closingLayers', async () => {
	const { ref: reference } = await import('vue')
	host.dialogOpen = reference(false)
	return { useOpenDialog: () => host.dialogOpen }
})

/**
 * The prompt that asks a developer on a project with no external database
 * whether to connect one: when it shows, what each answer does, and that
 * "not now" is remembered.
 */

let backend: FakeBackend
let builder: BuilderController
let unmount: (() => void) | undefined
let stored: Map<string, string>

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const CONNECTED = [{ id: 'erp', engine: 'postgresql', version: '17', database: 'erp', role: 'reader' }]
const CONNECTIONS = 'GET /api/builder/database/connections'

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(50)
	await nextTick()
}

async function prompt(provide: Array<[symbol, unknown]> = []): Promise<TestNode> {
	const mounted = mount(ConnectPrompt, { provide })
	unmount = mounted.unmount
	await settle()
	return mounted.root
}

function modal(root: TestNode): TestNode {
	return findAll(root, (node) => node.tag === 'UModal')[0]!
}

function action(root: TestNode, name: string): TestNode {
	const match = findAll(root, (node) => node.tag === 'UButton' && node.props['data-action'] === name)[0]
	if (!match) {
		throw new Error(`no ${name} button`)
	}
	return match
}

function isOpen(root: TestNode): boolean {
	return modal(root).props.open === true
}

beforeEach(() => {
	vi.useFakeTimers()
	stored = new Map()
	Object.assign(globalThis, {
		localStorage: {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
		},
	})
	backend = installFakeHost()
	backend.answers[CONNECTIONS] = []
	builder = useBuilder()
	builder.close()
	signedIn.value = true
	host.onboarded = true
	host.dialogOpen.value = false
	useDmsRoute().path = '/home'
})

afterEach(() => {
	unmount?.()
	unmount = undefined
	builder.close()
	Reflect.deleteProperty(globalThis, 'localStorage')
	vi.useRealTimers()
})

describe('when the prompt shows', () => {
	it('opens for a signed-in person past the wizard on a project with nothing connected', async () => {
		const root = await prompt()

		expect(isOpen(root)).toBe(true)
		expect(modal(root).props.title).toBe('Start from a database you already run')
		expect(builder.session.value.active, 'the builder is not opened by it').toBe(false)
	})

	it('stays away from the login page and asks the builder nothing there', async () => {
		signedIn.value = false
		const root = await prompt()

		expect(isOpen(root)).toBe(false)
		expect(backend.calledPaths()).not.toContain(CONNECTIONS)
	})

	it('waits for the wizard, then opens on the first page after it', async () => {
		host.onboarded = false
		useDmsRoute().path = '/onboarding'
		const root = await prompt()
		expect(isOpen(root)).toBe(false)
		expect(backend.calledPaths()).not.toContain(CONNECTIONS)

		host.onboarded = true
		useDmsRoute().path = '/home'
		await settle()
		expect(isOpen(root)).toBe(true)
	})

	it('stays away from a project that already has an external database', async () => {
		backend.answers[CONNECTIONS] = CONNECTED
		const root = await prompt()

		expect(isOpen(root)).toBe(false)
		expect(stored.size, 'nothing is remembered for it').toBe(0)
	})

	it('stays away when the connections cannot be read', async () => {
		backend.answers[CONNECTIONS] = new Error('forbidden')
		const root = await prompt()

		expect(isOpen(root)).toBe(false)
	})

	it('does not stack over another dialog, and opens once it is closed', async () => {
		host.dialogOpen.value = true
		const root = await prompt()
		expect(isOpen(root)).toBe(false)

		host.dialogOpen.value = false
		await settle()
		expect(isOpen(root)).toBe(true)
	})

	it('holds when its own dialog is what the page now shows', async () => {
		const root = await prompt()
		host.dialogOpen.value = true
		await settle()

		expect(isOpen(root)).toBe(true)
	})

	it('stays away while the builder is open', async () => {
		await builder.open('/reports/sales')
		const root = await prompt()

		expect(isOpen(root)).toBe(false)
	})
})

describe('the answers', () => {
	it('"Not now" closes it and stays closed after a reload', async () => {
		const root = await prompt()
		fire(action(root, 'dismiss'), 'click')
		await settle()
		expect(isOpen(root)).toBe(false)
		expect(stored.get(DISMISSED_KEY)).toBe('1')
		expect(builder.session.value.active).toBe(false)

		unmount?.()
		backend.calls.length = 0
		const reloaded = await prompt()
		expect(isOpen(reloaded)).toBe(false)
		expect(backend.calledPaths(), 'a dismissed prompt reads nothing').not.toContain(CONNECTIONS)
	})

	it('Escape, which closes the dialog, counts as "Not now"', async () => {
		const root = await prompt()
		const close = modal(root).props['onUpdate:open'] as (open: boolean) => void
		close(false)
		await settle()

		expect(isOpen(root)).toBe(false)
		expect(stored.get(DISMISSED_KEY)).toBe('1')
	})

	it('a click outside the dialog does not answer for good', async () => {
		const root = await prompt()
		const content = modal(root).props.content as { onInteractOutside: (event: Event) => void }
		const event = new Event('pointerdownoutside', { cancelable: true })
		content.onInteractOutside(event)

		expect(event.defaultPrevented).toBe(true)
		expect(isOpen(root)).toBe(true)
		expect(stored.size).toBe(0)
	})

	it('"Connect a database" opens the builder on the Database workspace with the form asked for', async () => {
		const root = await prompt()
		fire(action(root, 'accept'), 'click')
		await settle()

		expect(builder.session.value.active).toBe(true)
		expect(builder.session.value.workspace).toBe('database')
		expect(builder.session.value.pageRef).toBe('/home')
		expect(builder.session.value.connectRequest).toBe(true)
		expect(isOpen(root)).toBe(false)
		expect(stored.get(DISMISSED_KEY), 'it has been answered').toBe('1')
	})
})

describe('what the second step says', () => {
	function mapText(root: TestNode): string {
		const step = findAll(root, (node) => node.props['data-step'] === 'map')[0]!
		return textOf(step)
	}

	it('describes the assistant mapping when the assistant is available', async () => {
		const root = await prompt([[ASSISTANT_ACTIONS_KEY, { isAvailable: true, startConversation: () => {} }]])

		expect(mapText(root)).toContain('The assistant reads the schema')
	})

	it('describes reviewing the mapping yourself without dms-ai', async () => {
		const root = await prompt()

		expect(mapText(root)).toContain('You review it yourself')
		expect(mapText(root)).not.toContain('assistant')
	})
})

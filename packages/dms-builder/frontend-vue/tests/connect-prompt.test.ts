import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	DISMISSED_KEY,
	type PromptInputs,
	type PromptPhase,
	type PromptState,
	dismissalRemembered,
	needsConnectionsRead,
	phaseOf,
	readOf,
	rememberDismissal,
	shouldShowPrompt,
} from '../app/runtime/connect-prompt'

const ELIGIBLE: PromptInputs = {
	isSignedIn: true,
	hasOnboarded: true,
	onOnboardingRoute: false,
	hasExternalConnection: false,
	isDismissed: false,
	dialogOpen: false,
	builderOpen: false,
}

describe('whether the prompt shows', () => {
	const table: Array<[string, Partial<PromptInputs>, boolean]> = [
		['a signed-in person past the wizard on a project with nothing connected', {}, true],
		['nobody is signed in, as on the login page', { isSignedIn: false }, false],
		['the wizard has not been completed', { hasOnboarded: false }, false],
		['the person is on the wizard', { onOnboardingRoute: true }, false],
		['the project already has an external database', { hasExternalConnection: true }, false],
		['"not now" was already said in this browser', { isDismissed: true }, false],
		['another dialog covers the page', { dialogOpen: true }, false],
		['the builder is open', { builderOpen: true }, false],
		['the wizard is open and nobody is signed in', { onOnboardingRoute: true, isSignedIn: false }, false],
	]

	it.each(table)('%s', (_name, change, expected) => {
		expect(shouldShowPrompt({ ...ELIGIBLE, ...change })).toBe(expected)
	})

	it('names every input: one more condition cannot slip in untested', () => {
		const stoppers = Object.keys(ELIGIBLE).filter((key) => {
			const flipped = { ...ELIGIBLE, [key]: !ELIGIBLE[key as keyof PromptInputs] }
			return !shouldShowPrompt(flipped)
		})
		expect(stoppers.sort()).toEqual(Object.keys(ELIGIBLE).sort())
	})
})

const STATE: PromptState = {
	isSignedIn: true,
	hasOnboarded: true,
	onOnboardingRoute: false,
	isDismissed: false,
	dialogOpen: false,
	builderOpen: false,
	read: 'none',
	accepted: false,
}

describe('the phase the prompt is in', () => {
	const table: Array<[string, Partial<PromptState>, PromptPhase, PromptPhase?]> = [
		['reading the connections of a person it could be shown to', { read: 'pending' }, 'checking'],
		['nothing connected', {}, 'open'],
		['an external database connected', { read: 'external' }, 'hidden'],
		['a read that failed stays hidden', { read: 'failed' }, 'hidden'],
		['not signed in, whatever was read', { isSignedIn: false, read: 'pending' }, 'hidden'],
		['before the wizard is done, whatever was read', { hasOnboarded: false, read: 'pending' }, 'hidden'],
		['dismissed in this browser', { isDismissed: true }, 'dismissed'],
		['said yes, the builder opening', { accepted: true, isDismissed: true }, 'connecting'],
		['another dialog opens before the prompt does', { dialogOpen: true }, 'hidden', 'hidden'],
		['its own dialog opens while it is open', { dialogOpen: true }, 'open', 'open'],
		['the builder opens while it is open', { builderOpen: true }, 'hidden', 'open'],
	]

	it.each(table)('%s', (_name, change, expected, from) => {
		expect(phaseOf({ ...STATE, ...change }, from)).toBe(expected)
	})

	it('asks the builder for nothing until the prompt could show', () => {
		expect(needsConnectionsRead({ ...STATE, isSignedIn: false })).toBe(false)
		expect(needsConnectionsRead({ ...STATE, onOnboardingRoute: true })).toBe(false)
		expect(needsConnectionsRead({ ...STATE, isDismissed: true })).toBe(false)
		expect(needsConnectionsRead(STATE)).toBe(true)
	})
})

describe('what counts as an external connection', () => {
	it('is any connection the builder lists, even one that fails to answer', () => {
		expect(readOf([])).toBe('none')
		expect(readOf([{ id: 'erp', engine: 'postgresql', version: '17', database: 'erp', role: 'r' }])).toBe('external')
		expect(readOf([{ id: 'erp', error: 'connection refused' }])).toBe('external')
	})
})

describe('the dismissal', () => {
	let stored: Map<string, string>

	beforeEach(() => {
		stored = new Map()
		Object.assign(globalThis, {
			localStorage: {
				getItem: (key: string) => stored.get(key) ?? null,
				setItem: (key: string, value: string) => stored.set(key, value),
			},
		})
	})

	afterEach(() => {
		Reflect.deleteProperty(globalThis, 'localStorage')
	})

	it('is kept in this browser under the builder prefix', () => {
		expect(dismissalRemembered()).toBe(false)
		rememberDismissal()
		expect(dismissalRemembered()).toBe(true)
		expect([...stored.keys()]).toEqual([DISMISSED_KEY])
		expect(DISMISSED_KEY.startsWith('dms-builder:')).toBe(true)
	})

	it('reads as not dismissed, and writes nothing, in a browser that refuses storage', () => {
		Object.assign(globalThis, {
			localStorage: {
				getItem: () => {
					throw new Error('denied')
				},
				setItem: () => {
					throw new Error('denied')
				},
			},
		})
		expect(dismissalRemembered()).toBe(false)
		expect(() => rememberDismissal()).not.toThrow()
	})
})

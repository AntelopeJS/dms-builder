/**
 * The question asked of a developer whose project has no external database:
 * whether to connect one.
 *
 * One state machine decides what is on screen. `checking` while the project's
 * connections are being read, then `hidden` or `open`; `dismissed` once the
 * developer has answered "not now", and `connecting` while the builder opens on
 * the connect form. The answer is remembered in this browser only, under the
 * same `dms-builder:` prefix as the builder's other choices.
 */
import type { DatabaseConnection } from './database-types'

export type PromptPhase = 'checking' | 'hidden' | 'open' | 'dismissed' | 'connecting'

/** What the connections read answered, when it has. */
export type ConnectionsRead = 'pending' | 'failed' | 'none' | 'external'

/** What the page and the host say, none of it the prompt's own. */
export interface PromptInputs {
	isSignedIn: boolean
	hasOnboarded: boolean
	onOnboardingRoute: boolean
	hasExternalConnection: boolean
	isDismissed: boolean
	/** Another dialog is open on the page. Never this prompt's own. */
	dialogOpen: boolean
	builderOpen: boolean
}

export interface PromptState extends Omit<PromptInputs, 'hasExternalConnection'> {
	read: ConnectionsRead
	/** The developer said yes and the builder is opening. */
	accepted: boolean
}

export const DISMISSED_KEY = 'dms-builder:connect-prompt-dismissed'

/**
 * Whether the prompt belongs on screen: a signed-in person past the setup
 * wizard, on a project with no external database, who has not said "not now",
 * with nothing else covering the page.
 */
export function shouldShowPrompt(inputs: PromptInputs): boolean {
	return (
		inputs.isSignedIn &&
		inputs.hasOnboarded &&
		!inputs.onOnboardingRoute &&
		!inputs.hasExternalConnection &&
		!inputs.isDismissed &&
		!inputs.dialogOpen &&
		!inputs.builderOpen
	)
}

/**
 * Whether the connections have to be read before the prompt can be decided:
 * only for a person it could be shown to, so a login page or the wizard asks
 * the builder's owner-only route nothing.
 */
export function needsConnectionsRead(state: PromptState): boolean {
	return state.isSignedIn && state.hasOnboarded && !state.onOnboardingRoute && !state.isDismissed
}

/**
 * The phase a state is in. A failed read stays `hidden`: the prompt asks only
 * when it knows the project has nothing connected. Once open it holds through
 * another dialog appearing (its own is one), and leaves only when asked to.
 */
export function phaseOf(state: PromptState, current: PromptPhase = 'hidden'): PromptPhase {
	if (state.accepted) {
		return 'connecting'
	}
	if (state.isDismissed) {
		return 'dismissed'
	}
	if (!needsConnectionsRead(state)) {
		return 'hidden'
	}
	if (state.read === 'pending') {
		return 'checking'
	}
	if (state.read === 'failed') {
		return 'hidden'
	}
	return shouldShowPrompt({
		isSignedIn: state.isSignedIn,
		hasOnboarded: state.hasOnboarded,
		onOnboardingRoute: state.onOnboardingRoute,
		hasExternalConnection: state.read === 'external',
		isDismissed: state.isDismissed,
		dialogOpen: current === 'open' ? false : state.dialogOpen,
		builderOpen: state.builderOpen,
	})
		? 'open'
		: 'hidden'
}

/**
 * The builder's catalog connections are the external databases the project
 * declares for it. The project's own database is never one of them, so any
 * listed connection counts, including one that currently fails to answer.
 */
export function readOf(connections: readonly DatabaseConnection[]): ConnectionsRead {
	return connections.length > 0 ? 'external' : 'none'
}

function storage(): Storage | undefined {
	try {
		return globalThis.localStorage
	} catch {
		return undefined
	}
}

export function dismissalRemembered(): boolean {
	try {
		return storage()?.getItem(DISMISSED_KEY) === '1'
	} catch {
		return false
	}
}

export function rememberDismissal(): void {
	try {
		storage()?.setItem(DISMISSED_KEY, '1')
	} catch {
		return
	}
}

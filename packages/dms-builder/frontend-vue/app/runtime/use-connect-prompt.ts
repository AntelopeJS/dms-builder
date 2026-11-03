import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useDmsRoute, useDmsUserSession } from '#dms/frontend-module'
import { useOnboarding } from '#dms-onboarding/app/composables/onboarding/useOnboarding'
import { useOpenDialog } from '#dms-ui/app/entries/composables/containers/closingLayers'
import { useBuilderApi } from './api'
import {
	type ConnectionsRead,
	type PromptPhase,
	type PromptState,
	dismissalRemembered,
	needsConnectionsRead,
	phaseOf,
	readOf,
	rememberDismissal,
} from './connect-prompt'
import { useBuilder } from './session'

/** The route the setup wizard lives under; the DMS's own onboarding middleware sends a project nobody has set up there. */
const ONBOARDING_PATH = '/onboarding'

export interface ConnectPrompt {
	phase: Readonly<Ref<PromptPhase>>
	/** Said yes: the builder opens on the Database workspace with the connect form showing. */
	accept: () => Promise<void>
	/** Said not now: the prompt is not asked again in this browser. */
	dismiss: () => void
}

/**
 * Reads the host into the prompt's state machine: who is signed in and past the
 * wizard, where they are, whether another dialog covers the page and whether the
 * project has an external database. It reads the connections once per run of
 * conditions that could show the prompt, and a read that fails leaves it hidden.
 */
export function useConnectPrompt(): ConnectPrompt {
	const builder = useBuilder()
	const api = useBuilderApi()
	const route = useDmsRoute()
	const { loggedIn } = useDmsUserSession()
	const dialogOpen = useOpenDialog()

	const hasOnboarded = ref(false)
	const read = ref<ConnectionsRead>('pending')
	const dismissed = ref(dismissalRemembered())
	const accepted = ref(false)
	const phase = ref<PromptPhase>('hidden')

	const state: ComputedRef<PromptState> = computed(() => ({
		isSignedIn: loggedIn.value,
		hasOnboarded: hasOnboarded.value,
		onOnboardingRoute: route.path.startsWith(ONBOARDING_PATH),
		isDismissed: dismissed.value,
		dialogOpen: dialogOpen.value,
		builderOpen: builder.session.value.active,
		read: read.value,
		accepted: accepted.value,
	}))

	async function refreshOnboarding(): Promise<void> {
		hasOnboarded.value = await useOnboarding().then(
			(info) => info.hasOnboarded,
			() => false,
		)
	}

	let reads = 0
	async function readConnections(): Promise<void> {
		reads += 1
		const mine = reads
		read.value = 'pending'
		const next = await api.databaseConnections().then(readOf, (): ConnectionsRead => 'failed')
		if (mine === reads) {
			read.value = next
		}
	}

	watch(() => route.path, refreshOnboarding, { immediate: true })
	watch(
		() => needsConnectionsRead(state.value),
		(needed) => {
			if (needed) {
				void readConnections()
			}
		},
		{ immediate: true },
	)
	watch(
		state,
		(next) => {
			phase.value = phaseOf(next, phase.value)
		},
		{ immediate: true },
	)

	function dismiss(): void {
		rememberDismissal()
		dismissed.value = true
	}

	async function accept(): Promise<void> {
		rememberDismissal()
		dismissed.value = true
		accepted.value = true
		try {
			await builder.connectDatabase(route.path)
		} finally {
			accepted.value = false
		}
	}

	return { phase, accept, dismiss }
}

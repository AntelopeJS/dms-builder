<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBuilderApi } from '../runtime/api'
import { connectionUrl, detailsFields, keepsServer, refusalText } from '../runtime/database-connect'
import type { ConnectionInfo } from '../runtime/database-types'

/**
 * *Edit connection*: the details the connection's URL holds, filled from `.env`
 * without the password. An empty password keeps the current one while the host,
 * port and user stay the same; another server needs its own. The new URL
 * goes into `.env`, and the project reconnects once it restarts.
 */

const props = defineProps<{ connection: string; info: ConnectionInfo }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const api = useBuilderApi()

const saved = props.info.details ? detailsFields('postgres', props.info.details) : null
const fields = ref(saved ? { ...saved, options: { ...saved.options } } : null)
const busy = ref(false)
const problem = ref('')
const done = ref(false)
const extraOptions = computed(() => Object.entries(fields.value?.options ?? {}))
const keepsPassword = computed(
	() => !!saved && !!fields.value && !!props.info.details?.hasPassword && keepsServer(saved, fields.value),
)
const needsPassword = computed(
	() => !!fields.value && !!props.info.details?.hasPassword && !keepsPassword.value && !fields.value.password,
)

async function save(): Promise<void> {
	if (!fields.value) return
	busy.value = true
	problem.value = ''
	const result = await api.setConnectionUrl(
		props.connection,
		connectionUrl('postgres', fields.value, `${props.info.details?.scheme ?? 'postgres'}:`),
	)
	fields.value.password = ''
	busy.value = false
	if (!result.ok) {
		problem.value = refusalText(result.error)
		return
	}
	done.value = true
	emit('saved')
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
		<header>
			<p class="text-xl font-semibold tracking-tight text-highlighted">Edit {{ connection }}</p>
			<p class="text-xs text-muted">
				How the project reaches the database, saved in <span class="font-mono">.env</span> as
				<span class="font-mono">{{ info.wiring.variable }}</span>.
			</p>
		</header>

		<p v-if="!fields" class="text-xs text-error">
			The connection's URL could not be read from <span class="font-mono">.env</span>.
		</p>

		<template v-else-if="!done">
			<section class="flex flex-col gap-3 rounded-md border border-default p-3">
				<div class="grid grid-cols-[1fr_8rem] gap-3">
					<UFormField label="Host">
						<UInput v-model="fields.host" class="w-full font-mono" />
					</UFormField>
					<UFormField label="Port">
						<UInput v-model="fields.port" inputmode="numeric" placeholder="default" class="w-full font-mono" />
					</UFormField>
				</div>
				<div class="grid grid-cols-3 gap-3">
					<UFormField label="Database">
						<UInput v-model="fields.database" class="w-full font-mono" />
					</UFormField>
					<UFormField label="User">
						<UInput v-model="fields.user" autocomplete="off" class="w-full font-mono" />
					</UFormField>
					<UFormField
						label="Password"
						:help="keepsPassword ? 'Leave empty to keep it.' : needsPassword ? 'Another server or user: enter its password.' : undefined"
					>
						<UInput
							v-model="fields.password"
							type="password"
							autocomplete="new-password"
							:placeholder="keepsPassword ? 'Unchanged' : ''"
							class="w-full font-mono"
						/>
					</UFormField>
				</div>
				<div class="flex items-center gap-3">
					<USwitch v-model="fields.ssl" aria-label="Connect over SSL" />
					<span class="text-sm text-default">Connect over SSL</span>
				</div>
				<p v-if="extraOptions.length" class="text-xs text-muted">
					Other options, kept:
					<span class="font-mono">{{ extraOptions.map(([key, value]) => `${key}=${value}`).join(', ') }}</span>
				</p>
			</section>

			<p v-if="problem" class="text-xs text-error">{{ problem }}</p>

			<div class="flex items-center gap-2">
				<UButton :label="busy ? 'Saving…' : 'Save'" :disabled="busy || !fields.host || !fields.database || needsPassword" @click="save" />
				<UButton label="Cancel" color="neutral" variant="ghost" @click="emit('close')" />
			</div>
		</template>

		<div
			v-else
			class="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-toned"
			data-connection-saved
		>
			<p><b class="font-semibold text-highlighted">Saved. Restart the project.</b></p>
			<p>The project reconnects with the new details once it restarts.</p>
			<div>
				<UButton label="Done" size="sm" @click="emit('close')" />
			</div>
		</div>
	</div>
</template>

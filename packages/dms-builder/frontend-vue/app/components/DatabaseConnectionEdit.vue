<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBuilderApi } from '../runtime/api'
import {
	ENGINES,
	connectionUrl,
	detailsFields,
	engineOfScheme,
	fieldProblem,
	keepsServer,
	refusalText,
} from '../runtime/database-connect'
import type { ConnectionInfo } from '../runtime/database-types'
import { t } from '../runtime/i18n'

/**
 * *Edit connection*: the details the connection's URL holds, filled from `.env`
 * without the password. An empty password keeps the current one while the host,
 * port and user stay the same; another server needs its own. The new URL
 * goes into `.env`; the project reloads on it, which the build screen the panel
 * shows next follows.
 */

const props = defineProps<{ connection: string; info: ConnectionInfo }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const api = useBuilderApi()

const saved = props.info.details ? detailsFields(props.info.details) : null
const fields = ref(saved ? { ...saved, options: { ...saved.options } } : null)
const busy = ref(false)
const problem = ref('')
const scheme = `${props.info.details?.scheme ?? 'postgres'}:`
const engine = engineOfScheme(scheme) ?? 'postgres'
const extraOptions = computed(() => Object.entries(fields.value?.options ?? {}))
const keepsPassword = computed(
	() => !!saved && !!fields.value && !!props.info.details?.hasPassword && keepsServer(saved, fields.value),
)
const invalid = computed(() => (fields.value ? fieldProblem(engine, fields.value) : undefined))
const needsPassword = computed(
	() =>
		!!fields.value &&
		!!fields.value.user.trim() &&
		!!props.info.details?.hasPassword &&
		!keepsPassword.value &&
		!fields.value.password,
)

async function save(): Promise<void> {
	if (!fields.value) return
	busy.value = true
	problem.value = ''
	const result = await api.setConnectionUrl(
		props.connection,
		connectionUrl(engine, fields.value, scheme),
	)
	busy.value = false
	if (!result.ok) {
		problem.value = refusalText(result.error)
		return
	}
	fields.value.password = ''
	emit('saved')
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
		<header>
			<p class="text-xl font-semibold tracking-tight text-highlighted">{{ t('database.edit.title', { connection }) }}</p>
			<p class="text-xs text-muted">{{ t('database.edit.intro', { variable: info.wiring.variable }) }}</p>
		</header>

		<p v-if="!fields" class="text-xs text-error">
			{{ t('database.edit.unreadable') }}
		</p>

		<template v-else>
			<section class="flex flex-col gap-3 rounded-md border border-default p-3">
				<div class="grid grid-cols-[1fr_8rem] gap-3">
					<UFormField :label="t('database.connect.host')">
						<UInput v-model="fields.host" class="w-full font-mono" />
					</UFormField>
					<UFormField :label="t('database.connect.port')">
						<UInput v-model="fields.port" inputmode="numeric" :placeholder="t('database.edit.port_placeholder')" class="w-full font-mono" />
					</UFormField>
				</div>
				<div class="grid grid-cols-3 gap-3">
					<UFormField
						:label="t('database.connect.database')"
						:help="ENGINES[engine].separateDatabase ? t('database.edit.database_help') : undefined"
					>
						<UInput
							v-model="fields.database"
							:disabled="ENGINES[engine].separateDatabase"
							class="w-full font-mono"
						/>
					</UFormField>
					<UFormField :label="t('database.connect.user')">
						<UInput v-model="fields.user" autocomplete="off" class="w-full font-mono" />
					</UFormField>
					<UFormField
						:label="t('database.connect.password')"
						:help="keepsPassword ? t('database.edit.password_keep') : needsPassword ? t('database.edit.password_needed') : undefined"
					>
						<UInput
							v-model="fields.password"
							type="password"
							autocomplete="new-password"
							:placeholder="keepsPassword ? t('database.edit.password_unchanged') : ''"
							class="w-full font-mono"
						/>
					</UFormField>
				</div>
				<div v-if="ENGINES[engine].sslMode" class="flex items-center gap-3">
					<USwitch v-model="fields.ssl" :aria-label="t('database.connect.ssl')" />
					<span class="text-sm text-default">{{ t('database.connect.ssl') }}</span>
				</div>
				<p v-if="extraOptions.length" class="text-xs text-muted">
					{{ t('database.edit.options') }}
					<span class="font-mono">{{ extraOptions.map(([key, value]) => `${key}=${value}`).join(', ') }}</span>
				</p>
			</section>

			<p v-if="problem" class="text-xs text-error">{{ problem }}</p>
			<p v-else-if="invalid" class="text-xs text-error">{{ t('database.connect.check', { problem: invalid }) }}</p>

			<div class="flex items-center gap-2">
				<UButton
					:label="busy ? t('database.edit.saving') : t('database.edit.save')"
					:disabled="busy || !fields.host.trim() || !fields.database || needsPassword || !!invalid"
					@click="save"
				/>
				<UButton :label="t('database.connect.cancel')" color="neutral" variant="ghost" @click="emit('close')" />
			</div>
		</template>
	</div>
</template>

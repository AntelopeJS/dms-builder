<script setup lang="ts">
import { computed } from 'vue'
import { TABLE_ROUTES } from '../runtime/constants'
import { useBuilder } from '../runtime/session'

const GROUPS = [
	{ label: 'Read', writes: false },
	{ label: 'Write', writes: true },
]

const props = defineProps<{ resource: string }>()

const builder = useBuilder()
const session = builder.session

const structure = computed(() => session.value.resourceStructures[props.resource])
const writing = computed(() => session.value.pending.includes(props.resource))
/** What the table serves; a structure naming none serves them all. */
const served = computed(
	() => structure.value?.routes ?? TABLE_ROUTES.map((entry) => entry.key),
)

function serves(route: string): boolean {
	return served.value.includes(route)
}

function routesOf(writes: boolean) {
	return TABLE_ROUTES.filter((entry) => entry.writes === writes)
}

function toggle(route: string): void {
	const next = serves(route)
		? served.value.filter((entry) => entry !== route)
		: [...new Set([...served.value, route])]
	// A table with no route serves nothing; the engine refuses it anyway.
	if (next.length === 0) return
	void builder.configureResource(props.resource, next)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<p class="text-xs leading-relaxed text-muted">
			Served under
			<code class="rounded bg-accented px-1.5 py-px font-mono text-toned">{{
				structure?.route
			}}</code
			>. Each switch is one HTTP route; at least one stays on.
		</p>

		<div
			v-for="group in GROUPS"
			:key="group.label"
			class="overflow-hidden rounded-lg border border-default"
		>
			<div
				class="flex h-9 items-center justify-between bg-elevated px-3 text-xs"
			>
				<span class="font-semibold text-toned">{{ group.label }}</span>
				<span class="text-muted">
					{{ routesOf(group.writes).filter((entry) => serves(entry.key)).length }}
					of {{ routesOf(group.writes).length }} on
				</span>
			</div>
			<div
				v-for="entry in routesOf(group.writes)"
				:key="entry.key"
				class="flex items-center gap-4 border-t border-default px-3 py-2.5"
			>
				<div class="min-w-0 flex-1">
					<p class="text-[13px] text-default">{{ entry.label }}</p>
					<p class="text-xs text-muted">{{ entry.help }}</p>
				</div>
				<USwitch
					:model-value="serves(entry.key)"
					:disabled="writing || (serves(entry.key) && served.length === 1)"
					:aria-label="entry.label"
					@update:model-value="toggle(entry.key)"
				/>
			</div>
		</div>
	</div>
</template>

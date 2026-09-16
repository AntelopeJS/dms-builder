<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ICON_PREFIXES, ICON_SEARCH_LIMIT, ICON_SEARCH_URL } from '../runtime/constants'

const props = defineProps<{
	modelValue?: string
	placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string | undefined] }>()

const query = ref('')
const results = ref<string[]>([])
const searching = ref(false)
const offline = ref(false)
let debounce: ReturnType<typeof setTimeout> | undefined

// The frontend bundles Phosphor and Lucide only, so an icon from any other
// collection would resolve to nothing. The search is scoped to those two rather
// than offering names that cannot render.
const known = computed(
	() =>
		!props.modelValue ||
		ICON_PREFIXES.some((prefix) => props.modelValue?.startsWith(`i-${prefix}-`)),
)

/** `i-ph-house` → `{ prefixes: "ph", query: "house" }`, else a plain search. */
function searchParams(text: string): { prefixes: string; query: string } {
	const bare = text.replace(/^i-/, '')
	const prefix = ICON_PREFIXES.find((entry) => bare.startsWith(`${entry}-`))
	return {
		prefixes: prefix ?? ICON_PREFIXES.join(','),
		query: prefix ? bare.slice(prefix.length + 1) : bare,
	}
}

async function search(text: string): Promise<void> {
	const params = searchParams(text.trim())
	if (params.query.length < 2) {
		results.value = []
		return
	}
	searching.value = true
	try {
		const url = `${ICON_SEARCH_URL}?query=${encodeURIComponent(params.query)}&prefixes=${params.prefixes}&limit=${ICON_SEARCH_LIMIT}`
		const answer = (await $fetch<{ icons?: string[] }>(url)) ?? {}
		results.value = (answer.icons ?? []).map(
			(name) => `i-${name.replace(':', '-')}`,
		)
		offline.value = false
	} catch {
		// Searching needs the Iconify API; typing a name by hand does not.
		results.value = []
		offline.value = true
	} finally {
		searching.value = false
	}
}

watch(query, (text) => {
	clearTimeout(debounce)
	debounce = setTimeout(() => void search(text), 250)
})

function pick(name: string): void {
	emit('update:modelValue', name)
	query.value = ''
	results.value = []
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<div class="flex items-center gap-2">
			<span
				class="flex size-8 shrink-0 items-center justify-center rounded-md border border-default"
			>
				<UIcon
					v-if="modelValue"
					:name="modelValue"
					class="size-4 text-default"
				/>
				<UIcon v-else name="i-ph-image" class="size-4 text-dimmed" />
			</span>
			<UInput
				:model-value="modelValue"
				:placeholder="placeholder ?? 'i-ph-file'"
				size="sm"
				class="flex-1"
				@update:model-value="
					emit('update:modelValue', $event === '' ? undefined : String($event))
				"
			/>
		</div>

		<UInput
			v-model="query"
			icon="i-ph-magnifying-glass"
			size="sm"
			placeholder="Search Phosphor and Lucide…"
			:loading="searching"
		/>

		<div v-if="results.length" class="grid grid-cols-8 gap-1">
			<button
				v-for="name in results"
				:key="name"
				type="button"
				class="flex items-center justify-center rounded-md border border-default p-1.5 hover:border-primary hover:text-primary"
				:title="name"
				@click="pick(name)"
			>
				<UIcon :name="name" class="size-4" />
			</button>
		</div>

		<p v-if="offline" class="text-xs text-dimmed">
			Icon search is unavailable — type a name such as
			<code>i-ph-house</code> instead.
		</p>
		<p v-else-if="!known" class="text-xs text-warning">
			Only <code>i-ph-*</code> and <code>i-lucide-*</code> icons are bundled;
			this one will not render.
		</p>
	</div>
</template>

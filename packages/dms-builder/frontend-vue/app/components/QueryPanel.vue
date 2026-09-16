<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useBuilder } from '../runtime/session'

const builder = useBuilder()
const session = builder.session

const name = ref('')
const editing = ref<string | null>(null)
const resource = ref<string | undefined>(undefined)
const template = ref('count')
const field = ref<string | undefined>(undefined)
const op = ref('sum')

const queries = computed(() => session.value.structure?.queries ?? [])
const templates = computed(() => session.value.queryTemplates)
const needsField = computed(() => template.value === 'aggregate')
const fields = computed(() =>
	(session.value.resourceFields[resource.value ?? ''] ?? []).map((entry) => ({
		label: entry,
		value: entry,
	})),
)

onMounted(() => {
	void builder.loadQueryTemplates()
})

function startEdit(query: {
	name: string
	resource?: string
	template?: string
	params?: Record<string, unknown>
}): void {
	editing.value = query.name
	name.value = query.name
	resource.value = query.resource
	template.value = query.template ?? 'count'
	op.value = (query.params?.op as string) ?? 'sum'
	field.value = query.params?.field as string | undefined
	if (query.resource) void builder.loadResourceFields(query.resource)
}

function pickResource(value: string): void {
	resource.value = value
	void builder.loadResourceFields(value)
}

const valid = computed(
	() =>
		!!name.value.trim() &&
		!!resource.value &&
		(!needsField.value || !!field.value),
)

async function submit(): Promise<void> {
	if (!valid.value || !resource.value) return
	const input = {
		name: name.value.trim(),
		resource: resource.value,
		template: template.value,
		params: needsField.value ? { op: op.value, field: field.value } : {},
	}
	if (editing.value) {
		await builder.configureQuery(
			`${session.value.pageRef}@${editing.value}`,
			input,
		)
		editing.value = null
	} else {
		await builder.addQuery(input)
	}
	name.value = ''
}

function endpointOf(query: { endpoint: string }): string {
	return `${session.value.pageRef ?? ''}${query.endpoint}`
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-2">
			<p class="text-sm font-semibold text-highlighted">
				Queries on this page
			</p>
			<div
				v-for="query in queries"
				:key="query.name"
				class="flex items-center gap-2 rounded-md border border-default p-2.5"
			>
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-medium text-default">
						{{ query.name }}
					</p>
					<p class="truncate font-mono text-xs text-dimmed">
						{{ endpointOf(query) }}
					</p>
				</div>
				<UButton
					icon="i-ph-pencil-simple"
					size="xs"
					color="neutral"
					variant="ghost"
					:disabled="query.opaque"
					aria-label="Edit the query"
					@click="startEdit(query)"
				/>
				<UBadge
					v-if="query.opaque"
					size="xs"
					color="warning"
					variant="subtle"
					label="hand-written"
				/>
				<UButton
					icon="i-ph-trash"
					size="xs"
					color="error"
					variant="ghost"
					aria-label="Remove the query"
					@click="builder.removeQuery(`${session.pageRef}@${query.name}`)"
				/>
			</div>
			<p v-if="!queries.length" class="text-sm text-dimmed">
				No query yet. Cards read their value from one.
			</p>
		</div>

		<div class="flex flex-col gap-2 border-t border-default pt-4">
			<p class="text-sm font-semibold text-highlighted">
				{{ editing ? `Edit ${editing}` : 'New query' }}
			</p>
			<UInput v-model="name" size="sm" placeholder="inStockCount" />
			<USelectMenu
				:model-value="resource"
				:items="
					session.resources.map((entry) => ({
						label: entry.ref,
						value: entry.ref,
					}))
				"
				value-key="value"
				placeholder="Resource…"
				@update:model-value="pickResource($event)"
			/>
			<USelectMenu
				v-model="template"
				:items="
					templates.map((entry) => ({ label: entry.title, value: entry.id }))
				"
				value-key="value"
				placeholder="Template…"
			/>
			<template v-if="needsField">
				<USelectMenu
					v-model="op"
					:items="['sum', 'avg', 'min', 'max']"
					placeholder="Operation…"
				/>
				<USelectMenu
					:model-value="field"
					:items="fields"
					value-key="value"
					placeholder="Numeric field…"
					@update:model-value="field = $event"
				/>
			</template>
			<div class="flex gap-2">
				<UButton
					size="xs"
					color="primary"
					:label="editing ? 'Save the query' : 'Add the query'"
					:disabled="!valid"
					@click="submit"
				/>
				<UButton
					v-if="editing"
					size="xs"
					color="neutral"
					variant="ghost"
					label="Cancel"
					@click="editing = null"
				/>
			</div>
			<p class="text-xs text-dimmed">
				Writes the route and the model method, then exposes the endpoint for a
				card to read.
			</p>
		</div>
	</div>
</template>

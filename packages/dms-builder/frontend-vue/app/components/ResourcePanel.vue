<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dataTypeItems } from '../runtime/catalog'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import type { ResourceFieldStructure } from '../runtime/types'

interface Aspect {
	key:
		| 'listable'
		| 'selectable'
		| 'filterable'
		| 'sortable'
		| 'searchable'
		| 'required'
		| 'exported'
	label: string
	help: string
}

const MANDATORY_ROUTES = ['new', 'edit'] as const

const ASPECTS: Aspect[] = [
	{
		key: 'listable',
		label: 'Visible by default',
		help: 'Shown in the table on first load.',
	},
	{
		key: 'selectable',
		label: 'In option lists',
		help: 'Offered when another resource picks a row of this one.',
	},
	{
		key: 'filterable',
		label: 'Filterable',
		help: "Usable in the table's filters.",
	},
	{ key: 'sortable', label: 'Sortable', help: 'Usable to sort the table.' },
	{
		key: 'searchable',
		label: 'Searchable',
		help: "Read by the table's search bar.",
	},
	{ key: 'required', label: 'Required', help: 'A row cannot be saved without it.' },
	{
		key: 'exported',
		label: 'In export',
		help: "Carried by the resource's CSV export.",
	},
]

const builder = useBuilder()
const { advanced: advancedMode } = useBuilderMode()
const session = builder.session

const picked = ref<string | undefined>(undefined)
const open = ref<string | null>(null)
const newName = ref('')
const adding = ref(false)
/**
 * The deletion waiting on a second click, as `field:<name>` or `resource`.
 * Either one drops data for good — a field its column, a resource its table
 * and every row in it — so neither goes on the first click.
 */
const confirming = ref<string | null>(null)

const ROUTES = [
	{ key: 'list', label: 'List' },
	{ key: 'get', label: 'Read' },
	{ key: 'create', label: 'Create' },
	{ key: 'edit', label: 'Update' },
	{ key: 'delete', label: 'Delete' },
	{ key: 'select', label: 'Option lists' },
	{ key: 'archive', label: 'Archive' },
	{ key: 'export', label: 'Export' },
] as const

const current = computed(
	() => picked.value ?? builder.selected.value?.controller ?? undefined,
)
const structure = computed(() =>
	current.value ? session.value.resourceStructures[current.value] : undefined,
)
const fields = computed(() => structure.value?.fields ?? [])
const dataTypes = computed(() => dataTypeItems(session.value.catalog))

const usedBy = computed(() => {
	const ref_ = current.value
	const draft = session.value.draft
	if (!ref_ || !draft) {
		return 0
	}
	let count = 0
	const visit = (blocks: typeof draft.blocks): void => {
		for (const block of blocks) {
			if (block.controller === ref_) count += 1
			if (block.children) visit(block.children)
		}
	}
	visit(draft.blocks)
	return count
})

watch(
	current,
	(ref_) => {
		confirming.value = null
		if (ref_) void builder.loadResource(ref_)
	},
	{ immediate: true },
)

function aspect(field: ResourceFieldStructure, key: Aspect['key']): boolean {
	return (field as unknown as Record<string, unknown>)[key] === true
}

function writing(name: string): boolean {
	return session.value.pending.includes(`${current.value}#${name}`)
}

function patch(name: string, patchValue: Record<string, unknown>): void {
	if (current.value) {
		void builder.configureField(`${current.value}#${name}`, patchValue)
	}
}

function toggleMandatory(
	field: ResourceFieldStructure,
	route: string,
): void {
	const current = field.mandatory ?? []
	const next = current.includes(route)
		? current.filter((entry) => entry !== route)
		: [...current, route]
	patch(field.name, { mandatory: next })
}

async function create(): Promise<void> {
	const name = newName.value.trim()
	if (!name) return
	const created = await builder.createResource(name, [
		{
			name: 'title',
			dataType: { $dataType: 'string' },
			label: 'Title',
			listable: true,
			selectable: true,
			searchable: true,
		},
	])
	if (!created) return
	picked.value = created
	newName.value = ''
	adding.value = true
}

function removeField(name: string): void {
	confirming.value = null
	void builder.removeField(`${current.value}#${name}`)
}

async function removeResource(): Promise<void> {
	const ref_ = current.value
	confirming.value = null
	if (ref_ && (await builder.deleteResource(ref_))) {
		picked.value = undefined
	}
}

function served(route: string): boolean {
	const routes = structure.value?.routes
	return !routes || routes.includes(route)
}

function toggleRoute(route: string): void {
	const known = structure.value
	const ref_ = current.value
	if (!known || !ref_) return
	const all = known.routes ?? ROUTES.map((entry) => entry.key as string)
	const next = served(route)
		? all.filter((entry) => entry !== route)
		: [...new Set([...all, route])]
	// A resource with no route serves nothing; the engine refuses it anyway.
	if (next.length === 0) return
	void builder.configureResource(ref_, next)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<label class="text-sm font-medium text-default">Table</label>
			<USelectMenu
				:model-value="current"
				:items="
					session.resources.map((entry) => ({
						label: entry.ref,
						value: entry.ref,
					}))
				"
				value-key="value"
				placeholder="Choose a table…"
				:disabled="!session.resources.length"
				@update:model-value="picked = $event"
			/>
			<p v-if="!session.resources.length" class="text-xs text-dimmed">
				No table yet — create the first one below.
			</p>
		</div>

		<div
			v-if="structure"
			class="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning"
		>
			<UIcon name="i-ph-info" class="mt-0.5 size-4 shrink-0" />
			<div>
				<p class="font-semibold">Imported from {{ structure.tableName }}</p>
				<p class="mt-0.5 opacity-90">
					These fields are the table's own schema. Removing one here drops the
					column and the data it holds — it is not a display setting.
					<b>Changes here are written as you make them</b>, unlike the page's
					blocks, which wait for Save.
					<template v-if="usedBy > 1">
						This resource is read by {{ usedBy }} blocks on this page.
					</template>
				</p>
			</div>
		</div>

		<div v-if="structure" class="flex flex-col gap-2">
			<div
				v-for="field in fields"
				:key="field.name"
				class="overflow-hidden rounded-lg border border-default bg-default"
			>
				<div
					class="flex cursor-pointer items-center gap-2.5 px-3 py-2.5"
					@click="open = open === field.name ? null : field.name"
				>
					<UIcon name="i-ph-list" class="size-4 shrink-0 text-dimmed" />
					<span class="truncate text-sm text-default">
						{{ field.label || field.name }}
					</span>
					<span class="truncate font-mono text-xs text-dimmed">
						{{ field.name }}
					</span>
					<div class="ml-auto flex shrink-0 items-center gap-1">
						<UIcon
							v-if="writing(field.name)"
							name="i-ph-circle-notch"
							class="size-3.5 animate-spin text-dimmed"
						/>
						<UButton
							v-if="!field.opaque"
							:disabled="writing(field.name)"
							:icon="aspect(field, 'listable') ? 'i-ph-eye' : 'i-ph-eye-slash'"
							size="xs"
							color="neutral"
							variant="ghost"
							:title="
								aspect(field, 'listable')
									? 'Visible by default'
									: 'Hidden by default'
							"
							@click.stop="
								patch(field.name, { listable: !aspect(field, 'listable') })
							"
						/>
						<UIcon
							:name="
								open === field.name ? 'i-ph-caret-up' : 'i-ph-caret-down'
							"
							class="size-4 text-dimmed"
						/>
					</div>
				</div>

				<div
					v-if="open === field.name"
					class="border-t border-default bg-elevated p-3"
				>
					<div v-if="field.opaque" class="flex flex-col gap-1.5 text-xs text-dimmed">
						<p>This field is set up in code, so it can't be changed here.</p>
						<p v-if="advancedMode">
							The builder can read this field but not rewrite it:
							{{ field.opaqueReason }}.
						</p>
					</div>

					<div v-else class="flex flex-col gap-3">
						<div class="grid grid-cols-2 gap-3">
							<div class="flex flex-col gap-1.5">
								<label class="text-xs font-medium text-default">
									Reference key
								</label>
								<UInput
									:model-value="field.name"
									size="sm"
									disabled
									class="font-mono"
								/>
								<p class="text-xs text-dimmed">
									Immutable: renaming means removing and adding the field.
								</p>
							</div>
							<div class="flex flex-col gap-1.5">
								<label class="text-xs font-medium text-default">Type</label>
								<USelectMenu
									:model-value="field.dataType?.$dataType"
									:items="dataTypes"
									value-key="value"
									size="sm"
									@update:model-value="
										patch(field.name, { dataType: { $dataType: $event } })
									"
								/>
							</div>
						</div>

						<div class="flex flex-col gap-1.5">
							<label class="text-xs font-medium text-default">
								Displayed label
							</label>
							<UInput
								:model-value="field.label ?? ''"
								size="sm"
								:placeholder="field.name"
								@change="
									patch(field.name, {
										label: ($event.target as HTMLInputElement).value || undefined,
									})
								"
							/>
						</div>

						<div class="grid grid-cols-3 gap-3">
							<label
								v-for="entry in ASPECTS"
								:key="entry.key"
								class="flex gap-2"
								:class="
									writing(field.name)
										? 'cursor-progress opacity-60'
										: 'cursor-pointer'
								"
							>
								<UCheckbox
									:model-value="aspect(field, entry.key)"
									:disabled="writing(field.name)"
									class="mt-0.5"
									@update:model-value="
										patch(field.name, { [entry.key]: $event })
									"
								/>
								<span class="min-w-0">
									<span class="block text-xs text-default">
										{{ entry.label }}
									</span>
									<span class="block text-xs text-dimmed">
										{{ entry.help }}
									</span>
								</span>
							</label>
						</div>

						<div class="flex flex-col gap-1.5">
							<label class="text-xs font-medium text-default">
								Mandatory on
							</label>
							<div class="flex gap-1">
								<UButton
									v-for="route in MANDATORY_ROUTES"
									:key="route"
									:label="route === 'new' ? 'Creating' : 'Editing'"
									size="xs"
									:disabled="writing(field.name)"
									:color="
										(field.mandatory ?? []).includes(route)
											? 'primary'
											: 'neutral'
									"
									:variant="
										(field.mandatory ?? []).includes(route) ? 'soft' : 'outline'
									"
									@click="toggleMandatory(field, route)"
								/>
							</div>
							<p class="text-xs text-dimmed">
								Refused server-side when missing on those routes.
							</p>
						</div>

						<div
							v-if="confirming === `field:${field.name}`"
							class="flex flex-col gap-2 rounded-md border border-error/40 bg-error/5 p-2.5"
						>
							<p class="text-xs text-toned">
								Removing <b>{{ field.label || field.name }}</b> drops its column
								and <b>the value every row holds in it</b>. This is written
								straight away, not on Save.
							</p>
							<div class="flex gap-2">
								<UButton
									size="xs"
									color="error"
									label="Remove the field and its data"
									@click="removeField(field.name)"
								/>
								<UButton
									size="xs"
									color="neutral"
									variant="ghost"
									label="Keep it"
									@click="confirming = null"
								/>
							</div>
						</div>
						<UButton
							v-else
							icon="i-ph-trash"
							size="xs"
							color="error"
							variant="soft"
							label="Remove this field"
							class="self-start"
							@click="confirming = `field:${field.name}`"
						/>
					</div>
				</div>
			</div>

			<p v-if="!fields.length" class="text-sm text-dimmed">
				This resource has no field yet.
			</p>
		</div>

		<template v-if="structure">
			<DmsBuilderFieldForm
				v-if="adding"
				:resource="current"
				@cancel="adding = false"
				@submit="
					builder.addField(current!, $event).then(() => (adding = false))
				"
			/>
			<UButton
				v-else
				icon="i-ph-plus"
				size="xs"
				color="primary"
				variant="soft"
				label="Add a field"
				class="self-start"
				@click="adding = true"
			/>

			<div class="flex flex-col gap-2 border-t border-default pt-4">
				<p class="text-sm font-semibold text-highlighted">Exposed endpoints</p>
				<div class="flex flex-wrap gap-1">
					<UButton
						v-for="entry in ROUTES"
						:key="entry.key"
						:label="entry.label"
						size="xs"
						:disabled="session.pending.includes(current ?? '')"
						:color="served(entry.key) ? 'primary' : 'neutral'"
						:variant="served(entry.key) ? 'soft' : 'outline'"
						@click="toggleRoute(entry.key)"
					/>
				</div>
				<p class="text-xs text-dimmed">
					Each one is an HTTP route of the resource. A resource must serve at
					least one.
				</p>
			</div>

			<div class="border-t border-default pt-4">
				<div
					v-if="confirming === 'resource'"
					class="flex flex-col gap-2 rounded-md border border-error/40 bg-error/5 p-2.5"
				>
					<p class="text-xs text-toned">
						Deleting <b>{{ current }}</b> removes the table, its API and
						<b>every row it holds</b>. There is no undo.
						<template v-if="usedBy">
							{{ usedBy }} block{{ usedBy === 1 ? '' : 's' }} on this page
							read{{ usedBy === 1 ? 's' : '' }} it.
						</template>
					</p>
					<div class="flex gap-2">
						<UButton
							size="xs"
							color="error"
							label="Delete the table and its rows"
							@click="removeResource"
						/>
						<UButton
							size="xs"
							color="neutral"
							variant="ghost"
							label="Keep it"
							@click="confirming = null"
						/>
					</div>
				</div>
				<template v-else>
					<UButton
						icon="i-ph-trash"
						size="xs"
						color="error"
						variant="soft"
						label="Delete this resource"
						@click="confirming = 'resource'"
					/>
					<p class="mt-1.5 text-xs text-dimmed">
						Removes the table, its API and every row it holds.
					</p>
				</template>
			</div>
		</template>

		<div class="flex flex-col gap-2 border-t border-default pt-4">
			<p class="text-sm font-semibold text-highlighted">New resource</p>
			<UInput v-model="newName" size="sm" placeholder="product" />
			<UButton
				size="xs"
				color="primary"
				label="Create the table and its API"
				:disabled="!newName.trim()"
				@click="create"
			/>
			<p class="text-xs text-dimmed">
				Creates the table, the DataAPI and a first <code>title</code> field —
				add the rest just above.
			</p>
		</div>
	</div>
</template>

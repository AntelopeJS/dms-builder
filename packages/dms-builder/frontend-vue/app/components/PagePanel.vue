<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { categoryOptions, categoryRoute } from '../runtime/categories'
import { openWhenServed } from '../runtime/dev-reload'
import { useBuilderMode } from '../runtime/mode'
import { usePageDelete } from '../runtime/page-delete'
import { useBuilder } from '../runtime/session'

const builder = useBuilder()
const { advanced } = useBuilderMode()
const { deleting, deletePage } = usePageDelete()
const session = builder.session
const router = useRouter()
// Auto-imported from the host's own layers, like every composable the loader
// scans; neither is part of the frontend-module SDK.
const devReload = useDmsDevReload()
const { confirm } = useConfirm()

// What marks a setting written at once rather than with Save.
const NOW = {
	color: 'primary',
	variant: 'soft',
	size: 'sm',
	icon: 'i-ph-lightning-fill',
	label: 'Now',
	title: 'Applies now',
} as const

const meta = computed(() => session.value.structure?.page)
const patch = computed(() => session.value.draft?.page ?? {})

function value<T>(key: string, fallback: T): T {
	return (patch.value[key] as T) ?? fallback
}

const categories = computed(() => categoryOptions(session.value.categories))
const categoryLabel = computed(
	() =>
		session.value.categories.find((entry) => entry.ref === meta.value?.category)
			?.displayName ?? meta.value?.category,
)
const moving = ref(false)
const ordering = ref(false)

// The permission as typed: written on change, and put back to the page's own
// whenever that is read again.
const permission = ref('')
watch(
	() => meta.value?.permission?.id,
	(id) => {
		permission.value = typeof id === 'string' ? id : ''
	},
	{ immediate: true },
)

/**
 * The page's rank among its siblings. The order is not staged with the
 * blocks: it is written at once, so one write is let through at a time.
 */
async function saveOrder(order: number | null | undefined): Promise<void> {
	if (typeof order !== 'number' || ordering.value) return
	ordering.value = true
	try {
		await builder.savePageMeta({ order })
	} finally {
		ordering.value = false
	}
}

async function savePermission(): Promise<void> {
	await builder.savePageMeta({
		permission: permission.value
			? {
					id: permission.value,
					title: value('displayName', meta.value?.displayName),
				}
			: undefined,
	})
}

async function move(category: string): Promise<void> {
	const page = meta.value
	if (!page || category === page.category || moving.value) {
		return
	}
	const asked = await confirm({
		title: 'Move the page?',
		description: `Its address becomes ${categoryRoute(category)}/${page.id} and its file moves with it. Nothing redirects the old address.`,
		confirmLabel: 'Move the page',
		cancelLabel: `Keep it in ${categoryLabel.value}`,
		confirmColor: 'warning',
	})
	if (!asked) {
		return
	}
	moving.value = true
	try {
		const ref = await builder.movePage(category)
		if (ref) {
			// The move rewrites the page's registration: the new route only
			// answers once the backend module has reloaded under it.
			await openWhenServed(
				{
					devReload,
					router,
					onWaitFailure: (failure) => {
						session.value.error = failure
					},
				},
				ref,
			)
		}
	} finally {
		moving.value = false
	}
}
</script>

<template>
	<div v-if="meta" class="flex flex-col gap-6">
		<UBadge
			icon="i-ph-lightning"
			color="neutral"
			variant="outline"
			label="Applies now — the rest waits for Save"
			class="self-start"
		/>

		<div class="flex flex-col gap-3">
			<UFormField label="Title">
				<div class="flex gap-2">
					<DmsBuilderIconPicker
						:model-value="value('icon', meta.icon)"
						fallback="i-ph-file"
						label="Change the icon"
						@update:model-value="builder.patchPage({ icon: $event })"
					/>
					<UInput
						:model-value="value('displayName', meta.displayName)"
						size="lg"
						class="min-w-0 flex-1"
						@update:model-value="builder.patchPage({ displayName: $event })"
					/>
				</div>
			</UFormField>
			<UFormField label="Description">
				<UTextarea
					:model-value="value('description', meta.description ?? '')"
					:rows="2"
					placeholder="What the page is for — optional"
					class="w-full"
					@update:model-value="builder.patchPage({ description: $event })"
				/>
			</UFormField>
		</div>

		<div class="flex flex-col gap-3">
			<p class="text-xs font-semibold text-toned">In the menu</p>
			<UFormField
				label="Hidden"
				description="Left out of the menu, still reachable at its address."
				orientation="horizontal"
			>
				<USwitch
					:model-value="value('hidden', meta.hidden ?? false)"
					@update:model-value="builder.patchPage({ hidden: $event })"
				/>
			</UFormField>
			<UFormField
				label="Position"
				:description="`Among the pages of ${categoryLabel}, lowest first.`"
				orientation="horizontal"
			>
				<template #hint>
					<UBadge v-bind="NOW" />
				</template>
				<UInputNumber
					:model-value="meta.order ?? 0"
					size="sm"
					:disabled="ordering"
					:increment="{ 'aria-label': 'Later in the menu' }"
					:decrement="{ 'aria-label': 'Earlier in the menu' }"
					class="w-28"
					@update:model-value="saveOrder"
				/>
			</UFormField>
		</div>

		<div class="flex flex-col gap-2.5">
			<p class="flex items-center gap-1.5 text-xs font-semibold text-toned">
				Address
				<UBadge v-bind="NOW" />
			</p>
			<UFormField label="Category">
				<USelectMenu
					:model-value="meta.category"
					:items="categories"
					value-key="value"
					icon="i-ph-folder"
					:disabled="moving"
					:search-input="{
						placeholder: 'Filter categories…',
						icon: 'i-ph-magnifying-glass',
					}"
					class="w-full"
					@update:model-value="move(String($event))"
				/>
			</UFormField>
			<p class="flex items-center gap-1.5 text-xs text-muted">
				<UIcon name="i-ph-globe-simple" class="size-3.5 shrink-0" />
				Answers at
				<code class="truncate font-mono text-toned">{{ meta.ref }}</code>
			</p>
		</div>

		<UFormField
			label="Permission"
			help="Only people holding it see the page. Leave empty for none."
		>
			<template #hint>
				<UBadge v-bind="NOW" />
			</template>
			<UInput
				v-model="permission"
				icon="i-ph-shield"
				placeholder="shop.products"
				class="w-full font-mono"
				@change="savePermission"
			/>
		</UFormField>

		<p v-if="advanced" class="flex items-center gap-1.5 text-xs text-muted">
			<UIcon name="i-ph-file-code" class="size-3.5 shrink-0" />
			Declared in
			<code class="truncate font-mono">{{
				meta.filepath.split('/').slice(-3).join('/')
			}}</code>
		</p>

		<UButton
			icon="i-ph-trash"
			size="xs"
			color="error"
			variant="soft"
			label="Delete the page"
			class="self-start"
			:loading="deleting === meta.ref"
			@click="deletePage(meta)"
		/>
	</div>
</template>

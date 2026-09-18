<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { categoryOptions } from '../runtime/categories'
import { openWhenServed } from '../runtime/dev-reload'
import { useBuilder } from '../runtime/session'

const builder = useBuilder()
const session = builder.session
const router = useRouter()
// Auto-imported from the host's own layer, like every `app/composables` the
// loader scans; it is not part of the frontend-module SDK.
const devReload = useDmsDevReload()

const meta = computed(() => session.value.structure?.page)
const patch = computed(() => session.value.draft?.page ?? {})

function value<T>(key: string, fallback: T): T {
	return (patch.value[key] as T) ?? fallback
}

const categories = computed(() => categoryOptions(session.value.categories))
// The category a move is being confirmed for; null when none is pending.
const moveTo = ref<string | null>(null)
const moving = ref(false)

/** The route the page would answer on under `category`. */
const nextRoute = computed(() => {
	const category = session.value.categories.find(
		(entry) => entry.ref === moveTo.value,
	)
	const id = meta.value?.id
	if (!category || !id) {
		return ''
	}
	const slug = category.ref.replace(/^pages\.?/, '').replace(/\./g, '/')
	return slug ? `/${slug}/${id}` : `/${id}`
})

async function confirmMove(): Promise<void> {
	if (!moveTo.value || moving.value) {
		return
	}
	moving.value = true
	try {
		const ref = await builder.movePage(moveTo.value)
		moveTo.value = null
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
	<div v-if="meta" class="flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<label class="text-sm font-medium text-default">Title</label>
			<UInput
				:model-value="value('displayName', meta.displayName)"
				size="sm"
				@update:model-value="builder.patchPage({ displayName: $event })"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label class="text-sm font-medium text-default">Description</label>
			<UTextarea
				:model-value="value('description', meta.description ?? '')"
				:rows="2"
				@update:model-value="builder.patchPage({ description: $event })"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label class="text-sm font-medium text-default">Category</label>
			<USelectMenu
				:model-value="moveTo ?? meta.category"
				:items="categories"
				value-key="value"
				size="sm"
				icon="i-ph-folder"
				:disabled="moving"
				:search-input="{
					placeholder: 'Filter categories…',
					icon: 'i-ph-magnifying-glass',
				}"
				@update:model-value="
					moveTo = $event === meta.category ? null : String($event)
				"
			/>
			<div
				v-if="moveTo"
				class="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/5 p-2.5"
			>
				<p class="text-xs text-toned">
					A page's category is its address. Moving it changes the route to
					<span class="font-medium text-highlighted">{{ nextRoute }}</span>
					and moves the file — <span class="font-medium">nothing redirects
					the old link</span>. This is written straight away, not on Save.
				</p>
				<div class="flex gap-2">
					<UButton
						size="xs"
						color="warning"
						:label="moving ? 'Moving…' : 'Move the page'"
						:loading="moving"
						:disabled="moving"
						@click="confirmMove"
					/>
					<UButton
						size="xs"
						color="neutral"
						variant="ghost"
						label="Keep it here"
						:disabled="moving"
						@click="moveTo = null"
					/>
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<label class="text-sm font-medium text-default">Icon</label>
			<DmsBuilderIconInput
				:model-value="value('icon', meta.icon)"
				@update:model-value="builder.patchPage({ icon: $event })"
			/>
		</div>

		<div class="flex items-center justify-between">
			<label class="text-sm font-medium text-default">Hidden from the menu</label>
			<USwitch
				:model-value="value('hidden', meta.hidden ?? false)"
				@update:model-value="builder.patchPage({ hidden: $event })"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label class="text-sm font-medium text-default">Menu order</label>
			<UInput
				type="number"
				:model-value="value('order', meta.order ?? 0)"
				size="sm"
				@change="
					builder.savePageMeta({
						order: Number(($event.target as HTMLInputElement).value),
					})
				"
			/>
			<p class="text-xs text-dimmed">
				Sorts the page among its siblings. Written straight away.
			</p>
		</div>

		<div class="flex flex-col gap-1.5">
			<label class="text-sm font-medium text-default">Permission</label>
			<UInput
				:model-value="(meta.permission?.id as string) ?? ''"
				size="sm"
				placeholder="shop.products"
				@change="
					builder.savePageMeta({
						permission: ($event.target as HTMLInputElement).value
							? {
									id: ($event.target as HTMLInputElement).value,
									title: value('displayName', meta.displayName),
								}
							: undefined,
					})
				"
			/>
			<p class="text-xs text-dimmed">
				Guards the page behind a permission id. Leave empty for none.
			</p>
		</div>

		<p class="rounded-md border border-default p-3 text-xs text-dimmed">
			Declared in
			<code>{{ meta.filepath.split('/').slice(-3).join('/') }}</code>
		</p>
	</div>
</template>

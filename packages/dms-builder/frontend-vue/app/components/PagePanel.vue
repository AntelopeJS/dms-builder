<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { categoryOptions, categoryRoute } from '../runtime/categories'
import { openWhenServed } from '../runtime/dev-reload'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'

const builder = useBuilder()
const { advanced } = useBuilderMode()
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
const categoryLabel = computed(
	() =>
		session.value.categories.find((entry) => entry.ref === meta.value?.category)
			?.displayName ?? meta.value?.category,
)
// The category a move is being confirmed for; null when none is pending.
const moveTo = ref<string | null>(null)
const moving = ref(false)
const ordering = ref(false)
const confirmingDelete = ref(false)

/** The route the page would answer on under the category it is moving to. */
const nextRoute = computed(() => {
	const known = session.value.categories.some(
		(entry) => entry.ref === moveTo.value,
	)
	const id = meta.value?.id
	return known && moveTo.value && id
		? `${categoryRoute(moveTo.value)}/${id}`
		: ''
})

/**
 * Nudge the page's rank among its siblings. The order is not staged with the
 * blocks: it is written at once, so one write is let through at a time.
 */
async function shiftOrder(step: number): Promise<void> {
	if (!meta.value || ordering.value) return
	ordering.value = true
	try {
		await builder.savePageMeta({ order: (meta.value.order ?? 0) + step })
	} finally {
		ordering.value = false
	}
}

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
	<div v-if="meta" class="flex flex-col gap-[22px]">
		<span
			class="inline-flex h-6 items-center gap-1.5 self-start rounded-full border border-default bg-elevated px-2.5 text-xs text-muted"
		>
			<UIcon name="i-ph-lightning" class="size-3 text-primary" />
			Applies now — the rest waits for Save
		</span>

		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1.5">
				<label for="page-title" class="text-xs font-medium text-toned">
					Title
				</label>
				<div class="flex gap-2">
					<DmsBuilderIconPicker
						:model-value="value('icon', meta.icon)"
						fallback="i-ph-file"
						label="Change the icon"
						@update:model-value="builder.patchPage({ icon: $event })"
					/>
					<UInput
						id="page-title"
						:model-value="value('displayName', meta.displayName)"
						size="lg"
						class="min-w-0 flex-1"
						@update:model-value="builder.patchPage({ displayName: $event })"
					/>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="page-description" class="text-xs font-medium text-toned">
					Description
				</label>
				<UTextarea
					id="page-description"
					:model-value="value('description', meta.description ?? '')"
					:rows="2"
					placeholder="What the page is for — optional"
					@update:model-value="builder.patchPage({ description: $event })"
				/>
			</div>
		</div>

		<div class="flex flex-col gap-3">
			<p class="text-xs font-semibold text-toned">In the menu</p>
			<div class="flex items-center gap-4">
				<div class="min-w-0 flex-1">
					<p class="text-[13px] text-default">Hidden</p>
					<p class="text-xs text-muted">
						Left out of the menu, still reachable at its address.
					</p>
				</div>
				<USwitch
					:model-value="value('hidden', meta.hidden ?? false)"
					aria-label="Hidden from the menu"
					@update:model-value="builder.patchPage({ hidden: $event })"
				/>
			</div>
			<div class="flex items-center gap-4">
				<div class="min-w-0 flex-1">
					<p class="flex items-center gap-1.5 text-[13px] text-default">
						Position
						<span
							class="inline-flex h-4 items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary"
							title="Applies now"
						>
							<UIcon name="i-ph-lightning-fill" class="size-2.5" />
							Now
						</span>
					</p>
					<p class="text-xs text-muted">
						Among the pages of {{ categoryLabel }}, lowest first.
					</p>
				</div>
				<div
					role="group"
					aria-label="Position"
					class="flex h-7 items-center rounded-md border border-accented"
				>
					<UButton
						icon="i-ph-minus"
						size="xs"
						color="neutral"
						variant="ghost"
						aria-label="Earlier in the menu"
						:disabled="ordering"
						@click="shiftOrder(-1)"
					/>
					<span class="w-7 text-center text-[13px] tabular-nums">
						{{ meta.order ?? 0 }}
					</span>
					<UButton
						icon="i-ph-plus"
						size="xs"
						color="neutral"
						variant="ghost"
						aria-label="Later in the menu"
						:disabled="ordering"
						@click="shiftOrder(1)"
					/>
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-2.5">
			<p class="flex items-center gap-1.5 text-xs font-semibold text-toned">
				Address
				<span
					class="inline-flex h-4 items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary"
					title="Applies now"
				>
					<UIcon name="i-ph-lightning-fill" class="size-2.5" />
					Now
				</span>
			</p>
			<div class="flex flex-col gap-1.5">
				<label class="text-xs font-medium text-toned">Category</label>
				<USelectMenu
					:model-value="moveTo ?? meta.category"
					:items="categories"
					value-key="value"
					icon="i-ph-folder"
					:color="moveTo ? 'warning' : undefined"
					:highlight="!!moveTo"
					:disabled="moving"
					:search-input="{
						placeholder: 'Filter categories…',
						icon: 'i-ph-magnifying-glass',
					}"
					@update:model-value="
						moveTo = $event === meta.category ? null : String($event)
					"
				/>
			</div>
			<div
				v-if="moveTo"
				class="flex flex-col gap-2.5 rounded-md border border-warning/40 bg-warning/5 p-2.5"
			>
				<div class="flex gap-2">
					<UIcon name="i-ph-warning" class="mt-0.5 size-3.5 shrink-0 text-warning" />
					<p class="text-xs leading-relaxed text-toned">
						Its address becomes
						<code class="font-mono text-highlighted">{{ nextRoute }}</code>
						and its file moves with it.
						<span class="font-medium text-highlighted">
							Nothing redirects the old address.
						</span>
					</p>
				</div>
				<div class="flex gap-1.5">
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
						:label="`Keep it in ${categoryLabel}`"
						:disabled="moving"
						@click="moveTo = null"
					/>
				</div>
			</div>
			<p class="flex items-center gap-1.5 text-xs text-muted">
				<UIcon name="i-ph-globe-simple" class="size-3.5 shrink-0" />
				Answers at
				<code class="truncate font-mono text-toned">{{ meta.ref }}</code>
			</p>
		</div>

		<div class="flex flex-col gap-1.5">
			<label
				for="page-permission"
				class="flex items-center gap-1.5 text-xs font-semibold text-toned"
			>
				Permission
				<span
					class="inline-flex h-4 items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary"
					title="Applies now"
				>
					<UIcon name="i-ph-lightning-fill" class="size-2.5" />
					Now
				</span>
			</label>
			<UInput
				id="page-permission"
				:model-value="(meta.permission?.id as string) ?? ''"
				icon="i-ph-shield"
				placeholder="shop.products"
				class="font-mono"
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
			<p class="text-xs text-muted">
				Only people holding it see the page. Leave empty for none.
			</p>
		</div>

		<p v-if="advanced" class="flex items-center gap-1.5 text-xs text-muted">
			<UIcon name="i-ph-file-code" class="size-3.5 shrink-0" />
			Declared in
			<code class="truncate font-mono">{{
				meta.filepath.split('/').slice(-3).join('/')
			}}</code>
		</p>

		<DmsBuilderPageDelete
			v-if="confirmingDelete"
			:page="meta"
			@close="confirmingDelete = false"
		/>
		<div
			v-else
			class="flex flex-col gap-2.5 rounded-lg border border-error/30 bg-error/5 p-3"
		>
			<div class="flex flex-col gap-1">
				<p class="text-[13px] font-semibold text-highlighted">Delete this page</p>
				<p class="text-xs leading-relaxed text-muted">
					It leaves the project with the routes it declares and the queries
					only it reads. The builder can't undo this.
				</p>
			</div>
			<UButton
				icon="i-ph-trash"
				size="xs"
				color="error"
				variant="soft"
				label="Delete the page"
				class="self-start"
				@click="confirmingDelete = true"
			/>
		</div>
	</div>
</template>

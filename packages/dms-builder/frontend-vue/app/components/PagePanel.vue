<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { useBuilderApi } from '../runtime/api'
import { categoryOptions, categoryRoute } from '../runtime/categories'
import { openWhenServed } from '../runtime/dev-reload'
import { useBuilderMode } from '../runtime/mode'
import { usePageDelete } from '../runtime/page-delete'
import type { PermissionChoice } from '../runtime/types'
import { useBuilder } from '../runtime/session'

const builder = useBuilder()
const { advanced } = useBuilderMode()
const { deleting, deletePage } = usePageDelete()
const session = builder.session
const router = useRouter()
// Auto-imported from the host's own layers, like every composable the loader
// scans; neither is part of the frontend-module SDK.
const devReload = useDevReload()
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

/** The page's permission as the draft holds it: the saved one unless changed. */
const permission = computed(() => {
	const drafted = patch.value.permission
	const held = drafted === undefined ? meta.value?.permission : drafted
	const id = (held as { id?: unknown } | null | undefined)?.id
	return typeof id === 'string' ? id : ''
})

/**
 * Who can see the page, staged with the rest: an emptied field takes the
 * permission off the page, which the wire can only say as null.
 */
function setPermission(id: string): void {
	const trimmed = id.trim()
	builder.patchPage({
		permission: trimmed
			? { id: trimmed, title: value('displayName', meta.value?.displayName) }
			: null,
	})
}

// Auto-imported from the host's own layer: the DMS writes many of its titles
// as translation keys, `$page.auth.login_title`, read in the viewer's language.
const { processI18n } = useTranslation()

/** The permissions the DMS has registered, to pick the page's from. */
const permissions = ref<PermissionChoice[]>([])
onMounted(async () => {
	try {
		const listed = await useBuilderApi().permissions()
		permissions.value = Array.isArray(listed) ? listed : []
	} catch {
		// No list: the id is still typed by hand below.
	}
})

/**
 * The choice that means no permission set: a menu item cannot stand for an
 * empty value, and no permission's id starts with a hash.
 */
const OWN = '#own'

/** The permissions as a picker lists them, the page's own default first. */
const permissionItems = computed(() => [
	{ label: 'Its own permission', description: 'Named after the page', value: OWN },
	...permissions.value.map((choice) => ({
		label: processI18n(choice.title),
		description: `${processI18n(choice.group)} · ${choice.id}`,
		value: choice.id,
		...(choice.icon ? { icon: choice.icon } : {}),
	})),
])

/** The page's place among its siblings, staged with the rest. */
const order = computed(() => value<number | undefined>('order', meta.value?.order) ?? 0)

/** `1st`, `2nd`, `3rd`, `4th`: a place, as the menu shows it. */
function ordinal(place: number): string {
	const tens = place % 100
	const suffix =
		tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th')
	return `${place}${suffix}`
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
		color: 'warning',
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
			<DmsEyebrow>In the menu</DmsEyebrow>
			<UFormField
				label="Show in the menu"
				description="Left out, it is still reachable at its address."
				orientation="horizontal"
			>
				<USwitch
					:model-value="!value('hidden', meta.hidden ?? false)"
					@update:model-value="builder.patchPage({ hidden: !$event })"
				/>
			</UFormField>
			<UFormField
				label="Position"
				:description="`${ordinal(order + 1)} among the pages of ${categoryLabel}, lowest first.`"
				orientation="horizontal"
			>
				<UInputNumber
					:model-value="order"
					size="sm"
					:min="0"
					:increment="{ 'aria-label': 'Later in the menu' }"
					:decrement="{ 'aria-label': 'Earlier in the menu' }"
					class="w-28"
					@update:model-value="builder.patchPage({ order: $event ?? 0 })"
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
					icon="i-ph-folder-light"
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
				<UIcon name="i-ph-globe-simple-light" class="size-3.5 shrink-0" />
				Answers at
				<code class="truncate font-mono text-toned">{{ meta.ref }}</code>
			</p>
		</div>

		<UFormField
			label="Who can see it"
			:help="
				permission
					? 'Only the roles holding this permission see the page.'
					: 'Left empty, the page has a permission of its own, named after it: the roles granted it see the page.'
			"
		>
			<div class="flex flex-col gap-1.5">
				<USelectMenu
					v-if="permissions.length"
					:model-value="permission || OWN"
					:items="permissionItems"
					value-key="value"
					icon="i-ph-shield-light"
					:search-input="{ placeholder: 'Find a permission…' }"
					aria-label="Who can see it"
					class="w-full"
					@update:model-value="setPermission($event === OWN ? '' : String($event ?? ''))"
				/>
				<!-- The id itself, for one the DMS has not registered yet. -->
				<UInput
					v-if="advanced || !permissions.length"
					:model-value="permission"
					icon="i-ph-shield-light"
					placeholder="shop.products"
					size="sm"
					class="w-full font-mono"
					aria-label="Permission"
					@update:model-value="setPermission(String($event))"
				/>
				<DmsBuilderAccess />
			</div>
		</UFormField>

		<p v-if="advanced" class="flex items-center gap-1.5 text-xs text-muted">
			<UIcon name="i-ph-file-code-light" class="size-3.5 shrink-0" />
			Declared in
			<code class="truncate font-mono">{{
				meta.filepath.split('/').slice(-3).join('/')
			}}</code>
		</p>

		<UButton
			icon="i-ph-trash-light"
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

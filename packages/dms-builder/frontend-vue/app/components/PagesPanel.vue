<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDmsRouter as useRouter } from '#dms-inertia/frontend-module'
import { categoryOptions } from '../runtime/categories'
import { openWhenServed } from '../runtime/dev-reload'
import { useBuilder } from '../runtime/session'
import type { CategorySummary, PageSummary } from '../runtime/types'

interface TreeCategory {
	ref: string
	label: string
	depth: number
	pages: PageSummary[]
}

const builder = useBuilder()
const session = builder.session
const router = useRouter()
// Auto-imported from the host's own layer, like every `app/composables` the
// loader scans; it is not part of the frontend-module SDK.
const devReload = useDmsDevReload()

const creating = ref<'page' | 'category' | null>(null)
const renaming = ref<string | null>(null)
const renameDraft = ref({ displayName: '', icon: '', order: 0 })
const draft = ref({
	name: '',
	displayName: '',
	parent: '',
	icon: '',
	description: '',
})

onMounted(() => {
	void builder.loadSiteTree()
})

const pagesByCategory = computed(() => {
	const grouped = new Map<string, PageSummary[]>()
	for (const page of session.value.pages) {
		const bucket = grouped.get(page.category) ?? []
		bucket.push(page)
		grouped.set(page.category, bucket)
	}
	return grouped
})

/** Categories in tree order, each with the pages that sit directly in it. */
const tree = computed(() => {
	const categories = session.value.categories
	const children = (parent?: string): CategorySummary[] =>
		categories.filter((entry) => (entry.parent ?? undefined) === parent)
	const rows: TreeCategory[] = []
	const walk = (parent: string | undefined, depth: number): void => {
		for (const category of children(parent)) {
			rows.push({
				ref: category.ref,
				label: category.displayName,
				depth,
				pages: pagesByCategory.value.get(category.ref) ?? [],
			})
			walk(category.ref, depth + 1)
		}
	}
	walk(undefined, 0)
	return rows
})

const categoryItems = computed(() => categoryOptions(session.value.categories))

/** What a folder, a route segment and a class name can all be built from. */
function slugify(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036F]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

// The slug follows the title until it is edited by hand: typing it twice is
// busywork, and a title typed into the slug field writes a folder with spaces
// in it and a route that has to be escaped to be linked.
const slugEdited = ref(false)
watch(
	() => draft.value.displayName,
	(title) => {
		if (!slugEdited.value) {
			draft.value.name = slugify(title)
		}
	},
)

function editSlug(value: string): void {
	slugEdited.value = true
	draft.value.name = slugify(value)
}

const valid = computed(
	() => !!draft.value.name.trim() && !!draft.value.displayName.trim(),
)

function startRename(category: TreeCategory): void {
	renaming.value = category.ref
	renameDraft.value = { displayName: category.label, icon: '', order: 0 }
	creating.value = null
}

async function submitRename(): Promise<void> {
	if (!renaming.value) return
	await builder.configureCategory(renaming.value, {
		displayName: renameDraft.value.displayName,
		...(renameDraft.value.icon ? { icon: renameDraft.value.icon } : {}),
	})
	renaming.value = null
}

function start(kind: 'page' | 'category'): void {
	creating.value = kind
	slugEdited.value = false
	draft.value = {
		name: '',
		displayName: '',
		parent: kind === 'page' ? (session.value.structure?.page.category ?? '') : '',
		icon: '',
		description: '',
	}
}

// Creating writes files and reloads the backend module: seconds, not
// milliseconds. Without a pending state the button looks inert and invites a
// second click, which would try to write the same page twice.
const submitting = ref(false)

async function submit(): Promise<void> {
	if (!valid.value || submitting.value) {
		return
	}
	submitting.value = true
	try {
		await write()
	} finally {
		submitting.value = false
	}
}

async function write(): Promise<void> {
	const common = {
		name: draft.value.name.trim(),
		displayName: draft.value.displayName.trim(),
		...(draft.value.icon ? { icon: draft.value.icon } : {}),
	}
	if (creating.value === 'category') {
		await builder.createCategory({
			...common,
			...(draft.value.parent ? { parent: draft.value.parent } : {}),
		})
		creating.value = null
		return
	}
	const ref = await builder.createPage({
		...common,
		category: draft.value.parent,
		...(draft.value.description ? { description: draft.value.description } : {}),
	})
	creating.value = null
	if (ref) {
		// Navigating to a route the DMS has not registered yet renders the page
		// without its layout, so wait for the reload that brings it in. The
		// route watcher then opens the builder on it.
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
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex gap-2">
			<UButton
				icon="i-ph-file-plus"
				size="xs"
				color="primary"
				label="New page"
				@click="start('page')"
			/>
			<UButton
				icon="i-ph-folder-plus"
				size="xs"
				color="neutral"
				variant="outline"
				label="New category"
				@click="start('category')"
			/>
		</div>

		<div
			v-if="creating"
			class="flex flex-col gap-3 rounded-md border border-default p-3"
		>
			<p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
				{{ creating === 'page' ? 'New page' : 'New category' }}
			</p>

			<div class="flex flex-col gap-1.5">
				<label class="text-sm font-medium text-default">Title</label>
				<UInput
					v-model="draft.displayName"
					size="sm"
					placeholder="Revenue"
					autofocus
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label class="text-sm font-medium text-default">Slug</label>
				<UInput
					:model-value="draft.name"
					size="sm"
					placeholder="revenue"
					@update:model-value="editSlug(String($event))"
				/>
				<p class="text-xs text-dimmed">
					Names the folder, the route and the exported class. Follows the
					title unless you change it.
				</p>
			</div>

			<div class="flex flex-col gap-1.5">
				<label class="text-sm font-medium text-default">
					{{ creating === 'page' ? 'Category' : 'Parent category' }}
				</label>
				<USelectMenu
					v-model="draft.parent"
					:items="categoryItems"
					value-key="value"
					size="sm"
					icon="i-ph-folder"
					:search-input="{
						placeholder: 'Filter categories…',
						icon: 'i-ph-magnifying-glass',
					}"
					:placeholder="
						creating === 'page' ? 'Choose a category…' : 'Top level'
					"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label class="text-sm font-medium text-default">Icon</label>
				<DmsBuilderIconInput v-model="draft.icon" />
			</div>

			<div v-if="creating === 'page'" class="flex flex-col gap-1.5">
				<label class="text-sm font-medium text-default">Description</label>
				<UTextarea v-model="draft.description" :rows="2" />
			</div>

			<div class="flex gap-2">
				<UButton
					size="xs"
					color="primary"
					:label="
						submitting
							? 'Writing…'
							: creating === 'page'
								? 'Create the page'
								: 'Create the category'
					"
					:loading="submitting"
					:disabled="
						submitting || !valid || (creating === 'page' && !draft.parent)
					"
					@click="submit"
				/>
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					label="Cancel"
					:disabled="submitting"
					@click="creating = null"
				/>
			</div>
		</div>

		<div
			v-if="renaming"
			class="flex flex-col gap-3 rounded-md border border-default p-3"
		>
			<p class="text-sm font-semibold text-highlighted">
				Rename {{ renaming }}
			</p>
			<UInput v-model="renameDraft.displayName" size="sm" />
			<DmsBuilderIconInput v-model="renameDraft.icon" />
			<div class="flex gap-2">
				<UButton size="xs" color="primary" label="Save" @click="submitRename" />
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					label="Cancel"
					@click="renaming = null"
				/>
			</div>
		</div>

		<div class="flex flex-col gap-1">
			<template v-for="category in tree" :key="category.ref">
				<div
					class="flex items-center gap-2 py-1 text-xs text-dimmed"
					:style="{ paddingLeft: `${category.depth * 12}px` }"
				>
					<UIcon name="i-ph-folder" class="size-3.5 shrink-0" />
					<span class="truncate font-medium">{{ category.label }}</span>
					<span class="truncate opacity-60">{{ category.ref }}</span>
					<UButton
						icon="i-ph-pencil-simple"
						size="xs"
						color="neutral"
						variant="ghost"
						class="ml-auto"
						aria-label="Rename the category"
						@click="startRename(category)"
					/>
					<UButton
						v-if="!category.pages.length"
						icon="i-ph-trash"
						size="xs"
						color="error"
						variant="ghost"
						aria-label="Delete the category"
						@click="builder.deleteCategory(category.ref)"
					/>
				</div>
				<div
					v-for="page in category.pages"
					:key="page.ref"
					class="group flex items-center gap-2 rounded-md pr-1 transition-colors"
					:class="
						session.pageRef === page.ref
							? 'bg-primary/10 text-primary'
							: 'text-muted hover:bg-elevated'
					"
				>
					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs"
						:style="{ paddingLeft: `${category.depth * 12 + 20}px` }"
						@click="router.push(page.ref)"
					>
						<UIcon name="i-ph-file" class="size-3.5 shrink-0" />
						<span class="truncate font-medium">{{ page.displayName }}</span>
						<span class="truncate opacity-60">{{ page.ref }}</span>
					</button>
					<UButton
						icon="i-ph-trash"
						size="xs"
						color="error"
						variant="ghost"
						class="opacity-0 group-hover:opacity-100"
						aria-label="Delete the page"
						@click.stop="builder.deletePage(page.ref)"
					/>
				</div>
			</template>
			<p v-if="!tree.length" class="text-sm text-dimmed">
				No category yet.
			</p>
		</div>
	</div>
</template>

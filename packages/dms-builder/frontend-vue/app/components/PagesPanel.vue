<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import { categoryOptions, categoryRoute } from '../runtime/categories'
import { openWhenServed } from '../runtime/dev-reload'
import { useBuilder } from '../runtime/session'
import type { PageSummary } from '../runtime/types'

interface CategoryNode {
	ref: string
	label: string
	depth: number
	pages: PageSummary[]
	children: CategoryNode[]
}

type Row =
	| { kind: 'category'; node: CategoryNode; open: boolean }
	| { kind: 'page'; page: PageSummary; depth: number }

const builder = useBuilder()
const session = builder.session
const router = useRouter()
// Auto-imported from the host's own layer, like every `app/composables` the
// loader scans; it is not part of the frontend-module SDK.
const devReload = useDmsDevReload()

const query = ref('')
const collapsed = ref(new Set<string>())
const creating = ref<'page' | 'category' | null>(null)
// The page a deletion is being confirmed for; null when none is pending.
const deleting = ref<string | null>(null)
const renaming = ref<string | null>(null)
const renameDraft = ref<{ displayName: string; icon?: string }>({
	displayName: '',
})
const draft = ref<{
	name: string
	displayName: string
	parent: string
	icon?: string
	description: string
}>({ name: '', displayName: '', parent: '', description: '' })
const editingSlug = ref(false)

onMounted(() => {
	void builder.loadSiteTree()
})

/**
 * A page as the tree lists it. The open one reads as its draft does, so a
 * title or icon being edited shows here before it is saved.
 */
function shown(page: PageSummary): PageSummary {
	if (page.ref !== session.value.pageRef) return page
	const meta = session.value.structure?.page
	const patch = session.value.draft?.page ?? {}
	return {
		...page,
		displayName:
			(patch.displayName as string | undefined) ??
			meta?.displayName ??
			page.displayName,
		icon: (patch.icon as string | undefined) ?? meta?.icon ?? page.icon,
		hidden: (patch.hidden as boolean | undefined) ?? meta?.hidden ?? page.hidden,
	}
}

/** Pages in the order the menu lists them: by order, then name, then id. */
function byMenuOrder(a: PageSummary, b: PageSummary): number {
	return (
		(a.order ?? 0) - (b.order ?? 0) ||
		a.displayName.localeCompare(b.displayName) ||
		a.id.localeCompare(b.id)
	)
}

const tree = computed(() => {
	const pages = new Map<string, PageSummary[]>()
	for (const page of session.value.pages) {
		const bucket = pages.get(page.category) ?? []
		bucket.push(shown(page))
		pages.set(page.category, bucket)
	}
	const build = (parent: string | undefined, depth: number): CategoryNode[] =>
		session.value.categories
			.filter((entry) => (entry.parent ?? undefined) === parent)
			.map((entry) => ({
				ref: entry.ref,
				label: entry.displayName,
				depth,
				pages: (pages.get(entry.ref) ?? []).sort(byMenuOrder),
				children: build(entry.ref, depth + 1),
			}))
	return build(undefined, 0)
})

const needle = computed(() => query.value.trim().toLowerCase())

function found(text: string): boolean {
	return text.toLowerCase().includes(needle.value)
}

/**
 * The tree as rows. A search keeps the pages it finds, with every category
 * above them opened; a category it finds by name keeps all of its pages.
 */
const rows = computed<Row[]>(() => {
	const out: Row[] = []
	const holds = (node: CategoryNode): boolean =>
		found(node.label) ||
		node.pages.some((page) => found(page.displayName) || found(page.ref)) ||
		node.children.some(holds)
	const walk = (nodes: CategoryNode[], named: boolean): void => {
		for (const node of nodes) {
			if (needle.value && !named && !holds(node)) continue
			const open = !!needle.value || !collapsed.value.has(node.ref)
			out.push({ kind: 'category', node, open })
			if (!open) continue
			const keepAll = !needle.value || named || found(node.label)
			for (const page of node.pages) {
				if (keepAll || found(page.displayName) || found(page.ref)) {
					out.push({ kind: 'page', page, depth: node.depth })
				}
			}
			walk(node.children, keepAll && !!needle.value)
		}
	}
	walk(tree.value, false)
	return out
})

const categoryItems = computed(() => categoryOptions(session.value.categories))

/** Where the new page or category would answer, as it is being named. */
const address = computed(
	() => `${categoryRoute(draft.value.parent)}/${draft.value.name || '…'}`,
)

function toggle(ref_: string): void {
	const next = new Set(collapsed.value)
	if (next.has(ref_)) next.delete(ref_)
	else next.add(ref_)
	collapsed.value = next
}

function empty(node: CategoryNode): boolean {
	return !node.pages.length && !node.children.length
}

/** What a folder, a route segment and a class name can all be built from. */
function slugify(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
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
	() =>
		!!draft.value.name.trim() &&
		!!draft.value.displayName.trim() &&
		(creating.value !== 'page' || !!draft.value.parent),
)

function startRename(node: CategoryNode): void {
	renaming.value = node.ref
	renameDraft.value = { displayName: node.label }
	creating.value = null
}

async function submitRename(): Promise<void> {
	const ref_ = renaming.value
	const displayName = renameDraft.value.displayName.trim()
	if (!ref_ || !displayName) return
	await builder.configureCategory(ref_, {
		displayName,
		...(renameDraft.value.icon ? { icon: renameDraft.value.icon } : {}),
	})
	renaming.value = null
}

function start(kind: 'page' | 'category', parent?: string): void {
	creating.value = kind
	renaming.value = null
	slugEdited.value = false
	editingSlug.value = false
	draft.value = {
		name: '',
		displayName: '',
		parent:
			parent ??
			(kind === 'page' ? (session.value.structure?.page.category ?? '') : ''),
		description: '',
	}
	if (parent) {
		const next = new Set(collapsed.value)
		next.delete(parent)
		collapsed.value = next
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
	<div class="flex flex-col gap-3">
		<div class="flex items-center gap-1.5">
			<UInput
				v-model="query"
				icon="i-ph-magnifying-glass"
				placeholder="Find a page"
				aria-label="Find a page"
				class="min-w-0 flex-1"
			/>
			<UButton
				icon="i-ph-file-plus"
				label="New page"
				:variant="creating === 'page' ? 'soft' : 'solid'"
				@click="creating === 'page' ? (creating = null) : start('page')"
			/>
			<UButton
				icon="i-ph-folder-plus"
				color="neutral"
				:variant="creating === 'category' ? 'soft' : 'outline'"
				aria-label="New category"
				title="New category"
				@click="creating === 'category' ? (creating = null) : start('category')"
			/>
		</div>

		<div
			v-if="creating"
			class="flex flex-col gap-3.5 rounded-lg border border-accented bg-elevated p-3"
		>
			<div class="flex items-center justify-between">
				<p class="text-[13px] font-semibold text-highlighted">
					{{ creating === 'page' ? 'New page' : 'New category' }}
				</p>
				<UButton
					icon="i-ph-x"
					size="xs"
					color="neutral"
					variant="ghost"
					:aria-label="creating === 'page' ? 'Cancel the new page' : 'Cancel the new category'"
					:disabled="submitting"
					@click="creating = null"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="new-entry-title" class="text-xs font-medium text-toned">
					Title
				</label>
				<div class="flex gap-2">
					<DmsBuilderIconPicker
						v-model="draft.icon"
						:fallback="creating === 'page' ? 'i-ph-file' : 'i-ph-folder'"
					/>
					<UInput
						id="new-entry-title"
						v-model="draft.displayName"
						size="lg"
						:placeholder="creating === 'page' ? 'Revenue' : 'Reports'"
						class="min-w-0 flex-1"
						autofocus
						@keydown.enter="submit"
					/>
				</div>
			</div>

			<div class="flex flex-col gap-1.5">
				<label class="text-xs font-medium text-toned">
					{{ creating === 'page' ? 'Category' : 'Parent category' }}
				</label>
				<USelectMenu
					v-model="draft.parent"
					:items="categoryItems"
					value-key="value"
					icon="i-ph-folder"
					:search-input="{
						placeholder: 'Filter categories…',
						icon: 'i-ph-magnifying-glass',
					}"
					:placeholder="creating === 'page' ? 'Choose a category…' : 'Top level'"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="new-entry-slug" class="text-xs font-medium text-toned">
					Address
				</label>
				<div v-if="editingSlug" class="flex items-center gap-1.5">
					<span class="shrink-0 font-mono text-xs text-muted">
						{{ categoryRoute(draft.parent) }}/
					</span>
					<UInput
						id="new-entry-slug"
						:model-value="draft.name"
						placeholder="revenue"
						class="min-w-0 flex-1 font-mono"
						@update:model-value="editSlug(String($event))"
					/>
				</div>
				<div v-else class="flex items-center gap-1.5">
					<p
						class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md bg-accented px-2.5 font-mono text-xs text-toned"
					>
						<UIcon name="i-ph-globe-simple" class="size-3.5 shrink-0 text-muted" />
						<span class="truncate">{{ address }}</span>
					</p>
					<UButton
						label="Edit"
						size="sm"
						color="neutral"
						variant="ghost"
						@click="editingSlug = true"
					/>
				</div>
				<p class="text-xs text-muted">
					{{
						slugEdited
							? 'Also names the folder and the exported class.'
							: 'Follows the title unless you edit it.'
					}}
				</p>
			</div>

			<div v-if="creating === 'page'" class="flex flex-col gap-1.5">
				<label class="text-xs font-medium text-toned">Description</label>
				<UTextarea
					v-model="draft.description"
					:rows="2"
					placeholder="What the page is for — optional"
				/>
			</div>

			<div class="flex flex-col gap-2">
				<div class="flex gap-2">
					<UButton
						:label="
							submitting
								? 'Writing…'
								: creating === 'page'
									? 'Create page'
									: 'Create category'
						"
						:loading="submitting"
						:disabled="submitting || !valid"
						@click="submit"
					/>
					<UButton
						label="Cancel"
						color="neutral"
						variant="ghost"
						:disabled="submitting"
						@click="creating = null"
					/>
				</div>
				<p class="text-xs text-muted">
					{{
						creating === 'page'
							? 'Written to the project at once. The builder opens the page as soon as the app has reloaded.'
							: 'Written to the project at once.'
					}}
				</p>
			</div>
		</div>

		<div role="tree" aria-label="Pages" class="flex flex-col gap-px">
			<template
				v-for="row in rows"
				:key="row.kind === 'category' ? `c:${row.node.ref}` : `p:${row.page.ref}`"
			>
				<template v-if="row.kind === 'category'">
					<div
						v-if="renaming === row.node.ref"
						class="flex h-10 items-center gap-1 rounded-md border border-accented bg-elevated px-1"
						:style="{ marginLeft: `${row.node.depth * 16}px` }"
					>
						<DmsBuilderIconPicker
							v-model="renameDraft.icon"
							fallback="i-ph-folder"
							label="Category icon"
							size="sm"
						/>
						<UInput
							v-model="renameDraft.displayName"
							size="sm"
							aria-label="Category name"
							class="min-w-0 flex-1"
							autofocus
							@keydown.enter="submitRename"
							@keydown.esc="renaming = null"
						/>
						<UButton
							icon="i-ph-check-bold"
							size="sm"
							variant="soft"
							aria-label="Save the name"
							:disabled="!renameDraft.displayName.trim()"
							@click="submitRename"
						/>
						<UButton
							icon="i-ph-x"
							size="sm"
							color="neutral"
							variant="ghost"
							aria-label="Keep the old name"
							@click="renaming = null"
						/>
					</div>
					<div
						v-else
						class="group flex h-8 items-center gap-0.5 rounded-md pr-1 transition-colors hover:bg-elevated"
						:style="{ paddingLeft: `${4 + row.node.depth * 16}px` }"
					>
						<button
							type="button"
							class="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
							:aria-expanded="row.open"
							@click="toggle(row.node.ref)"
						>
							<UIcon
								:name="row.open ? 'i-ph-caret-down' : 'i-ph-caret-right'"
								class="size-3 shrink-0 text-muted"
							/>
							<UIcon name="i-ph-folder" class="size-[15px] shrink-0 text-muted" />
							<span class="truncate text-[13px] font-medium text-toned">
								{{ row.node.label }}
							</span>
							<span class="shrink-0 text-[11px] text-muted">
								{{
									row.node.pages.length ||
									(row.node.children.length ? '' : 'empty')
								}}
							</span>
						</button>
						<div
							class="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
						>
							<UButton
								icon="i-ph-plus"
								size="xs"
								color="neutral"
								variant="ghost"
								:aria-label="`New page in ${row.node.label}`"
								:title="`New page in ${row.node.label}`"
								@click="start('page', row.node.ref)"
							/>
							<UButton
								icon="i-ph-pencil-simple"
								size="xs"
								color="neutral"
								variant="ghost"
								:aria-label="`Rename ${row.node.label}`"
								title="Rename"
								@click="startRename(row.node)"
							/>
							<UButton
								v-if="empty(row.node)"
								icon="i-ph-trash"
								size="xs"
								color="neutral"
								variant="ghost"
								:aria-label="`Delete ${row.node.label}`"
								title="Delete the empty category"
								@click="builder.deleteCategory(row.node.ref)"
							/>
						</div>
					</div>
				</template>

				<template v-else>
					<div
						class="group flex h-[34px] items-center gap-0.5 rounded-md pr-1 transition-colors"
						:class="
							session.pageRef === row.page.ref
								? 'bg-primary/10'
								: 'hover:bg-elevated'
						"
						:style="{ paddingLeft: `${22 + row.depth * 16}px` }"
					>
						<button
							type="button"
							class="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
							:aria-current="session.pageRef === row.page.ref ? 'page' : undefined"
							@click="router.push(row.page.ref)"
						>
							<UIcon
								:name="row.page.icon || 'i-ph-file'"
								class="size-[15px] shrink-0"
								:class="
									session.pageRef === row.page.ref ? 'text-primary' : 'text-muted'
								"
							/>
							<span
								class="truncate text-[13px]"
								:class="
									session.pageRef === row.page.ref
										? 'font-medium text-primary'
										: 'text-default'
								"
							>
								{{ row.page.displayName }}
							</span>
							<UIcon
								v-if="row.page.hidden"
								name="i-ph-eye-slash"
								class="size-3.5 shrink-0 text-muted"
								title="Hidden from the menu"
							/>
							<span
								class="min-w-0 shrink-[4] truncate font-mono text-[11px]"
								:class="
									session.pageRef === row.page.ref
										? 'text-primary/70'
										: 'text-muted'
								"
							>
								{{ row.page.ref }}
							</span>
						</button>
						<UButton
							v-if="session.pageRef === row.page.ref"
							icon="i-ph-sliders-horizontal"
							size="xs"
							variant="ghost"
							aria-label="Page settings"
							title="Page settings"
							@click="builder.setView('page')"
						/>
						<UButton
							icon="i-ph-trash"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="`Delete ${row.page.displayName}`"
							title="Delete"
							:class="
								deleting === row.page.ref
									? 'opacity-100'
									: 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
							"
							@click.stop="deleting = row.page.ref"
						/>
					</div>
					<DmsBuilderPageDelete
						v-if="deleting === row.page.ref"
						:page="row.page"
						class="mb-1.5 mt-0.5"
						:style="{ marginLeft: `${22 + row.depth * 16}px` }"
						@close="deleting = null"
					/>
				</template>
			</template>

			<p v-if="!session.categories.length" class="text-xs text-muted">
				No category yet — create one to hold pages.
			</p>
			<p v-else-if="!rows.length" class="text-xs text-muted">
				No page matches “{{ query.trim() }}”.
			</p>
		</div>
	</div>
</template>

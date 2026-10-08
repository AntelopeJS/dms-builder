<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDmsRouter as useRouter } from '#dms/frontend-module'
import {
	byCategoryOrder,
	byMenuOrder,
	categoryOptions,
	categoryRoute,
} from '../runtime/categories'
import { openWhenServed } from '../runtime/dev-reload'
import { usePageDelete } from '../runtime/page-delete'
import { useBuilder, type PageLayout } from '../runtime/session'
import type { PageSummary } from '../runtime/types'

interface CategoryNode {
	ref: string
	label: string
	pages: PageSummary[]
	children: CategoryNode[]
}

/** A line of the tree: keyed by the category's ref, or by the page's route. */
interface RowBase {
	ref: string
	label: string
	icon?: string
	/** The category being renamed is drawn as the form that renames it. */
	slot?: 'rename'
}

interface CategoryRow extends RowBase {
	kind: 'category'
	node: CategoryNode
	children?: Row[]
}

interface PageRow extends RowBase {
	kind: 'page'
	page: PageSummary
}

type Row = CategoryRow | PageRow

const builder = useBuilder()
const { deleting, deletePage } = usePageDelete()
const session = builder.session
const router = useRouter()
// Auto-imported from the host's own layer, like every `app/composables` the
// loader scans; it is not part of the frontend-module SDK.
const devReload = useDevReload()

const query = ref('')
const collapsed = ref(new Set<string>())
const creating = ref<'page' | 'category' | null>(null)
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

function pageRow(page: PageSummary): PageRow {
	return {
		kind: 'page',
		ref: page.ref,
		label: page.displayName,
		icon: page.icon || 'i-ph-file',
		page,
	}
}

const tree = computed(() => {
	const pages = new Map<string, PageSummary[]>()
	for (const page of session.value.pages) {
		const bucket = pages.get(page.category) ?? []
		bucket.push(shown(page))
		pages.set(page.category, bucket)
	}
	const build = (parent: string | undefined): CategoryNode[] =>
		session.value.categories
			.filter((entry) => (entry.parent ?? undefined) === parent)
			.sort(byCategoryOrder)
			.map((entry) => ({
				ref: entry.ref,
				label: entry.displayName,
				pages: (pages.get(entry.ref) ?? []).sort(byMenuOrder),
				children: build(entry.ref),
			}))
	return build(undefined)
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
	const holds = (node: CategoryNode): boolean =>
		found(node.label) ||
		node.pages.some((page) => found(page.displayName) || found(page.ref)) ||
		node.children.some(holds)
	const build = (nodes: CategoryNode[], named: boolean): Row[] =>
		nodes
			.filter((node) => !needle.value || named || holds(node))
			.map((node) => {
				const keepAll = !needle.value || named || found(node.label)
				const children = [
					...node.pages
						.filter(
							(page) => keepAll || found(page.displayName) || found(page.ref),
						)
						.map(pageRow),
					...build(node.children, keepAll && !!needle.value),
				]
				return {
					kind: 'category',
					ref: node.ref,
					label: node.label,
					// Nothing to open: the tree only draws a folder for what it can.
					icon: children.length ? undefined : 'i-ph-folder',
					slot: renaming.value === node.ref ? 'rename' : undefined,
					node,
					children: children.length ? children : undefined,
				}
			})
	return build(tree.value, false)
})

/** The open page, which the tree shows selected. */
const current = computed(() => {
	const page = session.value.pages.find(
		(entry) => entry.ref === session.value.pageRef,
	)
	return page && pageRow(page)
})

/** Every category is open unless folded, and a search opens them all. */
const expanded = computed(() =>
	session.value.categories
		.map((entry) => entry.ref)
		.filter((ref_) => !!needle.value || !collapsed.value.has(ref_)),
)

// What is kept is the folds, so a category created later starts open. A
// search holds every category open, so nothing folds under one.
function expand(open: string[]): void {
	if (needle.value) return
	collapsed.value = new Set(
		session.value.categories
			.map((entry) => entry.ref)
			.filter((ref_) => !open.includes(ref_)),
	)
}

/**
 * The page the tree is about to open, while the DMS does not serve it yet: a
 * page just written is listed here seconds before its route answers.
 */
const opening = ref<string | null>(null)

/**
 * Open a page once the DMS serves it: navigating any sooner renders it bare,
 * without the menu or the header, and it stays so. A served page opens at
 * once. The last page asked for wins, so one clicked while another is still
 * waiting is not snatched back when the first one lands.
 */
async function openPage(route: string): Promise<void> {
	if (opening.value === route) {
		return
	}
	opening.value = route
	try {
		await openWhenServed(
			{
				devReload,
				router,
				onWaitFailure: (failure) => {
					session.value.error = failure
				},
				stillWanted: () => opening.value === route,
			},
			route,
		)
	} finally {
		if (opening.value === route) {
			opening.value = null
		}
	}
}

/**
 * A page picked in the tree opens, and a category picked only folds: what
 * shows selected is the open page, which the route decides, not the click.
 */
function visit(event: Event, row: Row): void {
	event.preventDefault()
	if (row.kind === 'page') {
		void openPage(row.ref)
	}
}

const categoryItems = computed(() => categoryOptions(session.value.categories))

/** Where the new page or category would answer, as it is being named. */
const address = computed(
	() => `${categoryRoute(draft.value.parent)}/${draft.value.name || '…'}`,
)

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

/**
 * The page already answering at the address being typed, if any: two pages
 * cannot share one, and finding out before writing beats a refusal after.
 */
const taken = computed(() => {
	if (creating.value !== 'page' || !draft.value.name) {
		return undefined
	}
	return session.value.pages.find((page) => page.ref === address.value)?.displayName
})

const valid = computed(
	() =>
		!!draft.value.name.trim() &&
		!!draft.value.displayName.trim() &&
		!taken.value &&
		(creating.value !== 'page' || !!draft.value.parent),
)

type StartLayout = PageLayout | 'blank'

/** What a new page can start from; a blank page is written as it is. */
const LAYOUT_ITEMS: { label: string; value: StartLayout; icon: string }[] = [
	{ label: 'Blank', value: 'blank', icon: 'i-ph-file-light' },
	{ label: 'Dashboard', value: 'dashboard', icon: 'i-ph-squares-four-light' },
	{ label: 'List', value: 'list', icon: 'i-ph-table-light' },
	{ label: 'Form', value: 'form', icon: 'i-ph-note-pencil-light' },
]
const layout = ref<StartLayout>('blank')

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
	layout.value = 'blank'
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
	const ref = await builder.createPage(
		{
			...common,
			category: draft.value.parent,
			...(draft.value.description ? { description: draft.value.description } : {}),
		},
		layout.value === 'blank' ? undefined : layout.value,
	)
	creating.value = null
	if (ref) {
		// The route watcher opens the builder on the new page once it is served.
		await openPage(ref)
	}
}
</script>

<template>
	<div class="flex flex-col gap-3">
		<div class="flex items-center gap-1.5">
			<UInput
				v-model="query"
				icon="i-ph-magnifying-glass-light"
				placeholder="Find a page"
				aria-label="Find a page"
				size="sm"
				class="min-w-0 flex-1"
			/>
			<UButton
				icon="i-ph-file-plus-light"
				size="sm"
				variant="soft"
				aria-label="New page"
				title="New page"
				@click="start('page')"
			/>
			<UButton
				icon="i-ph-folder-plus-light"
				size="sm"
				color="neutral"
				variant="outline"
				aria-label="New category"
				title="New category"
				@click="start('category')"
			/>
		</div>

		<!-- Creating writes files at once: asked in a dialog of its own, with the
		address it will answer at checked as it is typed. -->
		<UModal
			:open="creating !== null"
			:title="creating === 'category' ? 'New category' : 'New page'"
			:description="
				creating === 'category'
					? 'Written to the project at once.'
					: 'Written to the project at once, then opened in the editor.'
			"
			:dismissible="!submitting"
			@update:open="(open: boolean) => !open && (creating = null)"
		>
			<template #body>
				<div v-if="creating" class="flex flex-col gap-4">
					<UFormField label="Title">
						<div class="flex gap-2">
							<DmsBuilderIconPicker
								v-model="draft.icon"
								:fallback="creating === 'page' ? 'i-ph-file' : 'i-ph-folder'"
							/>
							<UInput
								v-model="draft.displayName"
								size="lg"
								:placeholder="creating === 'page' ? 'Revenue' : 'Reports'"
								class="min-w-0 flex-1"
								autofocus
								@keydown.enter="submit"
							/>
						</div>
					</UFormField>

					<UFormField :label="creating === 'page' ? 'Category' : 'Parent category'">
						<USelectMenu
							v-model="draft.parent"
							:items="categoryItems"
							value-key="value"
							icon="i-ph-folder-light"
							:search-input="{
								placeholder: 'Filter categories…',
								icon: 'i-ph-magnifying-glass',
							}"
							:placeholder="creating === 'page' ? 'Choose a category…' : 'Top level'"
							class="w-full"
						/>
					</UFormField>

					<UFormField
						label="Address"
						:error="taken ? `${taken} already answers at this address.` : undefined"
						:help="
							taken
								? undefined
								: slugEdited
									? 'Also names the folder and the exported class.'
									: 'Follows the title unless you edit it.'
						"
					>
						<div v-if="editingSlug" class="flex items-center gap-1.5">
							<span class="shrink-0 font-mono text-xs text-muted">
								{{ categoryRoute(draft.parent) }}/
							</span>
							<UInput
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
								<UIcon
									:name="taken ? 'i-ph-warning-light' : 'i-ph-globe-simple'"
									class="size-3.5 shrink-0"
									:class="taken ? 'text-error' : 'text-muted'"
								/>
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
					</UFormField>

					<UFormField v-if="creating === 'page'" label="Description">
						<UTextarea
							v-model="draft.description"
							:rows="2"
							placeholder="What the page is for — optional"
							class="w-full"
						/>
					</UFormField>

					<UFormField
						v-if="creating === 'page'"
						label="Start from"
						help="Laid on the page as unsaved changes, to keep or undo."
					>
						<DmsSegmented
							:model-value="layout"
							:items="LAYOUT_ITEMS"
							size="sm"
							block
							aria-label="Start from"
							@update:model-value="layout = $event as StartLayout"
						/>
					</UFormField>
				</div>
			</template>
			<template #footer>
				<div class="flex w-full justify-end gap-2">
					<UButton
						label="Cancel"
						color="neutral"
						variant="ghost"
						:disabled="submitting"
						@click="creating = null"
					/>
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
				</div>
			</template>
		</UModal>

		<!-- Each row holds buttons of its own, which a row drawn as a button
		could not: the rows are drawn as `div`s, and the buttons keep their
		clicks from reaching the row, which would select or fold it. -->
		<UTree
			:items="rows"
			:model-value="current"
			:expanded="expanded"
			:get-key="(row: Row) => row.ref"
			:as="{ link: 'div' }"
			expanded-icon="i-ph-folder-open-light"
			collapsed-icon="i-ph-folder-light"
			aria-label="Pages"
			@update:expanded="expand"
			@select="visit"
		>
			<template #item-label="{ item }">
				{{ item.label }}
				<span v-if="item.kind === 'page'" class="font-mono text-xs text-muted">{{
					item.ref
				}}</span>
				<span v-else class="text-xs text-muted">{{
					item.node.pages.length || (empty(item.node) ? 'empty' : '')
				}}</span>
			</template>

			<template #item-trailing="{ item }">
				<div class="flex items-center" @click.stop>
					<template v-if="item.kind === 'page'">
						<UIcon
							v-if="opening === item.ref"
							name="i-ph-circle-notch-light"
							class="size-4 animate-spin text-muted"
							title="Opens once the app has reloaded"
						/>
						<UIcon
							v-if="item.page.hidden"
							name="i-ph-eye-slash-light"
							class="size-4 text-muted"
							title="Hidden from the menu"
						/>
						<UButton
							v-if="item.ref === session.pageRef"
							icon="i-ph-sliders-horizontal-light"
							size="xs"
							variant="ghost"
							aria-label="Page settings"
							title="Page settings"
							@click="builder.setView('page')"
						/>
						<UButton
							icon="i-ph-trash-light"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="`Delete ${item.label}`"
							title="Delete"
							:loading="deleting === item.ref"
							:class="{
								'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100':
									deleting !== item.ref,
							}"
							@click="deletePage(item.page)"
						/>
					</template>
					<div
						v-else
						class="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
					>
						<UButton
							icon="i-ph-arrow-up-light"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="`Move ${item.label} up the menu`"
							title="Earlier in the menu · written at once"
							:disabled="session.pending.includes(item.ref)"
							@click="builder.moveCategory(item.ref, -1)"
						/>
						<UButton
							icon="i-ph-arrow-down-light"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="`Move ${item.label} down the menu`"
							title="Later in the menu · written at once"
							:disabled="session.pending.includes(item.ref)"
							@click="builder.moveCategory(item.ref, 1)"
						/>
						<UButton
							icon="i-ph-plus-light"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="`New page in ${item.label}`"
							:title="`New page in ${item.label}`"
							@click="start('page', item.ref)"
						/>
						<UButton
							icon="i-ph-pencil-simple-light"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="`Rename ${item.label}`"
							title="Rename"
							@click="startRename(item.node)"
						/>
						<UButton
							v-if="empty(item.node)"
							icon="i-ph-trash-light"
							size="xs"
							color="neutral"
							variant="ghost"
							:aria-label="`Delete ${item.label}`"
							title="Delete the empty category"
							@click="builder.deleteCategory(item.ref)"
						/>
					</div>
				</div>
			</template>

			<!-- The tree also reads every key typed inside it as a jump to the
			row it starts: the form keeps its keys to itself. -->
			<template #rename>
				<div class="flex flex-1 items-center gap-1" @click.stop @keydown.stop>
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
						icon="i-ph-x-light"
						size="sm"
						color="neutral"
						variant="ghost"
						aria-label="Keep the old name"
						@click="renaming = null"
					/>
				</div>
			</template>
		</UTree>

		<p v-if="!session.categories.length" class="text-xs text-muted">
			No category yet — create one to hold pages.
		</p>
		<p v-else-if="!rows.length" class="text-xs text-muted">
			No page matches “{{ query.trim() }}”.
		</p>
	</div>
</template>

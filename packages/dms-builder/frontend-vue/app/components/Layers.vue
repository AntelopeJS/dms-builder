<script setup lang="ts">
import { computed, ref } from 'vue'
import { descriptorOf, isStructural, lineIcon } from '../runtime/catalog'
import { joinPath } from '../runtime/draft'
import { useBuilderMode } from '../runtime/mode'
import { blockKind, blockTitle } from '../runtime/naming'
import { useBuilder } from '../runtime/session'
import type { BlockDraft } from '../runtime/types'

/**
 * The page's blocks as a tree, top to bottom: every block reachable without
 * aiming at it, however deep it sits or however small it renders.
 *
 * The rows and columns the editor writes to lay blocks out are shown for what
 * they hold — "Row · 3 columns" — and fold, but are not things to configure:
 * a block placed beside another is the gesture, the row only its result.
 */

interface LayerRow {
	key: string
	kind: 'block' | 'row'
	path: string
	depth: number
	label: string
	icon: string
	/** What it is, or how many it holds. */
	detail: string
	/** The block's own name, for whoever reads the code. */
	name?: string
	warning: boolean
}

const builder = useBuilder()
const session = builder.session
const { advanced } = useBuilderMode()

const query = ref('')
const folded = ref(new Set<string>())

const pageTitle = computed(
	() =>
		(session.value.draft?.page?.displayName as string | undefined) ??
		session.value.structure?.page.displayName ??
		'Page',
)

const problems = computed(() => new Set(builder.problems.value))

function blockRow(block: BlockDraft, path: string, depth: number): LayerRow {
	const catalog = session.value.catalog
	const descriptor = descriptorOf(catalog, block.type)
	return {
		key: path,
		kind: 'block',
		path,
		depth,
		label: blockTitle(block, catalog),
		icon: block.preserve ? 'i-ph-lock-simple-light' : lineIcon(descriptor?.icon),
		detail: blockKind(block, catalog),
		name: block.name,
		warning: problems.value.has(path),
	}
}

/** The tree, flattened to the lines it shows. */
const rows = computed<LayerRow[]>(() => {
	const catalog = session.value.catalog
	const lines: LayerRow[] = []
	const build = (blocks: BlockDraft[], parent: string | null, depth: number): void => {
		for (const block of blocks) {
			const path = joinPath(parent, block.name)
			const children = block.children ?? []
			if (isStructural(catalog, block.type)) {
				// A row of one is no row anyone sees: its block stands alone.
				if (children.length > 1) {
					lines.push({
						key: path,
						kind: 'row',
						path,
						depth,
						label: block.type === 'VStack' ? 'Stack' : 'Row',
						icon: block.type === 'VStack' ? 'i-ph-rows-light' : 'i-ph-columns-light',
						detail: `${children.length} ${block.type === 'VStack' ? 'blocks' : 'columns'}`,
						warning: false,
					})
					if (!folded.value.has(path)) {
						build(children, path, depth + 1)
					}
				} else {
					build(children, path, depth)
				}
				continue
			}
			lines.push(blockRow(block, path, depth))
			if (children.length) {
				build(children, path, depth + 1)
			}
		}
	}
	build(session.value.draft?.blocks ?? [], null, 0)
	return lines
})

/** A search lists the blocks it finds, flat, each with what it is. */
const shown = computed(() => {
	const needle = query.value.trim().toLowerCase()
	if (!needle) {
		return rows.value
	}
	return rows.value
		.filter(
			(row) =>
				row.kind === 'block' &&
				(row.label.toLowerCase().includes(needle) ||
					row.detail.toLowerCase().includes(needle)),
		)
		.map((row) => ({ ...row, depth: 0 }))
})

function toggle(path: string): void {
	const next = new Set(folded.value)
	if (next.has(path)) {
		next.delete(path)
	} else {
		next.add(path)
	}
	folded.value = next
}

function openMenu(event: MouseEvent, path: string): void {
	const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
	builder.openMenu(path, box.left, box.bottom + 6)
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<UInput
			v-model="query"
			icon="i-ph-magnifying-glass-light"
			placeholder="Find a block on this page"
			aria-label="Find a block on this page"
			size="sm"
		/>

		<ul class="flex flex-col" role="tree" aria-label="Blocks of the page">
			<li role="treeitem" aria-expanded="true">
				<button
					type="button"
					class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-semibold text-highlighted hover:bg-elevated"
					:class="session.inspector === 'page' ? 'bg-primary/10 text-primary' : ''"
					title="Page settings"
					@click="builder.setView('page')"
				>
					<UIcon name="i-ph-browser-light" class="size-4 shrink-0 text-muted" />
					<span class="min-w-0 flex-1 truncate">{{ pageTitle }}</span>
					<span class="font-mono text-[10.5px] font-normal text-dimmed">page</span>
				</button>
			</li>

			<li
				v-for="row in shown"
				:key="row.key"
				role="treeitem"
				:aria-selected="row.kind === 'block' && session.selection === row.path"
				class="group relative"
			>
				<div
					v-if="row.kind === 'row'"
					class="flex h-8 items-center gap-1.5 rounded-md pr-2 text-[12.5px] text-muted"
					:style="{ paddingLeft: `${8 + (row.depth + 1) * 14}px` }"
				>
					<button
						type="button"
						class="flex size-4 items-center justify-center text-dimmed hover:text-highlighted"
						:aria-label="folded.has(row.path) ? `Show the ${row.label.toLowerCase()}` : `Fold the ${row.label.toLowerCase()}`"
						@click="toggle(row.path)"
					>
						<UIcon
							:name="folded.has(row.path) ? 'i-ph-caret-right' : 'i-ph-caret-down'"
							class="size-3"
						/>
					</button>
					<UIcon :name="row.icon" class="size-4 shrink-0" />
					<span class="flex-1">{{ row.label }}</span>
					<span class="font-mono text-[10.5px] text-dimmed">{{ row.detail }}</span>
				</div>
				<button
					v-else
					type="button"
					class="flex h-8 w-full items-center gap-2 rounded-md pr-8 text-left text-[13px]"
					:class="
						session.selection === row.path
							? 'bg-primary/10 font-semibold text-primary'
							: session.hovered === row.path
								? 'bg-elevated text-highlighted'
								: 'text-toned hover:bg-elevated hover:text-highlighted'
					"
					:style="{ paddingLeft: `${8 + (row.depth + 1) * 14}px` }"
					:title="row.detail"
					@click="builder.select(row.path)"
					@mouseenter="builder.hover(row.path)"
					@mouseleave="builder.hover(null)"
				>
					<UIcon :name="row.icon" class="size-4 shrink-0 opacity-80" />
					<span class="min-w-0 flex-1 truncate">{{ row.label }}</span>
					<span v-if="advanced" class="font-mono text-[10.5px] font-normal text-dimmed">
						#{{ row.name }}
					</span>
					<UIcon
						v-if="row.warning"
						name="i-ph-warning-light"
						class="size-3.5 shrink-0 text-warning"
						title="A setting is still empty"
					/>
				</button>
				<button
					v-if="row.kind === 'block'"
					type="button"
					class="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded text-dimmed opacity-0 group-hover:opacity-100 hover:bg-accented hover:text-highlighted focus-visible:opacity-100"
					:aria-label="`Actions for ${row.label}`"
					@click.stop="openMenu($event, row.path)"
				>
					<UIcon name="i-ph-dots-three-light" class="size-4" />
				</button>
			</li>
		</ul>

		<p v-if="query.trim() && !shown.length" class="px-2 text-xs text-dimmed">
			No block matches “{{ query.trim() }}”.
		</p>

		<button
			type="button"
			class="flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] text-muted hover:bg-elevated hover:text-primary"
			@click="builder.setView('library')"
		>
			<UIcon name="i-ph-plus-light" class="size-3.5" />
			Add a block
		</button>
	</div>
</template>

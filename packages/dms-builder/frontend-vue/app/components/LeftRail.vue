<script setup lang="ts">
import { computed } from 'vue'
import { useBuilder, type LeftTab } from '../runtime/session'

/**
 * The side rail: adding a block, the page's blocks as a tree, and the menu.
 * Three tabs that stay whatever is selected — picking a block no longer trades
 * the library for its settings, which open beside the page instead.
 */

const TABS: { id: LeftTab; label: string; icon: string }[] = [
	{ id: 'add', label: 'Add', icon: 'i-ph-plus-square-light' },
	{ id: 'layers', label: 'Layers', icon: 'i-ph-stack-light' },
	{ id: 'pages', label: 'Pages', icon: 'i-ph-tree-view-light' },
]

const builder = useBuilder()
const session = builder.session

/** Where a click in the palette adds, said under it. */
const addsTo = computed(() => {
	const target = builder.paletteTarget.value
	return target ? `inside ${target.split('/').at(-1)}` : 'to the page'
})

function open(tab: LeftTab): void {
	builder.setView(tab === 'add' ? 'library' : tab)
}
</script>

<template>
	<aside
		class="flex min-h-0 min-w-0 flex-col border-r border-default bg-(--dms-bg-sidebar)"
		aria-label="Side rail"
	>
		<nav
			class="flex shrink-0 gap-0.5 border-b border-default px-2 pt-2"
			role="tablist"
			aria-label="Side rail"
		>
			<button
				v-for="tab in TABS"
				:key="tab.id"
				type="button"
				role="tab"
				:aria-selected="session.leftTab === tab.id"
				class="relative inline-flex h-8 flex-1 items-center justify-center gap-1.5 text-[12.5px] hover:text-highlighted"
				:class="
					session.leftTab === tab.id
						? 'font-semibold text-highlighted after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-t-sm after:bg-primary'
						: 'font-medium text-muted'
				"
				@click="open(tab.id)"
			>
				<UIcon :name="tab.icon" class="size-[15px]" />
				{{ tab.label }}
			</button>
		</nav>

		<div class="min-h-0 flex-1 overflow-y-auto px-2.5 pt-2.5 pb-3">
			<DmsBuilderLibrary v-if="session.leftTab === 'add'" />
			<DmsBuilderLayers v-else-if="session.leftTab === 'layers'" />
			<DmsBuilderPagesPanel v-else />
		</div>

		<footer
			class="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-default px-3 py-2 text-[11.5px] leading-snug text-muted"
		>
			<template v-if="session.leftTab === 'add'">
				<UIcon name="i-ph-hand-grabbing-light" class="size-4 shrink-0 text-dimmed" />
				<span>
					<b class="font-semibold text-toned">Drag</b> onto the page, or click to
					add {{ addsTo }}.
				</span>
			</template>
			<template v-else-if="session.leftTab === 'layers'">
				<UKbd value="↑" size="sm" /><UKbd value="↓" size="sm" />
				<span class="mr-1.5">select</span>
				<UKbd value="⌥" size="sm" /><UKbd value="↑" size="sm" />
				<span class="mr-1.5">move</span>
				<UKbd value="⌫" size="sm" />
				<span>remove</span>
			</template>
			<template v-else>
				<UIcon name="i-ph-lightning-light" class="size-4 shrink-0 text-dimmed" />
				<span>Changes to the menu are written to the project at once.</span>
			</template>
		</footer>
	</aside>
</template>

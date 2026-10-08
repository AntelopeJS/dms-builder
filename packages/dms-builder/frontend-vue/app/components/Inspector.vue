<script setup lang="ts">
import { computed } from 'vue'
import { paletteIcon } from '../runtime/catalog'
import { useBuilderMode } from '../runtime/mode'
import { blockKind, blockPosition, blockTitle } from '../runtime/naming'
import { useBuilder } from '../runtime/session'

/**
 * The column beside the page: the selected block's settings, the page's own,
 * the page as JSON, or the list of unsaved changes. It has a column of its own
 * so that configuring a block never takes the library's place.
 */

const builder = useBuilder()
const session = builder.session
const { advanced } = useBuilderMode()

const block = builder.selected

interface Heading {
	icon: string
	title: string
	subtitle: string
}

const heading = computed<Heading | undefined>(() => {
	const catalog = session.value.catalog
	const draft = session.value.draft
	switch (session.value.inspector) {
		case 'page': {
			const page = session.value.structure?.page
			const title =
				(draft?.page?.displayName as string | undefined) ?? page?.displayName ?? 'Page'
			const count = builder.blockCount.value
			return {
				icon: (draft?.page?.icon as string | undefined) ?? page?.icon ?? 'i-ph-file-light',
				title,
				subtitle: [
					'Page settings',
					page?.ref,
					`${count} block${count === 1 ? '' : 's'}`,
				]
					.filter(Boolean)
					.join(' · '),
			}
		}
		case 'json':
			return {
				icon: 'i-ph-brackets-curly-light',
				title: 'Page as JSON',
				subtitle: 'Copy it, or paste one back',
			}
		case 'changes': {
			const count = builder.unsaved.value.length
			return {
				icon: 'i-ph-list-checks-light',
				title: count
					? `${count} unsaved change${count === 1 ? '' : 's'}`
					: builder.dirty.value
						? 'Unsaved changes'
						: 'No unsaved changes',
				subtitle: 'Saved together, after a check',
			}
		}
		default: {
			const selected = block.value
			const path = session.value.selection
			if (!selected || !path || !draft) {
				return undefined
			}
			return {
				icon: selected.preserve
					? 'i-ph-lock-simple-light'
					: paletteIcon(builder.selectedDescriptor.value?.icon),
				title: blockTitle(selected, catalog),
				subtitle: [
					blockKind(selected, catalog),
					blockPosition(draft, path, catalog),
					advanced.value ? `#${selected.name}` : '',
				]
					.filter(Boolean)
					.join(' · '),
			}
		}
	}
})

/** Whatever the inspector shows besides the selection closes back to it. */
const closable = computed(() => session.value.inspector !== 'block')

function openMenu(event: MouseEvent): void {
	const path = session.value.selection
	if (!path) {
		return
	}
	const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
	builder.openMenu(path, box.right - 240, box.bottom + 6)
}
</script>

<template>
	<aside
		class="flex min-h-0 min-w-0 flex-col border-l border-default bg-(--dms-bg-sidebar)"
		aria-label="Inspector"
	>
		<template v-if="heading">
			<header class="flex shrink-0 items-center gap-2.5 px-3.5 pt-3 pb-2.5">
				<span
					class="grid size-8 shrink-0 place-items-center rounded-md bg-(--dms-accent-tint) text-primary ring-1 ring-(--dms-accent-line) ring-inset"
				>
					<UIcon :name="heading.icon" class="size-[17px]" />
				</span>
				<div class="min-w-0 flex-1">
					<b class="block truncate text-[15px] font-semibold tracking-tight text-highlighted">
						{{ heading.title }}
					</b>
					<span class="block truncate font-mono text-[11px] text-muted">
						{{ heading.subtitle }}
					</span>
				</div>
				<UButton
					v-if="closable"
					icon="i-ph-x"
					size="sm"
					color="neutral"
					variant="ghost"
					aria-label="Close"
					@click="builder.back()"
				/>
				<UButton
					v-else
					icon="i-ph-dots-three"
					size="sm"
					color="neutral"
					variant="ghost"
					aria-label="Block actions"
					@click.stop="openMenu"
				/>
			</header>

			<div class="min-h-0 flex-1 overflow-y-auto border-t border-default px-4 py-4">
				<DmsBuilderPagePanel v-if="session.inspector === 'page'" />
				<DmsBuilderJsonPanel v-else-if="session.inspector === 'json'" />
				<DmsBuilderChangesPanel v-else-if="session.inspector === 'changes'" />
				<DmsBuilderConfig v-else />
			</div>

			<footer
				v-if="session.inspector === 'block' && session.selection"
				class="flex shrink-0 items-center gap-1.5 border-t border-default bg-(--dms-bg-muted) px-3 py-2.5"
			>
				<UButton
					icon="i-ph-copy-light"
					label="Duplicate"
					size="sm"
					color="neutral"
					variant="ghost"
					:disabled="block?.preserve"
					@click="builder.duplicate(session.selection)"
				/>
				<span class="flex-1" />
				<UButton
					icon="i-ph-trash-light"
					label="Remove"
					size="sm"
					color="error"
					variant="ghost"
					title="Remove from the page · ⌫"
					@click="builder.remove(session.selection)"
				/>
			</footer>
			<DmsBuilderChangesFooter v-else-if="session.inspector === 'changes'" />
		</template>

		<!-- Nothing selected: what to do next, not an empty column. -->
		<div v-else class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
			<span
				class="grid size-10 place-items-center rounded-lg bg-elevated text-muted ring-1 ring-default ring-inset"
			>
				<UIcon name="i-ph-cursor-click-light" class="size-5" />
			</span>
			<p class="text-sm font-semibold text-highlighted">Nothing selected</p>
			<p class="max-w-60 text-xs leading-relaxed text-muted">
				Click a block on the page, or pick one in Layers, to change its settings.
				<UKbd value="Esc" size="sm" /> clears the selection.
			</p>
			<UButton
				icon="i-ph-sliders-horizontal-light"
				label="Page settings"
				size="sm"
				color="neutral"
				variant="outline"
				@click="builder.setView('page')"
			/>
		</div>
	</aside>
</template>

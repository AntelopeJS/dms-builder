<script setup lang="ts">
import { computed } from 'vue'
import { useBuilder } from '../runtime/session'

const builder = useBuilder()
const session = builder.session

// A drawer that edits a table's fields or shows the whole page as JSON needs
// room; the design gives those the wide rail.
const WIDE_VIEWS = new Set(['resource', 'json'])
const BACK_VIEWS = new Set(['resource', 'query', 'json', 'pages', 'page'])

const wide = computed(() => WIDE_VIEWS.has(session.value.view))
const canGoBack = computed(() => BACK_VIEWS.has(session.value.view))

interface Heading {
	title: string
	subtitle: string
	/** The steps above this one, read before the title: `Tables / order`. */
	trail?: string[]
}

// Inside the tables the heading says where the author stands, since back
// climbs one step of it at a time.
const tableHeading = computed<Heading>(() => {
	const table = session.value.table
	if (!table) {
		return { title: 'Tables', subtitle: 'Fields and API of each table' }
	}
	const summary = session.value.resources.find((entry) => entry.ref === table.ref)
	const structure = session.value.resourceStructures[table.ref]
	const tableName = structure?.tableName ?? summary?.tableName
	if (table.adding) {
		return {
			trail: ['Tables', table.ref],
			title: 'New field',
			subtitle: tableName ? `A new column of ${tableName}` : '',
		}
	}
	const count = structure?.fields.length
	return {
		trail: ['Tables'],
		title: table.ref,
		subtitle: [
			tableName ? `Table ${tableName}` : '',
			count === undefined ? '' : `${count} field${count === 1 ? '' : 's'}`,
		]
			.filter(Boolean)
			.join(' · '),
	}
})

// A page's settings are reached from the pages they are listed among.
const pageHeading = computed<Heading>(() => {
	const page = session.value.structure?.page
	const title =
		(session.value.draft?.page?.displayName as string | undefined) ??
		page?.displayName
	return {
		trail: ['Pages'],
		title: title || 'Page',
		subtitle: page ? `Page settings · ${page.ref}` : 'Page settings',
	}
})

const heading = computed<Heading>(() => {
	const headings: Record<string, Heading> = {
		library: {
			title: 'Components',
			subtitle: 'Drag onto the page, or click to append',
		},
		config: {
			title:
				builder.selectedDescriptor.value?.label ??
				(builder.selected.value ? 'Block' : 'Selection'),
			subtitle: builder.selected.value
				? `#${builder.selected.value.name}`
				: 'Nothing selected',
		},
		page: pageHeading.value,
		pages: { title: 'Pages', subtitle: 'Pages and categories of the project' },
		resource: tableHeading.value,
		query: { title: 'Queries', subtitle: session.value.pageRef ?? '' },
		json: { title: 'Configuration', subtitle: 'Export and import the page' },
	}
	return headings[session.value.view] ?? { title: '', subtitle: '' }
})
</script>

<template>
	<aside
		class="flex shrink-0 flex-col border-l border-default bg-default transition-[width]"
		:class="wide ? 'w-[620px]' : 'w-[340px]'"
	>
		<div class="flex items-center gap-2 border-b border-default px-3 py-3">
			<UButton
				v-if="canGoBack"
				icon="i-ph-arrow-left"
				size="xs"
				color="neutral"
				variant="ghost"
				aria-label="Back"
				@click="builder.back()"
			/>
			<div class="min-w-0 flex-1">
				<p
					class="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-highlighted"
				>
					<template v-for="(crumb, at) in heading.trail ?? []" :key="at">
						<span class="shrink-0 font-medium text-muted">{{ crumb }}</span>
						<span class="shrink-0 text-dimmed">/</span>
					</template>
					<span class="truncate">{{ heading.title }}</span>
				</p>
				<p class="truncate text-xs text-dimmed">{{ heading.subtitle }}</p>
			</div>
			<UButton
				icon="i-ph-x"
				size="xs"
				color="neutral"
				variant="ghost"
				aria-label="Close the panel"
				@click="session.railOpen = false"
			/>
		</div>

		<div class="flex-1 overflow-y-auto p-4">
			<DmsBuilderPagesPanel v-if="session.view === 'pages'" />
			<DmsBuilderLibrary v-else-if="session.view === 'library'" />
			<DmsBuilderConfig v-else-if="session.view === 'config'" />
			<DmsBuilderPagePanel v-else-if="session.view === 'page'" />
			<DmsBuilderResourcePanel v-else-if="session.view === 'resource'" />
			<DmsBuilderQueryPanel v-else-if="session.view === 'query'" />
			<DmsBuilderJsonPanel v-else-if="session.view === 'json'" />
		</div>
	</aside>
</template>

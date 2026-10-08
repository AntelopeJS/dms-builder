<script setup lang="ts">
import { computed } from 'vue'
import { useBuilder } from '../runtime/session'

/**
 * The tables and the data sources, given the whole width: they serve every
 * page, so they are not squeezed into a rail beside one of them.
 */

const builder = useBuilder()
const session = builder.session

interface Heading {
	title: string
	subtitle: string
	/** The steps above this one, read before the title: `Tables / order`. */
	trail?: string[]
}

// Inside the tables the heading says where the author stands, since back
// climbs one step of it at a time.
const heading = computed<Heading>(() => {
	if (session.value.workspace === 'data') {
		return {
			title: 'Data sources',
			subtitle: `What the blocks of ${session.value.pageRef ?? 'this page'} read`,
		}
	}
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
			subtitle: tableName ? `A new field of ${tableName}` : '',
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

const canGoBack = computed(
	() => session.value.workspace === 'tables' && session.value.table !== null,
)
</script>

<template>
	<section class="flex min-h-0 min-w-0 flex-col bg-default">
		<header class="flex shrink-0 items-center gap-2 border-b border-default px-5 py-3">
			<UButton
				v-if="canGoBack"
				icon="i-ph-arrow-left-light"
				size="sm"
				color="neutral"
				variant="ghost"
				aria-label="Back"
				@click="builder.back()"
			/>
			<div class="min-w-0 flex-1">
				<p
					class="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-highlighted"
				>
					<template v-for="(crumb, at) in heading.trail ?? []" :key="at">
						<span class="shrink-0 font-medium text-muted">{{ crumb }}</span>
						<span class="shrink-0 text-dimmed">/</span>
					</template>
					<span class="truncate">{{ heading.title }}</span>
				</p>
				<p class="truncate text-xs text-dimmed">{{ heading.subtitle }}</p>
			</div>
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto">
			<div class="mx-auto w-full max-w-5xl p-6">
				<DmsBuilderResourcePanel v-if="session.workspace === 'tables'" />
				<DmsBuilderQueryPanel v-else />
			</div>
		</div>
	</section>
</template>

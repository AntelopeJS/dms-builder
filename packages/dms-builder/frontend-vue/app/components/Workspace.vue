<script setup lang="ts">
import { useBuilder } from '../runtime/session'

/**
 * The tables, the data sources, the databases and the theme, given the whole
 * width: they serve every page, so they are not squeezed into a rail beside
 * one of them. The first three show a list beside the open item; the theme
 * shows its editor beside the page.
 */

const session = useBuilder().session
</script>

<template>
	<DmsBuilderResourcePanel v-if="session.workspace === 'tables'" />
	<DmsBuilderDatabasePanel v-else-if="session.workspace === 'database'" />
	<DmsBuilderThemeWorkspace v-else-if="session.workspace === 'theme'" />
	<DmsBuilderQueryPanel v-else />
</template>

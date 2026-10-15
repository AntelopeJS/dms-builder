<script setup lang="ts">
import { useBuilder } from '../runtime/session'

/**
 * The tables, the data sources and the theme, given the whole width: they
 * serve every page, so they are not squeezed into a rail beside one of them.
 * The first two lay themselves out as a list and the one open beside it; the
 * theme as its editor beside the page it paints.
 */

const session = useBuilder().session
</script>

<template>
	<DmsBuilderResourcePanel v-if="session.workspace === 'tables'" />
	<DmsBuilderThemeWorkspace v-else-if="session.workspace === 'theme'" />
	<DmsBuilderQueryPanel v-else />
</template>

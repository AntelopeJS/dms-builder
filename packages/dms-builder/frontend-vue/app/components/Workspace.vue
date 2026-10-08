<script setup lang="ts">
import { useBuilder } from '../runtime/session'

/**
 * The tables and the data sources, given the whole width: they serve every
 * page, so they are not squeezed into a rail beside one of them. Each lays
 * itself out as a list and the one open beside it.
 */

const session = useBuilder().session
</script>

<template>
	<DmsBuilderResourcePanel v-if="session.workspace === 'tables'" />
	<DmsBuilderQueryPanel v-else />
</template>

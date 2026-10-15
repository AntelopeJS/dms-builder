<script setup lang="ts">
/**
 * The theme: its editor, and beside it the page it paints. The page is there
 * to be looked at, not edited — the sidebar and the header around the editor
 * show the theme too, logos included.
 */
</script>

<template>
	<div class="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)]">
		<aside
			class="flex min-h-0 flex-col border-r border-default bg-(--dms-bg-sidebar)"
			aria-label="Theme"
			data-builder-chrome
		>
			<DmsBuilderThemePanel />
		</aside>
		<DmsBuilderCanvas preview />
	</div>
</template>

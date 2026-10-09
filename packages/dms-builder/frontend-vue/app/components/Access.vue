<script setup lang="ts">
import { computed } from 'vue'
import { roleNames, rolesDecide, rolesOpening, rolesSeeing } from '../runtime/access'
import { ROLES_PAGE_PATH } from '../runtime/constants'
import { useBuilder } from '../runtime/session'

/**
 * Who sees a block of the draft, or opens the page: the workspace's roles,
 * read the way the DMS decides it, under the permission the draft gives the
 * page. Said for a block because its permission follows where it sits, so
 * the answer can change with a gesture that looks like layout.
 */
const props = defineProps<{
	/** The block; without one, the page itself. */
	path?: string
}>()

const builder = useBuilder()
const session = builder.session

const line = computed<{ icon: string; text: string; tone: string; title?: string } | null>(() => {
	const access = session.value.access
	const page = builder.pagePermission.value
	if (!access || !page) {
		return null
	}
	if (access.mode === 'everyone') {
		return {
			icon: 'i-ph-users-three-light',
			text: props.path ? 'Every member sees it' : 'Every member opens it',
			tone: 'text-muted',
		}
	}
	if (!rolesDecide(access) || !access.roles) {
		return null
	}
	const roles = props.path
		? rolesSeeing(access, page, props.path)
		: rolesOpening(access, page)
	if (roles.length === 0) {
		return {
			icon: 'i-ph-lock-simple-light',
			text: props.path ? 'Only the owner sees it' : 'Only the owner opens it',
			tone: 'text-warning',
		}
	}
	return {
		icon: 'i-ph-eye-light',
		text: `${props.path ? 'Seen by' : 'Opens for'} ${roleNames(roles)}`,
		tone: 'text-muted',
		title: roles
			.map((role) => `${role.name} · ${role.members} member${role.members === 1 ? '' : 's'}`)
			.join('\n'),
	}
})

function openRoles(): void {
	window.open(ROLES_PAGE_PATH, '_blank', 'noopener')
}
</script>

<template>
	<p
		v-if="line"
		class="flex min-w-0 items-center gap-1.5 text-xs"
		:class="line.tone"
		:title="line.title"
		data-access-line
	>
		<UIcon :name="line.icon" class="size-3.5 shrink-0" />
		<span class="min-w-0 flex-1 truncate">{{ line.text }}</span>
		<button
			type="button"
			class="shrink-0 underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100"
			@click="openRoles"
		>
			Roles
		</button>
	</p>
</template>

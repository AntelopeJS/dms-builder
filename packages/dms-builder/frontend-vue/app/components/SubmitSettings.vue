<script setup lang="ts">
import { computed, ref } from 'vue'
import { readAfterSubmit, writeAfterSubmit } from '../runtime/after-submit'
import { useBlockPanel } from '../runtime/block-panel'
import { byMenuOrder } from '../runtime/categories'
import { CARD_FIELD_UI, PANEL_CARD } from '../runtime/form-panel'
import { useBuilder } from '../runtime/session'

/**
 * What a form does once it is sent, as someone building a page sets it up:
 * what it says, and the page it goes to — all behind one switch, off until
 * the form is told otherwise. Shared by the forms the simple mode has a panel
 * for.
 */
const props = defineProps<{
	path: string
	/**
	 * The variable the row the form saves is known by once it is sent. Given,
	 * the page it goes to can be opened on that row.
	 */
	savedRow?: string
}>()

const builder = useBuilder()
const session = builder.session
const block = useBlockPanel(() => props.path)
const { config, text, write } = block

/** What a form says of itself until it is told otherwise. */
const SUBMIT_TEXTS = ['submitLabel', 'successMessage', 'errorMessage'] as const
/**
 * The texts turned on with the form's own words in them. A failure left
 * empty shows what the server answered, which says more than any default.
 */
const SEEDED_TEXTS = ['submitLabel', 'successMessage'] as const
/** Everything behind the switch: what it says, and where it goes. */
const SUBMIT_OPTIONS = [...SUBMIT_TEXTS, 'redirectOnSuccess'] as const
/**
 * The one choice of the page to go to that means going nowhere. A menu item
 * cannot stand for an empty value, and no page's address lacks its slash.
 */
const STAY = 'stay'

function placeholder(key: string): string | undefined {
	return block.options.value[key]?.ui?.placeholder
}

/* ---- where it goes once sent ------------------------------------------- */

const then = computed(() =>
	readAfterSubmit(text('redirectOnSuccess'), props.savedRow !== undefined),
)

/**
 * The pages it can go to, by category the way the menu lists them. An address
 * that is no page — one written in code, with a variable in it — is kept as
 * the choice it is.
 */
const thenItems = computed(() => {
	const items: Array<Record<string, unknown>> = [
		{ label: 'Stay on the page', value: STAY, icon: 'i-ph-map-pin' },
	]
	const pages = session.value.pages
	const page = then.value?.page
	if (page && !pages.some((entry) => entry.ref === page)) {
		items.push({ label: page, value: page, icon: 'i-ph-link' })
	}
	for (const category of session.value.categories) {
		const listed = pages
			.filter((entry) => entry.category === category.ref)
			.sort(byMenuOrder)
		if (!listed.length) continue
		items.push({ type: 'label', label: category.displayName })
		for (const entry of listed) {
			items.push({
				label: entry.displayName,
				value: entry.ref,
				description: entry.ref,
				icon: entry.icon ?? 'i-ph-file',
			})
		}
	}
	return items
})

const thenIcon = computed(() => {
	const page = then.value?.page
	return page
		? (session.value.pages.find((entry) => entry.ref === page)?.icon ??
				'i-ph-arrow-right')
		: 'i-ph-map-pin'
})

/** Another page keeps the row it was to be opened on. */
function goTo(choice: unknown): void {
	const page = choice === STAY ? undefined : String(choice)
	write(
		'redirectOnSuccess',
		writeAfterSubmit(page, then.value?.openRow ?? false, props.savedRow),
	)
}

function openRow(on: boolean): void {
	write(
		'redirectOnSuccess',
		writeAfterSubmit(then.value?.page, on, props.savedRow),
	)
}

/* ---- its own words ------------------------------------------------------ */

/**
 * Whether the switch is on with nothing written yet: an author who turns it on
 * and clears what it seeded is still looking at the boxes.
 */
const opened = ref(false)

const customized = computed(
	() => opened.value || SUBMIT_OPTIONS.some((key) => config.value[key] !== undefined),
)
const offersSubmit = computed(() => SUBMIT_OPTIONS.some((key) => block.has(key)))

/**
 * Turned on, the texts start from what the form says by itself — a failure
 * from what the server answers —, and it still stays on the page; turned off,
 * everything goes and the form says its own again, and stays. One edit either
 * way.
 */
function customize(on: boolean): void {
	opened.value = on
	const values: Record<string, unknown> = {}
	if (on) {
		for (const key of SEEDED_TEXTS) {
			if (block.has(key)) {
				values[key] = config.value[key] ?? placeholder(key)
			}
		}
	} else {
		for (const key of SUBMIT_OPTIONS) {
			if (block.has(key)) {
				values[key] = undefined
			}
		}
	}
	block.patch(values)
}
</script>

<template>
	<section v-if="offersSubmit" :class="PANEL_CARD" aria-label="Custom submit">
		<div class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between gap-3">
				<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
					<UIcon name="i-ph-paper-plane-tilt" class="size-4 text-primary" />
					Custom submit
				</p>
				<USwitch
					:model-value="customized"
					aria-label="Custom submit"
					@update:model-value="customize($event === true)"
				/>
			</div>
			<p class="text-[13px]/[18px] text-muted">
				Off: default texts, and the form stays on the page.
			</p>
		</div>
		<div v-if="customized" class="flex flex-col gap-3">
			<UFormField v-if="block.has('submitLabel')" label="Button text" :ui="CARD_FIELD_UI">
				<UInput
					class="w-full"
					:model-value="text('submitLabel')"
					placeholder="Submit"
					@update:model-value="write('submitLabel', String($event))"
				/>
			</UFormField>
			<UFormField v-if="block.has('successMessage')" label="On success" :ui="CARD_FIELD_UI">
				<UInput
					class="w-full"
					:model-value="text('successMessage')"
					:placeholder="placeholder('successMessage')"
					@update:model-value="write('successMessage', String($event))"
				/>
			</UFormField>
			<UFormField v-if="block.has('errorMessage')" label="On failure" :ui="CARD_FIELD_UI">
				<UInput
					class="w-full"
					:model-value="text('errorMessage')"
					placeholder="The server's message"
					@update:model-value="write('errorMessage', String($event))"
				/>
			</UFormField>
			<template v-if="block.has('redirectOnSuccess')">
				<UFormField label="After submission" :ui="CARD_FIELD_UI">
					<USelectMenu
						class="w-full"
						:model-value="then?.page ?? STAY"
						:items="thenItems"
						value-key="value"
						:icon="thenIcon"
						:search-input="{ placeholder: 'Find a page…', icon: 'i-ph-magnifying-glass' }"
						@update:model-value="goTo($event)"
					/>
				</UFormField>
				<UFormField
					v-if="savedRow && then"
					label="Open it on the row just saved"
					description="For a page whose table form edits or shows a row."
					orientation="horizontal"
					:ui="CARD_FIELD_UI"
				>
					<USwitch
						:model-value="then.openRow"
						@update:model-value="openRow($event === true)"
					/>
				</UFormField>
			</template>
		</div>
	</section>
</template>

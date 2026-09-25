<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { byMenuOrder } from '../runtime/categories'
import { useFormBlock } from '../runtime/form-panel'
import { useBuilder } from '../runtime/session'

/**
 * A form, as someone building a page sets one up: what it is called, the table
 * it saves into and the columns it asks for, how its labels sit, and what
 * happens once it is sent. Addresses and methods are the advanced view's.
 */
const props = defineProps<{ path: string }>()

const builder = useBuilder()
const session = builder.session
const form = useFormBlock(() => props.path)

/** Beside the field is where a form puts its labels when nothing says. */
const ORIENTATIONS = [
	{ value: 'horizontal', label: 'Beside the field', icon: 'i-ph-columns' },
	{ value: 'vertical', label: 'Above it', icon: 'i-ph-rows' },
]
const ORIENTATION_DEFAULT = 'horizontal'

/** What a form says of itself until it is told otherwise, behind one switch. */
const SUBMIT_TEXTS = ['submitLabel', 'successMessage', 'errorMessage'] as const
/**
 * The one choice of the page to go to that means going nowhere. A menu item
 * cannot stand for an empty value, and no page's address lacks its slash.
 */
const STAY = 'stay'

const { config, text, write } = form

function placeholder(key: string): string | undefined {
	return form.options.value[key]?.ui?.placeholder
}

watch(
	() => form.table.value?.ref,
	(ref) => {
		if (ref) void builder.loadResource(ref)
	},
	{ immediate: true },
)

/* ---- where it goes once sent ------------------------------------------- */

const redirect = computed(() => text('redirectOnSuccess'))

/**
 * The pages it can go to, by category the way the menu lists them. An address
 * that is no page — one written in code, with a row's id in it — is kept as
 * the choice it is.
 */
const thenItems = computed(() => {
	const items: Array<Record<string, unknown>> = [
		{ label: 'Stay on the page', value: STAY, icon: 'i-ph-map-pin' },
	]
	const pages = session.value.pages
	if (redirect.value && !pages.some((page) => page.ref === redirect.value)) {
		items.push({ label: redirect.value, value: redirect.value, icon: 'i-ph-link' })
	}
	for (const category of session.value.categories) {
		const listed = pages
			.filter((page) => page.category === category.ref)
			.sort(byMenuOrder)
		if (!listed.length) continue
		items.push({ type: 'label', label: category.displayName })
		for (const page of listed) {
			items.push({
				label: page.displayName,
				value: page.ref,
				description: page.ref,
				icon: page.icon ?? 'i-ph-file',
			})
		}
	}
	return items
})

const thenIcon = computed(() =>
	redirect.value
		? (session.value.pages.find((page) => page.ref === redirect.value)?.icon ??
			'i-ph-arrow-right')
		: 'i-ph-map-pin',
)

/* ---- its own words ------------------------------------------------------ */

/**
 * Whether the switch is on with nothing written yet: an author who turns it on
 * and clears what it seeded is still looking at the boxes.
 */
const opened = ref(false)

const customized = computed(
	() => opened.value || SUBMIT_TEXTS.some((key) => config.value[key] !== undefined),
)
const offersSubmitTexts = computed(() => SUBMIT_TEXTS.some((key) => form.has(key)))

/**
 * Turned on, the messages start from what the form says by itself; turned
 * off, all three go and the form says its own again. One edit either way.
 */
function customize(on: boolean): void {
	opened.value = on
	const values: Record<string, unknown> = {}
	for (const key of SUBMIT_TEXTS) {
		if (form.has(key)) {
			values[key] = on ? (config.value[key] ?? placeholder(key)) : undefined
		}
	}
	form.patch(values)
}
</script>

<template>
	<div class="flex flex-col gap-6">
		<div
			v-if="form.has('title') || form.has('description')"
			class="flex flex-col gap-3"
		>
			<UFormField v-if="form.has('title')" label="Title">
				<UInput
					class="w-full"
					:model-value="text('title')"
					size="lg"
					placeholder="Shown above the fields — optional"
					@update:model-value="write('title', String($event))"
				/>
			</UFormField>
			<UFormField v-if="form.has('description')" label="Description">
				<UTextarea
					class="w-full"
					:model-value="text('description')"
					:rows="2"
					placeholder="Shown under the title — optional"
					@update:model-value="write('description', String($event))"
				/>
			</UFormField>
		</div>

		<DmsBuilderFormTarget :path="path" />
		<DmsBuilderFormFields :path="path" />

		<div v-if="form.has('fieldsOrientation')" class="flex flex-col gap-3">
			<p class="text-xs font-semibold text-toned">Layout</p>
			<UFormField label="Labels">
				<DmsSegmented
					:model-value="text('fieldsOrientation') || ORIENTATION_DEFAULT"
					:items="ORIENTATIONS"
					aria-label="Labels"
					@update:model-value="write('fieldsOrientation', $event)"
				/>
			</UFormField>
		</div>

		<div
			v-if="form.has('redirectOnSuccess') || offersSubmitTexts"
			class="flex flex-col gap-3"
		>
			<p class="text-xs font-semibold text-toned">Submit</p>
			<UFormField v-if="form.has('redirectOnSuccess')" label="Then">
				<USelectMenu
					class="w-full"
					:model-value="redirect || STAY"
					:items="thenItems"
					value-key="value"
					:icon="thenIcon"
					:search-input="{ placeholder: 'Find a page…', icon: 'i-ph-magnifying-glass' }"
					@update:model-value="
						write('redirectOnSuccess', $event === STAY ? undefined : String($event))
					"
				/>
			</UFormField>
			<template v-if="offersSubmitTexts">
				<UFormField
					label="Customize submit"
					description="The button's text, and the notices once it's sent. Off, the form says its own."
					orientation="horizontal"
				>
					<USwitch
						:model-value="customized"
						@update:model-value="customize($event === true)"
					/>
				</UFormField>
				<div
					v-if="customized"
					class="flex flex-col gap-3 border-l border-default pl-3"
				>
					<UFormField v-if="form.has('submitLabel')" label="Button">
						<UInput
							class="w-full"
							:model-value="text('submitLabel')"
							icon="i-ph-cursor-click"
							placeholder="Submit"
							@update:model-value="write('submitLabel', String($event))"
						/>
					</UFormField>
					<UFormField v-if="form.has('successMessage')" label="Once saved">
						<UInput
							class="w-full"
							:model-value="text('successMessage')"
							icon="i-ph-check-circle"
							:placeholder="placeholder('successMessage')"
							@update:model-value="write('successMessage', String($event))"
						/>
					</UFormField>
					<UFormField
						v-if="form.has('errorMessage')"
						label="When it fails"
						help="Left empty, the form shows what the server answered."
					>
						<UInput
							class="w-full"
							:model-value="text('errorMessage')"
							icon="i-ph-warning-circle"
							:placeholder="placeholder('errorMessage')"
							@update:model-value="write('errorMessage', String($event))"
						/>
					</UFormField>
				</div>
			</template>
		</div>
	</div>
</template>

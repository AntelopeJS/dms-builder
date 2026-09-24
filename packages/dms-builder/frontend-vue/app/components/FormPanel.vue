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

const config = form.config

function text(key: string): string {
	const value = config.value[key]
	return typeof value === 'string' ? value : ''
}

function write(key: string, value: string | undefined): void {
	form.patch({ [key]: value === '' ? undefined : value })
}

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
 * The forms whose switch is on with nothing written yet: an author who turns
 * it on and clears what it seeded is still looking at the boxes.
 */
const opened = ref(new Set<string>())

const customized = computed(
	() =>
		opened.value.has(props.path) ||
		SUBMIT_TEXTS.some((key) => config.value[key] !== undefined),
)
const offersSubmitTexts = computed(() => SUBMIT_TEXTS.some((key) => form.has(key)))

/**
 * Turned on, the messages start from what the form says by itself; turned
 * off, all three go and the form says its own again. One edit either way.
 */
function customize(on: boolean): void {
	const next = new Set(opened.value)
	if (on) {
		next.add(props.path)
	} else {
		next.delete(props.path)
	}
	opened.value = next
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
	<div class="flex flex-col gap-[22px]">
		<div
			v-if="form.has('title') || form.has('description')"
			class="flex flex-col gap-3"
		>
			<div v-if="form.has('title')" class="flex flex-col gap-1.5">
				<label for="form-title" class="text-xs font-medium text-toned">Title</label>
				<UInput
					id="form-title"
					:model-value="text('title')"
					size="lg"
					placeholder="Shown above the fields — optional"
					@update:model-value="write('title', String($event))"
				/>
			</div>
			<div v-if="form.has('description')" class="flex flex-col gap-1.5">
				<label for="form-description" class="text-xs font-medium text-toned">
					Description
				</label>
				<UTextarea
					id="form-description"
					:model-value="text('description')"
					:rows="2"
					placeholder="Shown under the title — optional"
					@update:model-value="write('description', String($event))"
				/>
			</div>
		</div>

		<DmsBuilderFormTarget :path="path" />
		<DmsBuilderFormFields :path="path" />

		<div v-if="form.has('fieldsOrientation')" class="flex flex-col gap-3">
			<p class="text-xs font-semibold text-toned">Layout</p>
			<div class="flex flex-col gap-1.5">
				<p class="text-xs font-medium text-toned">Labels</p>
				<div
					role="group"
					aria-label="Labels"
					class="flex rounded-md border border-accented bg-default p-0.5"
				>
					<UButton
						v-for="entry in ORIENTATIONS"
						:key="entry.value"
						:icon="entry.icon"
						:label="entry.label"
						size="xs"
						:color="
							(text('fieldsOrientation') || ORIENTATION_DEFAULT) === entry.value
								? 'primary'
								: 'neutral'
						"
						:variant="
							(text('fieldsOrientation') || ORIENTATION_DEFAULT) === entry.value
								? 'soft'
								: 'ghost'
						"
						:aria-pressed="
							(text('fieldsOrientation') || ORIENTATION_DEFAULT) === entry.value
						"
						class="flex-1 justify-center"
						@click="form.patch({ fieldsOrientation: entry.value })"
					/>
				</div>
			</div>
		</div>

		<div
			v-if="form.has('redirectOnSuccess') || offersSubmitTexts"
			class="flex flex-col gap-3"
		>
			<p class="text-xs font-semibold text-toned">Submit</p>
			<div v-if="form.has('redirectOnSuccess')" class="flex flex-col gap-1.5">
				<label class="text-xs font-medium text-toned">Then</label>
				<USelectMenu
					:model-value="redirect || STAY"
					:items="thenItems"
					value-key="value"
					:icon="thenIcon"
					aria-label="Then"
					:search-input="{ placeholder: 'Find a page…', icon: 'i-ph-magnifying-glass' }"
					@update:model-value="
						write('redirectOnSuccess', $event === STAY ? undefined : String($event))
					"
				/>
			</div>
			<template v-if="offersSubmitTexts">
				<div class="flex items-center gap-4">
					<div class="min-w-0 flex-1">
						<p class="text-[13px] text-default">Customize submit</p>
						<p class="text-xs text-muted">
							The button's text, and the notices once it's sent. Off, the form
							says its own.
						</p>
					</div>
					<USwitch
						:model-value="customized"
						aria-label="Customize submit"
						@update:model-value="customize($event === true)"
					/>
				</div>
				<div
					v-if="customized"
					class="flex flex-col gap-3 border-l border-default pl-3"
				>
					<div v-if="form.has('submitLabel')" class="flex flex-col gap-1.5">
						<label
							for="form-submit-label"
							class="flex items-center gap-1.5 text-xs font-medium text-toned"
						>
							<UIcon name="i-ph-cursor-click" class="size-3.5 text-muted" />
							Button
						</label>
						<UInput
							id="form-submit-label"
							:model-value="text('submitLabel')"
							placeholder="Submit"
							@update:model-value="write('submitLabel', String($event))"
						/>
					</div>
					<div v-if="form.has('successMessage')" class="flex flex-col gap-1.5">
						<label
							for="form-success"
							class="flex items-center gap-1.5 text-xs font-medium text-toned"
						>
							<UIcon name="i-ph-check-circle" class="size-3.5 text-primary" />
							Once saved
						</label>
						<UInput
							id="form-success"
							:model-value="text('successMessage')"
							:placeholder="placeholder('successMessage')"
							@update:model-value="write('successMessage', String($event))"
						/>
					</div>
					<div v-if="form.has('errorMessage')" class="flex flex-col gap-1.5">
						<label
							for="form-error"
							class="flex items-center gap-1.5 text-xs font-medium text-toned"
						>
							<UIcon name="i-ph-warning-circle" class="size-3.5 text-error" />
							When it fails
						</label>
						<UInput
							id="form-error"
							:model-value="text('errorMessage')"
							:placeholder="placeholder('errorMessage')"
							@update:model-value="write('errorMessage', String($event))"
						/>
						<p class="text-xs text-muted">
							Left empty, the form shows what the server answered.
						</p>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>

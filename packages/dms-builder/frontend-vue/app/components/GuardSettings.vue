<script setup lang="ts">
import { computed } from 'vue'
import { descriptorOf, offeredIn } from '../runtime/catalog'
import { GUARD_BLOCK } from '../runtime/constants'
import { findNode, joinPath } from '../runtime/draft'
import { PANEL_CARD } from '../runtime/form-panel'
import { useBuilderMode } from '../runtime/mode'
import { useBuilder } from '../runtime/session'
import { contentGuard, guardContent, unguardContent } from '../runtime/wrappers'

/**
 * "When there's nothing to show": a container's content — a card's body, a
 * section's rows, a tab — gives way to one message when a source says there is
 * nothing, instead of a set of empty blocks. What is checked is picked like
 * any data source, as a count; the message is a title and a line. The guard
 * that does it is the editor's to write, inside the container.
 */
const props = defineProps<{
	/** The container. */
	path: string
	/** The container's region it guards — a tab —; its body when absent. */
	region?: string
	/** Said in a line of a list rather than a section of its own. */
	inline?: boolean
}>()

const builder = useBuilder()
const session = builder.session
const { advanced } = useBuilderMode()

const container = computed(() =>
	session.value.draft ? findNode(session.value.draft, props.path) : undefined,
)
const guard = computed(() => contentGuard(container.value, props.region))
const guardPath = computed(() =>
	guard.value ? joinPath(props.path, guard.value.name) : undefined,
)
/** Whether there is anything to guard: a guard over nothing would go on the next edit. */
const holds = computed(() =>
	(container.value?.children ?? []).some((child) => child.slot === props.region),
)
const descriptor = computed(() => descriptorOf(session.value.catalog, GUARD_BLOCK))
const config = computed(() => guard.value?.config ?? {})
const fallback = computed(
	() => (config.value.fallback as Record<string, unknown> | undefined) ?? {},
)

function toggle(on: boolean): void {
	builder.mutate((draft) => {
		if (on) {
			guardContent(draft, props.path, props.region)
		} else {
			unguardContent(draft, props.path, props.region)
		}
	})
}

function patch(values: Record<string, unknown>): void {
	if (guardPath.value) {
		builder.patchConfig(guardPath.value, values)
	}
}

/**
 * The source is picked as one figure — a count, a sum —, so what is checked is
 * that figure: nothing counted, nothing to show.
 */
function setSource(values: Record<string, unknown>): void {
	patch({ ...values, field: values.fetchUrl ? 'value' : undefined })
}

function setMessage(key: 'title' | 'description', value: string): void {
	const next = { ...fallback.value, [key]: value.trim() ? value : undefined }
	patch({ fallback: Object.values(next).some((entry) => entry !== undefined) ? next : undefined })
}

/** What a developer may set besides: what is checked, and on which condition. */
const advancedOptions = computed(() =>
	advanced.value
		? (['when', 'field', 'realtimeTopic'] as const).flatMap((key) => {
				const schema = descriptor.value?.config[key]
				return schema && offeredIn(schema, true) ? [{ key, schema }] : []
			})
		: [],
)
</script>

<template>
	<component
		:is="inline ? 'div' : 'section'"
		v-if="descriptor"
		:class="inline ? 'flex flex-col gap-2' : PANEL_CARD"
		aria-label="When there's nothing to show"
		data-guard-settings
	>
		<div class="flex items-center gap-3">
			<USwitch
				:model-value="!!guard"
				:disabled="!guard && !holds"
				aria-label="Show a message when there's nothing to show"
				@update:model-value="toggle($event === true)"
			/>
			<span class="min-w-0 flex-1 text-sm text-default">
				Show a message when there's nothing to show
			</span>
		</div>
		<p v-if="!guard && !holds" class="text-xs text-muted">
			Add a block here first: the message stands in for what it holds.
		</p>

		<div v-if="guard && guardPath" class="flex flex-col gap-3 border-l border-default pl-3">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm text-muted">When this counts nothing</span>
				<DmsBuilderDataSource
					:key="guardPath"
					:model-value="config.fetchUrl"
					response-shape="value"
					period-option="periodScope"
					:block-name="guard.name"
					@patch="setSource"
				/>
			</div>
			<UFormField label="Message">
				<UInput
					:model-value="(fallback.title as string | undefined) ?? ''"
					placeholder="Nothing to show yet"
					class="w-full"
					aria-label="Message title"
					@update:model-value="setMessage('title', String($event))"
				/>
			</UFormField>
			<UFormField label="Under it">
				<UTextarea
					:model-value="(fallback.description as string | undefined) ?? ''"
					placeholder="What to do to see something here"
					:rows="2"
					class="w-full"
					aria-label="Message description"
					@update:model-value="setMessage('description', String($event))"
				/>
			</UFormField>
			<DmsBuilderOption
				v-for="option in advancedOptions"
				:key="option.key"
				:name="option.key"
				:schema="option.schema"
				:model-value="config[option.key]"
				@update:model-value="patch({ [option.key]: $event })"
			/>
		</div>
	</component>
</template>

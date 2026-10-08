<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBlockPanel } from '../runtime/block-panel'
import { findNode, parentPath } from '../runtime/draft'
import { PANEL_CARD } from '../runtime/form-panel'
import { useBuilder } from '../runtime/session'
import {
	FIXED_GAP,
	fixedGapPatch,
	shownSpacerRoom,
	SPACER_ROOMS,
	linesHeight,
	SPACER_LINE_PX,
	spacerAxis,
	spacerGrow,
	spacerRoomPatch,
	type SpacerRoom,
} from '../runtime/spacer-panel'

/**
 * A spacer, as someone building a page sets one up: by how much room it
 * takes, each way drawn beside its name, and only the setting that way asks
 * for under the one picked. Its three numbers are the advanced view's.
 */
const props = defineProps<{ path: string }>()

const { block, config, patch, write, text } = useBlockPanel(() => props.path)
const builder = useBuilder()

const picked = ref<SpacerRoom | null>(null)
const room = computed(() => shownSpacerRoom(picked.value, config.value))
const grow = computed(() => spacerGrow(config.value))

/**
 * What its share counts in: the columns it spans in a row of the grid, lines
 * stacked between blocks, else its part of the room left free.
 */
const axis = computed(() => {
	const parent = parentPath(props.path)
	const draft = builder.session.value.draft
	return spacerAxis(parent === null ? null : draft && findNode(draft, parent)?.type)
})
const share = computed(() =>
	axis.value === 'columns' ? Number(block.value?.meta?.colSpan) || 1 : grow.value,
)
const shareHint = computed(() => {
	if (axis.value === 'columns') {
		return 'In a row, its share is the columns it takes: a share of 2 takes two.'
	}
	return axis.value === 'lines'
		? `Stacked, its share is the lines it takes, ${SPACER_LINE_PX}px each: a share of 2 takes two.`
		: 'Beside another spacer, a share of 2 takes twice the room.'
})

function choose(next: SpacerRoom): void {
	if (next !== room.value) {
		patch(spacerRoomPatch(next, config.value, axis.value))
	}
	picked.value = next
}

function setShare(value: number | null | undefined): void {
	if (typeof value !== 'number') {
		return
	}
	if (axis.value === 'columns') {
		builder.patchMeta(props.path, { colSpan: value > 1 ? value : undefined })
		return
	}
	// Stacked, the free room is that many lines high; within limits, the
	// limits are the author's.
	patch(
		axis.value === 'lines' && room.value === 'fill'
			? { grow: value, minSize: linesHeight(value) }
			: { grow: value },
	)
}
</script>

<template>
	<section :class="PANEL_CARD" aria-label="Size">
		<p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
			<UIcon name="i-ph-layout-light" class="size-4 text-primary" />
			Size
		</p>

		<fieldset class="flex flex-col gap-2">
			<legend class="mb-2.5 text-sm font-medium text-default">
				How much room does it take?
			</legend>

			<div
				v-for="choice in SPACER_ROOMS"
				:key="choice.room"
				class="flex flex-col gap-3 rounded-[10px] border p-2.5 transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-primary"
				:class="
					choice.room === room
						? 'border-primary/55 bg-primary/8'
						: 'border-default bg-default hover:border-accented'
				"
			>
				<label class="flex cursor-pointer items-center gap-3">
					<input
						type="radio"
						class="sr-only"
						:name="`${path}:room`"
						:value="choice.room"
						:checked="choice.room === room"
						@change="choose(choice.room)"
					/>
					<!-- The row a spacer sits in, drawn: two blocks, the spacer between
					them the way this choice lays it out. -->
					<span
						aria-hidden="true"
						class="flex h-8.5 w-19 shrink-0 items-center gap-[3px] rounded-[5px] border border-default bg-default p-1"
						:class="{ 'opacity-55': choice.room !== room }"
					>
						<span class="h-full w-2.5 shrink-0 rounded-xs bg-accented" />
						<span
							v-if="choice.room === 'fill'"
							class="flex h-full flex-1 items-center justify-center rounded-xs border border-primary/60 bg-primary/15"
						>
							<UIcon
								name="i-ph-arrows-out-line-horizontal-light"
								class="size-3.5 text-primary"
							/>
						</span>
						<span
							v-else-if="choice.room === 'fixed'"
							class="h-full w-1.5 shrink-0 rounded-xs bg-primary/85"
						/>
						<span
							v-else
							class="h-full w-[46%] shrink-0 border-x-2 border-primary bg-primary/15"
						/>
						<span class="h-full w-2.5 shrink-0 rounded-xs bg-accented" />
						<span v-if="choice.room === 'fixed'" class="flex-1" />
						<span
							v-else-if="choice.room === 'bounded'"
							class="flex-1 border-t border-dashed border-accented"
						/>
					</span>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="text-sm font-medium text-highlighted">
							{{ choice.label }}
						</span>
						<span class="text-xs text-dimmed">{{ choice.description }}</span>
					</span>
					<span
						class="flex size-4.5 shrink-0 items-center justify-center rounded-full"
						:class="
							choice.room === room
								? 'bg-primary'
								: 'border-[1.5px] border-accented'
						"
					>
						<UIcon
							v-if="choice.room === room"
							name="i-ph-check-bold"
							class="size-3 text-inverted"
						/>
					</span>
				</label>

				<div
					v-if="choice.room === room && room === 'fixed'"
					class="flex flex-col gap-1.5"
				>
					<label :for="`${path}:gap`" class="text-[13px]/[18px] text-toned">
						Size of the gap
					</label>
					<UInput
						:id="`${path}:gap`"
						:model-value="text('minSize')"
						:placeholder="FIXED_GAP"
						size="sm"
						@update:model-value="patch(fixedGapPatch(String($event)))"
					/>
					<p class="text-xs text-dimmed">A length, as 24px, 2rem or 5%.</p>
				</div>

				<div
					v-if="choice.room === room && room === 'bounded'"
					class="grid grid-cols-2 gap-2"
				>
					<div class="flex flex-col gap-1.5">
						<label :for="`${path}:min`" class="text-[13px]/[18px] text-toned">
							At least
						</label>
						<UInput
							:id="`${path}:min`"
							:model-value="text('minSize')"
							placeholder="None"
							size="sm"
							@update:model-value="write('minSize', $event)"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<label :for="`${path}:max`" class="text-[13px]/[18px] text-toned">
							At most
						</label>
						<UInput
							:id="`${path}:max`"
							:model-value="text('maxSize')"
							placeholder="No limit"
							size="sm"
							@update:model-value="write('maxSize', $event)"
						/>
					</div>
				</div>

				<template v-if="choice.room === room && room !== 'fixed'">
					<div class="flex items-center justify-between gap-2.5">
						<label :for="`${path}:share`" class="text-[13px]/[18px] text-toned">
							Share of the room
						</label>
						<UInputNumber
							:id="`${path}:share`"
							:model-value="share"
							:min="1"
							size="sm"
							:increment="{ 'aria-label': 'A larger share' }"
							:decrement="{ 'aria-label': 'A smaller share' }"
							class="w-24 shrink-0"
							@update:model-value="setShare"
						/>
					</div>
					<p class="text-xs text-dimmed">
						{{ shareHint }}
					</p>
				</template>
			</div>
		</fieldset>
	</section>
</template>

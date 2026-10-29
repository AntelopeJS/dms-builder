import { computed, ref, watch } from 'vue'
import {
	descriptorOf,
	heldChildren,
	isStructural,
	missingConfig,
	resolvedPreview,
	servedNodeAt,
	slotsOf,
} from '../runtime/catalog'
import { isRowContainer, namedHost } from '../runtime/dropping'
import {
	ROOM_BLOCKS,
	savedConfigAt,
	sourceKeyOf,
	withDraftEdits,
	withDraftSource,
} from '../runtime/canvas-options'
import { GUARD_BLOCK, LIVE_TOGGLE } from '../runtime/constants'
import { sourceQuery } from '../runtime/data-source'
import { joinPath } from '../runtime/draft'
import { useBuilderMode } from '../runtime/mode'
import { blockTitle } from '../runtime/naming'
import { useBuilder } from '../runtime/session'
import { type Props } from './Node'

export function useNodePart1(scope: { props: Readonly<Props> }) {
	const { props } = scope

const builder = useBuilder()
const session = builder.session

const descriptor = computed(() =>
	descriptorOf(session.value.catalog, props.block.type),
)
const { advanced } = useBuilderMode()
/** What the page calls the block: its title, never its name in the code. */
const title = computed(() => blockTitle(props.block, session.value.catalog))
const selected = computed(() => session.value.selection === props.path)
const hovered = computed(() => session.value.hovered === props.path)
const missing = computed(() => missingConfig(descriptor.value, props.block))
// `degraded` addresses a block the way the engine does, `<pageRef>#<path>`.
const degraded = computed(() => {
	const ref = session.value.pageRef ?? ''
	return session.value.degraded.some(
		(entry) => entry.replace(`${ref}#`, '') === props.path,
	)
})

/**
 * A block the preview stood in for renders from what the DMS served, so a table
 * shows its real columns instead of a placeholder.
 *
 * Only while the served node is this block, though. A page never compiled with
 * a required setting left empty, so a block that still has one was never the
 * one the server is serving — it is a block being built at a path something
 * else was saved at, and rendering what was saved there shows an author
 * content their draft no longer holds. Looking the path up is what could not
 * tell the two apart: re-adding a block under the name of the one it replaced
 * finds the old one every time.
 */
const served = computed(() =>
	degraded.value && !missing.value.length
		? servedNodeAt(session.value.served, props.path)
		: undefined,
)
/**
 * A block the builder cannot rewrite still shows the way the page shows it,
 * from what the DMS served, and never as the preview's stand-in, which only
 * knows it could not build it. That holds only while the block contains nothing.
 * The draft does not carry its contents, so a container would render empty.
 */
const rendered = computed(() => {
	if (props.block.preserve) {
		return served.value?.children?.length ? undefined : served.value
	}
	return served.value ?? props.preview
})
/**
 * A live page's switch draws nothing on a page that is not live, and the
 * canvas never is: it is drawn as the page will draw it, Live / Pause, so the
 * block an author placed — or the page's live setting did — is there to see.
 */
const live = computed(() => props.block.type === LIVE_TOGGLE)

/**
 * A guard is drawn as what it holds, never as the message it would show:
 * on the page, a source saying there is nothing gives the content's place to
 * the message, and the canvas is where that content is built — an author
 * cannot edit what a message stands in front of. The message is set up in its
 * container's panel.
 */
const resolved = computed(() =>
	rendered.value && props.block.type !== GUARD_BLOCK && !live.value
		? resolveDmsComponent(rendered.value.componentName)
		: undefined,
)

/**
 * What the block is rendered with: what was served for it, with the draft's
 * edits the served shape cannot carry — a setting typed since the page was
 * saved, a source measured anew — so the canvas follows the draft as it does
 * wherever the preview builds the block.
 */
const options = computed(() => {
	const shown = served.value
		? withDraftEdits(
				rendered.value?.options,
				descriptor.value,
				savedConfigAt(session.value.structure?.blocks, props.path),
				props.block.config,
			)
		: rendered.value?.options
	return withDraftSource(
		shown,
		descriptor.value,
		sourceQuery(session.value.draft, session.value.structure, props.block.name),
	)
})
const sourceKey = computed(() => sourceKeyOf(options.value, descriptor.value))
/**
 * A block that is nothing but room — a spacer — is invisible on the page, and
 * on the canvas its size would change with nothing to show it: drawn as a
 * hatched area, sized the way the page sizes it.
 */
const room = computed(() => ROOM_BLOCKS.has(props.block.type ?? ''))
const label = computed(
	() => descriptor.value?.label ?? props.block.type ?? 'Block',
)
const standInNote = computed(() =>
	missing.value.length
		? `Waiting on ${missing.value.join(', ')}`
		: 'Renders once saved — this block needs the running page',
)

const children = computed(() =>
	(props.block.children ?? []).map((child) => ({
		block: child,
		path: joinPath(props.path, child.name),
		preview: rendered.value?.children?.find((entry) => entry.id === child.name)
			?.component,
	})),
)
/**
 * What the block holds through its settings — a card's chart —, rendered inside
 * it as the page renders it. Without it a card showed its figure over nothing.
 */
const held = computed(() =>
	heldChildren(descriptor.value, rendered.value).map((child) =>
		resolvedPreview(child, resolveDmsComponent),
	),
)
const slotted = computed(() => children.value.filter((child) => child.block.slot))
const plain = computed(() => children.value.filter((child) => !child.block.slot))
/**
 * The region the rendered block is showing, reported as it changes.
 *
 * A tab set is the one container that hides part of what it holds, and it is
 * the only thing that knows which part: it exposes the tab it has open, as an
 * index into the regions its own options declare. Without this the editor would
 * go on dropping into the first tab while the author is looking at another.
 */
const instance = ref<{ activeTab?: string; goToTab?: (index: number) => void } | null>(null)
// Reported when the tab shown changes, not when the tabs do: a tab moved in the
// panel keeps its region, and the set follows it there (below).
watch(
	() => instance.value?.activeTab,
	(open) => {
		if (open === undefined) {
			return
		}
		const region = slotsOf(descriptor.value, props.block)[Number(open)]
		if (region) {
			builder.openRegion(props.path, region.id)
		}
	},
	{ immediate: true },
)

/**
 * And the other way round: a tab opened from the panel opens here too.
 *
 * Only the region asked for is watched, not the one shown, or a tab clicked on
 * the canvas would be sent back to the one the editor last held. A tab just
 * added is only rendered once the preview answers with it, so how many tabs
 * the rendered set has is watched too, and after the render.
 */
const renderedRegions = computed(() => {
	const optionPath = descriptor.value?.dynamicSlots?.optionPath
	const entries = optionPath ? options.value?.[optionPath] : undefined
	return Array.isArray(entries) ? entries.length : 0
})
watch(
	() =>
		[
			session.value.openRegions[props.path],
			slotsOf(descriptor.value, props.block).map((slot) => slot.id),
			instance.value,
			renderedRegions.value,
		] as const,
	([wanted, regions, shown]) => {
		const index = regions.indexOf(wanted ?? '')
		if (index !== -1 && shown?.goToTab && shown.activeTab !== String(index)) {
			shown.goToTab(index)
		}
	},
	{ flush: 'post' },
)

/**
 * The regions the block declares, each with what is attached to it.
 *
 * A stand-in has to answer for them itself: a container the preview has not
 * built lays no slotted child out at all, and a block just attached to a tab
 * would be missing from the canvas until the page compiles again — which is
 * exactly when a tab set stands in for itself.
 */
const regions = computed(() =>
	slotsOf(descriptor.value, props.block).map((slot) => ({
		...slot,
		children: slotted.value.filter((child) => child.block.slot === slot.id),
	})),
)
/**
 * Whether the block's own body holds nothing, and offers a way in. A tab set's
 * tabs are its body, so it has none of its own while it has a tab; a card's
 * head actions and footer are beside a body that still takes blocks.
 */
const bodyEmpty = computed(
	() =>
		!plain.value.length &&
		(!descriptor.value?.dynamicSlots || !regions.value.length),
)
/** Whether this block lays its own children out side by side. */
const inner = computed(() => isRowContainer(props.block.type))
/** Whether the editor wrote this block itself, rather than the user placing it. */
const structural = computed(() =>
	isStructural(session.value.catalog, props.block.type),
)

const dragging = computed(() => session.value.dragging !== null)
const target = computed(() => session.value.dropTarget)
/**
 * Whether the block being dragged would land in this one, as far as the user is
 * concerned: a row it would really land in belongs to the grid that wrote it,
 * and the grid is what the user put on the page.
 */
const receiving = computed(() => {
	const aimed = target.value
	if (!aimed) {
		return false
	}
	return (
		namedHost(session.value.catalog, session.value.draft, aimed.parent) ===
		props.path
	)
})
const refused = computed(() => target.value?.refusal !== undefined)
/**
 * Where the room opens when the drop is what builds the column holding it.
 *
 * A cell of a row has no place above or below it to open — that is what the
 * column is for — so the block shows the two of them inside itself, and the
 * column the drop writes is the one the user is already looking at.
 *
 * A refused target opens nothing: the border and its reason are the whole
 * answer, and room made for a block would say the drop is going to happen.
 */
const wrapGap = computed(() => {
	const wrap = refused.value ? undefined : target.value?.wrap
	if (wrap?.around !== props.path) {
		return undefined
	}
	return wrap.index === 0 ? 'before' : 'after'
})
	return {
		builder,
		session,
		descriptor,
		advanced,
		title,
		selected,
		hovered,
		missing,
		degraded,
		served,
		rendered,
		live,
		resolved,
		options,
		sourceKey,
		room,
		label,
		standInNote,
		children,
		held,
		slotted,
		plain,
		instance,
		renderedRegions,
		regions,
		bodyEmpty,
		inner,
		structural,
		dragging,
		target,
		receiving,
		refused,
		wrapGap,
	}
}

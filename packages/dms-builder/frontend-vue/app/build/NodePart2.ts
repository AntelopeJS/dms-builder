import { computed } from 'vue'
import { effectOfDrag, spansFullWidth } from '../runtime/dropping'
import { type Props } from './Node'
import type { useNodePart1 } from './NodePart1'

export function useNodePart2(scope: { props: Readonly<Props> } & ReturnType<typeof useNodePart1>) {
	const { props, builder, session, selected, hovered, missing, children, structural, dragging, target, receiving, refused } = scope

	/**
	 * The way that room runs: a band above or below the block for a column, a
	 * column beside it for the row a drop at its flank builds — the block giving up
	 * half its width, the way it will once the row is written.
	 */
	const wrapAxis = computed(() => target.value?.axis ?? 'horizontal')

	/**
	 * Structure answers for nothing a pointer does to it: it is what the canvas
	 * shows as nothing but what it holds. A click or a hover on it is one on
	 * whatever holds it, and there is nothing of it to carry.
	 */
	function onClick(event: MouseEvent): void {
		if (structural.value) {
			return
		}
		event.stopPropagation()
		builder.select(props.path)
	}

	/**
	 * Reached with Tab, a block is selected as a click would select it: the
	 * keyboard gets the same chip, the same settings and the same keys.
	 */
	function onFocus(event: FocusEvent): void {
		if (structural.value || event.target !== event.currentTarget) {
			return
		}
		if (session.value.selection !== props.path) {
			builder.select(props.path)
		}
	}

	function onMouseEnter(event: MouseEvent): void {
		if (structural.value) {
			return
		}
		event.stopPropagation()
		builder.hover(props.path)
	}
	/** Whether this block is the one being carried, and so no longer quite here. */
	const lifted = computed(() => session.value.dragging?.path === props.path)

	/**
	 * What the block's own border says, in the order the states matter: where a drop
	 * would land first, then what is selected, then what the pointer is over.
	 *
	 * Nothing else is drawn during a drag — an outline left over from before it
	 * would compete with the one target the user is aiming at.
	 */
	const frame = computed(() => {
		if (receiving.value) {
			// Dashed, so a refusal reads as one at a glance rather than as a target
			// drawn in another colour.
			return refused.value
				? 'outline outline-2 outline-dashed outline-error'
				: 'outline outline-2 outline-primary'
		}
		if (selected.value) {
			return 'outline outline-2 outline-primary shadow-(--dms-halo-accent)'
		}
		if (dragging.value) {
			return ''
		}
		if (hovered.value) {
			return 'outline outline-1 outline-(--dms-accent-line)'
		}
		return missing.value.length
			? 'outline outline-[1.5px] outline-dashed outline-warning'
			: ''
	})

	// The renderer sizes a grid from the spans its children declare, the same way
	// the host's recursive renderer does — and room opened among them is one more
	// column it has to divide its width by, or the block would land in a row that
	// has no column for it and the others would not give any width up.
	const childCount = computed(
		() =>
			children.value.reduce(
				(total, child) => total + (Number(child.block.meta?.colSpan) || 1),
				0,
			) + (gapInside.value ? 1 : 0),
	)
	/** Whether the room for the drop opens among this block's own children. */
	const gapInside = computed(() => {
		const aimed = target.value
		return (
			aimed !== null &&
			!aimed.refusal &&
			!aimed.wrap &&
			aimed.parent === props.path
		)
	})
	/**
	 * Placement the wrapper has to carry itself. The canvas wraps every block in a
	 * div of its own for selection and outlines, so that div — not the block — is
	 * what a grid lays out; a row's own `1 / -1` then applies inside the wrapper
	 * and the row ends up squeezed into a single column.
	 */
	const spanStyle = computed(() => {
		if (spansFullWidth(props.block.type)) {
			return { gridColumn: '1 / -1' }
		}
		const span = Number(props.block.meta?.colSpan)
		return span > 1 ? { gridColumn: `span ${span}` } : undefined
	})

	const pageId = computed(() => session.value.structure?.page.id ?? '')

	// Auto-imported from the host's own layer: the DMS titles its actions with
	// translation keys, `$table.actions.export`, read in the viewer's language.
	const { processI18n } = useTranslation()

	/**
	 * What the role the canvas is looked at as would not be shown of this block,
	 * drawn the way the DMS's own role preview draws it: a hidden block under a
	 * hatch, one with actions withheld marked on its edge. Only a lens — the
	 * block is still edited through it.
	 */
	const veil = computed(() => builder.veils.value[props.path])
	const veilLabel = computed(() => {
		switch (veil.value?.state) {
			case 'hidden':
				return `Hidden for ${builder.viewedAs.value?.name ?? 'this role'}`
			case 'readonly':
				return 'Read only'
			case 'limited':
				return 'Limited'
			default:
				return ''
		}
	})
	const veilDetail = computed(() =>
		veil.value && veil.value.state !== 'hidden'
			? `Withheld for this role: ${veil.value.withheld.map((title) => processI18n(title)).join(', ')}`
			: undefined,
	)

	function onDragStart(event: DragEvent): void {
		event.dataTransfer?.setData('text/plain', props.path)
		// See Library.vue: without an allowed effect the browser turns every drop
		// down before the page is asked. This one is a move, and saying `copyMove`
		// while the target answered `copy` had it drawing a copy that never happens.
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move'
		}
		// Measured now, while the block is still standing where it was: the room
		// opened for it wherever it is aimed is the room it actually takes up.
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
		builder.beginDrag({ path: props.path, height: box.height })
	}

	/**
	 * Read the pointer against the block it is over, on both axes.
	 *
	 * What each axis means is the module's to decide from the page's own shape — a
	 * cell of a row answers on all four of its sides, a block the page stacks only
	 * above and below — so the same gesture has to carry both. The innermost block
	 * under the pointer is the one that answers, hence the stopped propagation on
	 * the template's handler.
	 */
	function onDragOver(event: DragEvent): void {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
		builder.aimAt(props.path, {
			x: { start: box.left, size: box.width, at: event.clientX },
			y: { start: box.top, size: box.height, at: event.clientY },
		})
		answerCursor(event)
	}

	/**
	 * The cursor is the only refusal an author sees before letting go, so it has to
	 * say what the aim just decided rather than the browser's default — and it has
	 * to say it on `dragenter` too, which is where the browser first decides what
	 * to draw over an element it has just moved onto.
	 */
	function answerCursor(event: DragEvent): void {
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = refused.value
				? 'none'
				: effectOfDrag(session.value.dragging)
		}
	}
	return {
		wrapAxis,
		onClick,
		onFocus,
		onMouseEnter,
		lifted,
		frame,
		childCount,
		gapInside,
		spanStyle,
		pageId,
		processI18n,
		veil,
		veilLabel,
		veilDetail,
		onDragStart,
		onDragOver,
		answerCursor,
	}
}

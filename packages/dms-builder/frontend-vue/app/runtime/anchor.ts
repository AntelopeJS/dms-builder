import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export interface AnchorRect {
	top: number
	left: number
	width: number
	height: number
}

// The builder sits over the region a page occupies and leaves the dashboard's
// chrome — sidebar, header, breadcrumb — visible and usable. None of that is
// ours to reach into, so the box is measured rather than hardcoded: the DMS
// marks its content region, and a host that marks none falls back to the whole
// viewport.
const CONTENT_SELECTORS = [
	'[data-dms-page-content]',
	'main',
	'[role="main"]',
] as const

const SCROLLABLE = new Set(['auto', 'scroll', 'overlay'])

function fullViewport(): AnchorRect {
	return {
		top: 0,
		left: 0,
		width: globalThis.innerWidth ?? 0,
		height: globalThis.innerHeight ?? 0,
	}
}

function findContentElement(): Element | null {
	for (const selector of CONTENT_SELECTORS) {
		const element = document.querySelector(selector)
		if (element) {
			return element
		}
	}
	return null
}

/**
 * The content element is as tall as the page it holds, which may run well past
 * the viewport; what the overlay wants is the window that scrolls it. Walking up
 * to the nearest scrolling ancestor gives a box that stays put as the page
 * behind it moves.
 */
function measuredElement(): Element | null {
	let element = findContentElement()
	while (element && element !== document.body) {
		const overflow = getComputedStyle(element).overflowY
		if (SCROLLABLE.has(overflow)) {
			return element
		}
		element = element.parentElement
	}
	return findContentElement()
}

function clampToViewport(box: DOMRect): AnchorRect {
	const top = Math.max(box.top, 0)
	const bottom = Math.min(box.bottom, globalThis.innerHeight ?? box.bottom)
	return {
		top,
		left: Math.max(box.left, 0),
		width: box.width,
		height: Math.max(bottom - top, 0),
	}
}

function same(a: AnchorRect, b: AnchorRect): boolean {
	return (
		a.top === b.top &&
		a.left === b.left &&
		a.width === b.width &&
		a.height === b.height
	)
}

export function useContentAnchor(): Ref<AnchorRect> {
	const rect = ref<AnchorRect>(fullViewport())
	let resize: ResizeObserver | undefined
	let mutations: MutationObserver | undefined
	let observed: Element | null = null
	let frame = 0

	/**
	 * Follow the content element rather than the one that happened to be there
	 * at mount. A navigation replaces the page's DOM, so the element measured a
	 * moment ago is detached and the observer is watching a dead node — the
	 * overlay would keep the box of a page that is gone, or the viewport
	 * fallback from before the page had a layout at all.
	 */
	function follow(element: Element | null): void {
		if (element === observed) {
			return
		}
		resize?.disconnect()
		resize = undefined
		observed = element
		if (element && typeof ResizeObserver !== 'undefined') {
			resize = new ResizeObserver(scheduleMeasure)
			resize.observe(element)
		}
	}

	function measure(): void {
		const element = measuredElement()
		follow(element)
		const next = element
			? clampToViewport(element.getBoundingClientRect())
			: fullViewport()
		// Assigning an equal box would re-render the overlay, which is itself a
		// DOM change the mutation observer sees — an endless measure loop.
		if (!same(rect.value, next)) {
			rect.value = next
		}
	}

	function scheduleMeasure(): void {
		cancelAnimationFrame(frame)
		frame = requestAnimationFrame(measure)
	}

	onMounted(() => {
		measure()
		if (typeof MutationObserver !== 'undefined') {
			mutations = new MutationObserver(scheduleMeasure)
			mutations.observe(document.body, { childList: true, subtree: true })
		}
		globalThis.addEventListener('resize', scheduleMeasure)
		globalThis.addEventListener('scroll', scheduleMeasure, true)
	})

	onBeforeUnmount(() => {
		cancelAnimationFrame(frame)
		resize?.disconnect()
		mutations?.disconnect()
		globalThis.removeEventListener('resize', scheduleMeasure)
		globalThis.removeEventListener('scroll', scheduleMeasure, true)
	})

	return rect
}

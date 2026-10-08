/**
 * How the canvas shows the page: how close, and how wide.
 *
 * The canvas renders the real page between the side rail and the inspector,
 * narrower than the page will ever be shown; zooming out fits it back, and a
 * tablet or phone width shows how its grid folds. Neither changes the page —
 * a width previews the responsive layout, it does not make one per device.
 * The choice is the viewer's, remembered in their browser like the mode.
 */
import { computed, ref } from 'vue'

export type CanvasDevice = 'desktop' | 'tablet' | 'phone'

/** The zoom levels offered, in percent. */
export const CANVAS_ZOOMS = [100, 90, 80, 67, 50] as const

/** The width each device shows the page at; the desktop takes the canvas. */
export const DEVICE_WIDTHS: Record<CanvasDevice, number | undefined> = {
	desktop: undefined,
	tablet: 768,
	phone: 390,
}

export const DEVICE_LABELS: Record<CanvasDevice, string> = {
	desktop: 'Desktop',
	tablet: 'Tablet',
	phone: 'Phone',
}

const ZOOM_KEY = 'dms-builder:zoom'
const DEVICE_KEY = 'dms-builder:device'

function stored(key: string): string | null {
	try {
		return globalThis.localStorage?.getItem(key) ?? null
	} catch {
		return null
	}
}

function store(key: string, value: string): void {
	try {
		globalThis.localStorage?.setItem(key, value)
	} catch {
		// A browser refusing storage still switches; it only forgets next time.
	}
}

function rememberedZoom(): number {
	const value = Number(stored(ZOOM_KEY))
	return (CANVAS_ZOOMS as readonly number[]).includes(value) ? value : 100
}

function rememberedDevice(): CanvasDevice {
	const value = stored(DEVICE_KEY)
	return value === 'tablet' || value === 'phone' ? value : 'desktop'
}

const zoom = ref<number>(rememberedZoom())
const device = ref<CanvasDevice>(rememberedDevice())

function setZoom(next: number): void {
	zoom.value = next
	store(ZOOM_KEY, String(next))
}

function setDevice(next: CanvasDevice): void {
	device.value = next
	store(DEVICE_KEY, next)
}

/** The canvas's own label for what it shows: `80%`, `80% · Tablet`. */
const label = computed(() =>
	device.value === 'desktop'
		? `${zoom.value}%`
		: `${zoom.value}% · ${DEVICE_LABELS[device.value]}`,
)

export function useCanvasView() {
	return { zoom, device, label, setZoom, setDevice }
}

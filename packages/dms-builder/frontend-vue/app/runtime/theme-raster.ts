import { EMAIL_LOGO_HEIGHT, EMAIL_LOGO_MAX_WIDTH, EMAIL_LOGO_TYPES } from './constants'

const SVG_TYPE = 'image/svg+xml'
const PNG_TYPE = 'image/png'

/** The width and height an SVG declares on its root, else its `viewBox` size. */
const SVG_VIEW_BOX_ATTRIBUTE = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i
const SVG_WIDTH_ATTRIBUTE = /<svg[^>]*\swidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i
const SVG_HEIGHT_ATTRIBUTE = /<svg[^>]*\sheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i

/** Extensions of EMAIL_LOGO_TYPES, for a file the browser gives no type. */
const EMAIL_EXTENSION = /\.(?:png|jpe?g)$/i

export function isSvg(file: Pick<File, 'type' | 'name'>): boolean {
	return file.type === SVG_TYPE || file.name.toLowerCase().endsWith('.svg')
}

/**
 * PNG and JPEG are the only images every mail client shows: Gmail and Outlook
 * refuse SVG, and WebP or icons fare no better, so anything else is converted
 * to PNG.
 */
export function isMailable(file: Pick<File, 'type' | 'name'>): boolean {
	return file.type === '' ? EMAIL_EXTENSION.test(file.name) : EMAIL_LOGO_TYPES.includes(file.type)
}

/**
 * Width over height of an SVG, read from its text rather than from the image:
 * a browser gives an SVG without `width` and `height` a natural size of 0, or
 * a default box unrelated to the logo.
 */
export function svgAspect(text: string): number | undefined {
	const box = SVG_VIEW_BOX_ATTRIBUTE.exec(text)
	const width = Number(SVG_WIDTH_ATTRIBUTE.exec(text)?.[1] ?? box?.[1])
	const height = Number(SVG_HEIGHT_ATTRIBUTE.exec(text)?.[1] ?? box?.[2])
	return width > 0 && height > 0 ? width / height : undefined
}

/** The pixels a logo is drawn at for an email: a fixed height, within the column. */
export function emailLogoSize(aspect: number): { width: number; height: number } {
	const width = Math.min(Math.round(EMAIL_LOGO_HEIGHT * aspect), EMAIL_LOGO_MAX_WIDTH)
	return { width, height: Math.round(width / aspect) }
}

/**
 * Like emailLogoSize, but never larger than the bitmap itself: a 32-pixel icon
 * blown up to the header height is a blur, not a logo.
 */
export function emailRasterSize(width: number, height: number): { width: number; height: number } {
	const size = emailLogoSize(width / height)
	return size.height > height ? { width, height } : size
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error('The image could not be drawn.'))
		image.src = url
	})
}

/** An SVG scales to its declared aspect ratio; a bitmap is never upscaled. */
function emailSize(image: HTMLImageElement, svgText: string | undefined): { width: number; height: number } {
	const width = image.naturalWidth
	const height = image.naturalHeight
	if (svgText === undefined) {
		return emailRasterSize(width || 1, height || 1)
	}
	return emailLogoSize(svgAspect(svgText) ?? (width > 0 && height > 0 ? width / height : 1))
}

/**
 * Converts a logo mail clients cannot show (SVG, WebP, icon) to a PNG at
 * email-header size, 2x for dense screens. Returns undefined when the browser
 * cannot draw it.
 */
export async function rasterizeForEmail(file: File): Promise<File | undefined> {
	// Re-wrap the SVG text as image/svg+xml: a file picked without a type would
	// not load as an image.
	const svgText = isSvg(file) ? await file.text() : undefined
	const url = URL.createObjectURL(svgText === undefined ? file : new Blob([svgText], { type: SVG_TYPE }))
	try {
		const image = await loadImage(url)
		const { width, height } = emailSize(image, svgText)
		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, PNG_TYPE))
		const name = `${file.name.replace(/\.[^./]+$/, '')}.png`
		return blob ? new File([blob], name, { type: PNG_TYPE }) : undefined
	} catch {
		return undefined
	} finally {
		URL.revokeObjectURL(url)
	}
}

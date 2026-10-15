import { EMAIL_LOGO_HEIGHT, EMAIL_LOGO_MAX_WIDTH } from './constants'

const SVG_TYPE = 'image/svg+xml'
const PNG_TYPE = 'image/png'

/** The size an SVG declares on its root, or the box its `viewBox` draws. */
const VIEW_BOX = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i
const WIDTH = /<svg[^>]*\swidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i
const HEIGHT = /<svg[^>]*\sheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i

export function isSvg(file: Pick<File, 'type' | 'name'>): boolean {
	return file.type === SVG_TYPE || file.name.toLowerCase().endsWith('.svg')
}

/**
 * The width over the height an SVG is drawn at. Read from its text rather than
 * from the image: a browser gives an SVG without a `width` and a `height` a
 * natural size of nothing, or of a default box that says nothing of the logo.
 */
export function svgAspect(text: string): number | undefined {
	const box = VIEW_BOX.exec(text)
	const width = Number(WIDTH.exec(text)?.[1] ?? box?.[1])
	const height = Number(HEIGHT.exec(text)?.[1] ?? box?.[2])
	return width > 0 && height > 0 ? width / height : undefined
}

/** The pixels a logo is drawn at for an email: a fixed height, within the column. */
export function emailLogoSize(aspect: number): { width: number; height: number } {
	const width = Math.min(Math.round(EMAIL_LOGO_HEIGHT * aspect), EMAIL_LOGO_MAX_WIDTH)
	return { width, height: Math.round(width / aspect) }
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error('The SVG could not be drawn.'))
		image.src = url
	})
}

/**
 * The PNG an email carries in place of an SVG logo, which Gmail and Outlook do
 * not show: the logo drawn by the browser at the size an email header shows
 * it, twice over for dense screens. Answers nothing when the browser cannot
 * draw it.
 */
export async function rasterizeForEmail(file: File): Promise<File | undefined> {
	const text = await file.text()
	const url = URL.createObjectURL(new Blob([text], { type: SVG_TYPE }))
	try {
		const image = await loadImage(url)
		const aspect =
			svgAspect(text) ??
			(image.naturalWidth > 0 && image.naturalHeight > 0
				? image.naturalWidth / image.naturalHeight
				: 1)
		const size = emailLogoSize(aspect)
		const canvas = document.createElement('canvas')
		canvas.width = size.width
		canvas.height = size.height
		canvas.getContext('2d')?.drawImage(image, 0, 0, size.width, size.height)
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, PNG_TYPE))
		const name = `${file.name.replace(/\.svg$/i, '')}.png`
		return blob ? new File([blob], name, { type: PNG_TYPE }) : undefined
	} catch {
		return undefined
	} finally {
		URL.revokeObjectURL(url)
	}
}
